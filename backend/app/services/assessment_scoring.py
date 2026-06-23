# backend/app/services/assessment_scoring.py
"""Methodical Assessment Layer v1 — scoring.

Изчислява:
  • нормализиране на суровите резултати (0–100) спрямо норма или (cold-start)
    спрямо кохортата в прозореца;
  • Development Score за състезател (технически + физически под-индекс + делта);
  • Методически Индекс за отбор (приемане + дисциплина на измерване + развитие).

Базирано на реалната батерия: технически тестове (точки), бързина (секунди,
обратна посока), физически (см) и антропометрия (контекст — не се точкува).
Тегла и прагове са константи, за да може методическият комитет да ги настрои
без миграция.

Публичен интерфейс (ползва се от routers/assessments.py при finalize):
  • compute_session_scores(db, session)  — нормализира + upsert Development Score.
  • compute_team_methodical_index(db, team_id, window_id) — upsert Методически Индекс.
Двете НЕ commit-ват; извикващият (endpoint-ът) прави commit.
"""
from __future__ import annotations

import statistics
from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AssessmentNorm,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    ClubCycleInstance,
    DevelopmentScore,
    MethodicalIndexSnapshot,
    TeamMember,
    TestCategory,
    TestDefinition,
    TestDirection,
)

# --- Настройки (конфигурируеми от методическия комитет) ---
DEV_SCORE_WEIGHTS = {"technical": 0.5, "physical": 0.5}
METHODICAL_INDEX_WEIGHTS = {"adoption": 0.3, "discipline": 0.3, "development": 0.4}
Z_SCALE = 20.0  # точки на стандартно отклонение около средата (50)
NEUTRAL_SCORE = 50.0  # при липса на достатъчно данни
MIN_NORM_SAMPLE = 20  # под този брой проби нормата е „индикативна"
MIN_COHORT_SAMPLE = 2  # под този брой няма смислена кохортна статистика

# Категории, които влизат в под-индексите.
_TECHNICAL_CATS = {TestCategory.technical.value}
_PHYSICAL_CATS = {TestCategory.speed.value, TestCategory.physical.value}
_PHASE_ORDER = {"baseline": 0, "mid": 1, "endline": 2}


# =========================
# Помощни
# =========================
def _enum_value(v) -> str:
    return v.value if hasattr(v, "value") else v


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def age_band_from_birth_year(birth_year: Optional[int], ref_year: Optional[int] = None) -> Optional[str]:
    """Грубо U-band от година на раждане (за справка с нормите)."""
    if not birth_year:
        return None
    ref = ref_year or date.today().year
    age = ref - int(birth_year)
    if age <= 0 or age > 60:
        return None
    return f"U{age}"


def window_sort_key(window: AssessmentWindow) -> tuple:
    """Подреждане на прозорците: сезон, после фаза, после начална дата."""
    phase = _enum_value(window.phase)
    return (
        window.season or "",
        _PHASE_ORDER.get(phase, 99),
        window.start_date or date.min,
    )


def _weighted(parts: dict[str, Optional[float]], weights: dict[str, float]) -> Optional[float]:
    """Претеглена комбинация, която пренормализира теглата само върху наличните части."""
    num = 0.0
    wsum = 0.0
    for key, weight in weights.items():
        val = parts.get(key)
        if val is not None:
            num += weight * val
            wsum += weight
    if wsum == 0:
        return None
    return round(num / wsum, 1)


# =========================
# Нормализиране
# =========================
def _norm_lookup(
    db: Session, test_code: str, age_band: Optional[str], gender: Optional[str]
) -> Optional[AssessmentNorm]:
    if not age_band or not gender:
        return None
    return (
        db.query(AssessmentNorm)
        .filter(
            AssessmentNorm.test_code == test_code,
            AssessmentNorm.age_band == age_band,
            AssessmentNorm.gender == gender,
        )
        .first()
    )


def _cohort_stats(db: Session, window_id: int, test_code: str) -> tuple[Optional[float], Optional[float], int]:
    """Средно и (популационно) стандартно отклонение за тест в рамките на прозореца."""
    vals = [
        v
        for (v,) in (
            db.query(AssessmentResult.raw_value)
            .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
            .filter(
                AssessmentSession.window_id == window_id,
                AssessmentResult.test_code == test_code,
                AssessmentResult.raw_value.isnot(None),
            )
            .all()
        )
    ]
    n = len(vals)
    if n == 0:
        return None, None, 0
    mean = statistics.fmean(vals)
    std = statistics.pstdev(vals) if n >= 2 else 0.0
    return mean, std, n


def _normalize_raw(raw: float, direction: str, mean: float, std: float) -> float:
    """Map сурова стойност към 0–100 чрез z-оценка, съобразена с посоката."""
    if std <= 0:
        return NEUTRAL_SCORE
    z = (raw - mean) / std
    if direction == TestDirection.lower_better.value:
        z = -z  # по-малко = по-добре (напр. бързина)
    return round(_clamp(NEUTRAL_SCORE + Z_SCALE * z), 1)


def normalize_session_results(db: Session, session: AssessmentSession) -> None:
    """Изчислява `normalized` и `is_indicative` за всеки резултат в сесията.

    Антропометрията и context-показателите се пропускат (не се точкуват).
    Прави flush (без commit).

    Изборът на нормативен източник е делегиран на `NormResolver` (ADR-002):
    тук остава само нормализацията (raw + norm → 0–100) и пропускането на
    неточкуемите показатели. Поведението е идентично с предишната версия.
    """
    # Локален import, за да се избегне цикъл (резолверът зависи от този модул).
    from app.services.norm_resolver import NormResolver

    rows = (
        db.query(AssessmentResult, TestDefinition)
        .join(TestDefinition, TestDefinition.code == AssessmentResult.test_code)
        .filter(AssessmentResult.session_id == session.id)
        .all()
    )

    # Batch-load на атлетите (избягва N+1 заявка за всеки резултат).
    athlete_ids = {result.athlete_id for result, _ in rows}
    athletes_map = (
        {a.id: a for a in db.query(Athlete).filter(Athlete.id.in_(athlete_ids)).all()}
        if athlete_ids
        else {}
    )

    resolver = NormResolver(db, session.window_id)

    for result, test_def in rows:
        direction = _enum_value(test_def.direction)
        category = _enum_value(test_def.category)

        if category == TestCategory.anthropometry.value or direction == TestDirection.context.value:
            result.normalized = None
            result.is_indicative = True
            result.norm_source = None
            result.norm_confidence = None
            result.norm_explanation = None
            continue

        if result.raw_value is None:
            result.normalized = None
            result.is_indicative = True
            result.norm_source = None
            result.norm_confidence = None
            result.norm_explanation = None
            continue

        athlete = athletes_map.get(result.athlete_id)
        age_band = age_band_from_birth_year(getattr(athlete, "birth_year", None)) if athlete else None
        gender = getattr(athlete, "gender", None) if athlete else None

        resolved = resolver.resolve(test_def.code, age_band, gender)
        if resolved.applicable:
            if resolved.band_anchors is not None:
                # Референтен слой по нива (2022) — оценка директно от опорни точки.
                from app.national_method.national_norms_2022 import score_from_anchors

                result.normalized = score_from_anchors(result.raw_value, resolved.band_anchors)
            else:
                result.normalized = _normalize_raw(
                    result.raw_value, direction, resolved.mean, resolved.std
                )
        else:
            result.normalized = NEUTRAL_SCORE
        result.is_indicative = resolved.is_indicative
        # Адитивни метаданни (ADR-002) — не влияят на score/is_indicative.
        result.norm_source = resolved.source
        result.norm_confidence = resolved.confidence
        result.norm_explanation = resolved.explanation

    db.flush()


# =========================
# Development Score
# =========================
def _previous_window_score(db: Session, athlete_id: int, current_window: AssessmentWindow) -> Optional[float]:
    """Development Score от най-близкия предходен прозорец (за делта)."""
    rows = (
        db.query(DevelopmentScore, AssessmentWindow)
        .join(AssessmentWindow, AssessmentWindow.id == DevelopmentScore.window_id)
        .filter(
            DevelopmentScore.athlete_id == athlete_id,
            DevelopmentScore.window_id != current_window.id,
            DevelopmentScore.development_score.isnot(None),
        )
        .all()
    )
    current_key = window_sort_key(current_window)
    previous = [
        (window_sort_key(w), s.development_score) for (s, w) in rows if window_sort_key(w) < current_key
    ]
    if not previous:
        return None
    previous.sort(key=lambda item: item[0])
    return previous[-1][1]


def compute_development_score(db: Session, athlete_id: int, window: AssessmentWindow) -> dict:
    """Под-индекси + общ Development Score + делта за състезател в даден прозорец."""
    rows = (
        db.query(AssessmentResult.normalized, TestDefinition.category)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(TestDefinition, TestDefinition.code == AssessmentResult.test_code)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.athlete_id == athlete_id,
            AssessmentResult.normalized.isnot(None),
        )
        .all()
    )

    technical_vals = [n for (n, cat) in rows if _enum_value(cat) in _TECHNICAL_CATS]
    physical_vals = [n for (n, cat) in rows if _enum_value(cat) in _PHYSICAL_CATS]

    technical_subindex = round(statistics.fmean(technical_vals), 1) if technical_vals else None
    physical_subindex = round(statistics.fmean(physical_vals), 1) if physical_vals else None

    development_score = _weighted(
        {"technical": technical_subindex, "physical": physical_subindex},
        DEV_SCORE_WEIGHTS,
    )

    delta = None
    if development_score is not None:
        prev = _previous_window_score(db, athlete_id, window)
        if prev is not None:
            delta = round(development_score - prev, 1)

    return {
        "technical_subindex": technical_subindex,
        "physical_subindex": physical_subindex,
        "development_score": development_score,
        "delta": delta,
    }


def _upsert_development_score(db: Session, athlete_id: int, window_id: int, parts: dict) -> DevelopmentScore:
    row = (
        db.query(DevelopmentScore)
        .filter(DevelopmentScore.athlete_id == athlete_id, DevelopmentScore.window_id == window_id)
        .first()
    )
    if row is None:
        row = DevelopmentScore(athlete_id=athlete_id, window_id=window_id)
        db.add(row)
    row.technical_subindex = parts.get("technical_subindex")
    row.physical_subindex = parts.get("physical_subindex")
    row.development_score = parts.get("development_score")
    row.delta = parts.get("delta")
    return row


def compute_session_scores(db: Session, session: AssessmentSession) -> int:
    """Нормализира резултатите и upsert-ва Development Score за всеки състезател
    с резултати в сесията. Връща броя оценени състезатели. Не commit-ва (flush).
    """
    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == session.window_id).first()
    if window is None:
        return 0

    normalize_session_results(db, session)

    athlete_ids = [
        a
        for (a,) in db.query(AssessmentResult.athlete_id)
        .filter(AssessmentResult.session_id == session.id)
        .distinct()
        .all()
    ]
    for athlete_id in athlete_ids:
        parts = compute_development_score(db, athlete_id, window)
        _upsert_development_score(db, athlete_id, window.id, parts)

    db.flush()
    return len(athlete_ids)


# =========================
# Методически Индекс (отбор)
# =========================
def _team_adoption(db: Session, team_id: int) -> float:
    """Приемане (proxy): има ли активна годишна програма (ClubCycleInstance) за отбора."""
    has_cycle = (
        db.query(ClubCycleInstance.id)
        .filter(ClubCycleInstance.team_id == team_id, ClubCycleInstance.status == "active")
        .first()
        is not None
    )
    return 100.0 if has_cycle else 0.0


def compute_team_methodical_index(db: Session, team_id: int, window_id: int) -> dict:
    """Изчислява и upsert-ва Методическия Индекс за отбор в прозорец.

    Три компонента (0–100):
      • приемане    — има ли активна годишна програма за отбора (булев proxy);
      • дисциплина  — дял тествани от активния състав;
      • развитие    — средна делта (или средно ниво при baseline).
    Не commit-ва (flush).
    """
    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == window_id).first()
    if window is None:
        return {}

    # Състезатели с резултати за този отбор в този прозорец (явен списък — без
    # вложени подзаявки, по-четимо за v1).
    athlete_ids = [
        a
        for (a,) in db.query(AssessmentResult.athlete_id)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(
            AssessmentSession.team_id == team_id,
            AssessmentSession.window_id == window_id,
        )
        .distinct()
        .all()
    ]

    roster = (
        db.query(func.count(TeamMember.id))
        .filter(TeamMember.team_id == team_id, TeamMember.is_active.is_(True))
        .scalar()
        or 0
    )
    tested = len(athlete_ids)
    discipline = round(min(tested / roster, 1.0) * 100, 1) if roster > 0 else None
    adoption = _team_adoption(db, team_id)

    dev_rows = (
        db.query(DevelopmentScore)
        .filter(
            DevelopmentScore.window_id == window_id,
            DevelopmentScore.athlete_id.in_(athlete_ids),
        )
        .all()
        if athlete_ids
        else []
    )
    deltas = [r.delta for r in dev_rows if r.delta is not None]
    levels = [r.development_score for r in dev_rows if r.development_score is not None]
    if deltas:
        development = round(_clamp(NEUTRAL_SCORE + statistics.fmean(deltas)), 1)
    elif levels:
        development = round(statistics.fmean(levels), 1)
    else:
        development = None

    parts = {
        "adoption": adoption,
        "measurement_discipline": discipline,
        "development": development,
        "methodical_index": _weighted(
            {"adoption": adoption, "discipline": discipline, "development": development},
            METHODICAL_INDEX_WEIGHTS,
        ),
    }

    _upsert_methodical_index(db, "team", team_id, window_id, parts)
    db.flush()
    return parts


def _upsert_methodical_index(
    db: Session, subject_type: str, subject_id: Optional[int], window_id: int, parts: dict
) -> MethodicalIndexSnapshot:
    row = (
        db.query(MethodicalIndexSnapshot)
        .filter(
            MethodicalIndexSnapshot.subject_type == subject_type,
            MethodicalIndexSnapshot.subject_id == subject_id,
            MethodicalIndexSnapshot.window_id == window_id,
        )
        .first()
    )
    if row is None:
        row = MethodicalIndexSnapshot(
            subject_type=subject_type, subject_id=subject_id, window_id=window_id
        )
        db.add(row)
    row.adoption = parts.get("adoption")
    row.measurement_discipline = parts.get("measurement_discipline")
    row.development = parts.get("development")
    row.methodical_index = parts.get("methodical_index")
    return row
