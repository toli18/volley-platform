# backend/app/services/assessment_dashboard.py
"""Methodical Assessment Layer v1 — федеративно табло (агрегации).

Връща 6-те национални плочки **само агрегирано**, без лични данни на дете:
  1. Покритие              — обхват на диагностиката (атлети/отбори).
  2. Развитие по възраст    — средна делта/ниво по U-група.
  3. Приемане               — дял отбори с активна годишна програма.
  4. Национални репери      — средна сурова стойност по тест × възраст × пол.
  5. Лидери и риск          — топ/долни отбори по Методически Индекс (отборно ниво).
  6. Дисциплина на измерване — среден дял тествани от състава.

Малките проби се маркират с `is_indicative=True`, за да не се вадят
прибързани изводи (виж най-рисковата част в DEV_PLAN — cold-start).
Само четене; не пише в базата.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    ClubCycleInstance,
    DevelopmentScore,
    MethodicalIndexSnapshot,
    Team,
    TestDefinition,
)
from app.services.assessment_scoring import (
    age_band_from_birth_year,
    window_sort_key,
)

# Прагове за етикета „индикативни данни".
MIN_TILE_SAMPLE = 5  # под този брой плочката е индикативна
MIN_NORM_SAMPLE = 20  # националните репери искат повече проби
LEADERS_LIMIT = 5


def _avg(values: list[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(statistics.fmean(vals), 1)


def resolve_window(db: Session, window_id: Optional[int]) -> Optional[AssessmentWindow]:
    """Връща явно подадения прозорец или последния (по сезон/фаза) с резултати."""
    if window_id is not None:
        return db.query(AssessmentWindow).filter(AssessmentWindow.id == window_id).first()

    windows = db.query(AssessmentWindow).all()
    if not windows:
        return None
    # Само прозорци, които имат поне един резултат.
    with_data = {
        w_id
        for (w_id,) in db.query(AssessmentSession.window_id)
        .join(AssessmentResult, AssessmentResult.session_id == AssessmentSession.id)
        .distinct()
        .all()
    }
    candidates = [w for w in windows if w.id in with_data] or windows
    candidates.sort(key=window_sort_key)
    return candidates[-1]


def _window_label(window: AssessmentWindow) -> str:
    phase = window.phase.value if hasattr(window.phase, "value") else window.phase
    phase_bg = {"baseline": "Входящо", "mid": "Междинно", "endline": "Изходящо"}.get(phase, phase)
    return f"{window.season} · {phase_bg}"


# =========================
# Плочки
# =========================
def _coverage(db: Session, window: AssessmentWindow, gender: Optional[str]) -> dict:
    tested_q = (
        db.query(AssessmentResult.athlete_id)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(AssessmentSession.window_id == window.id)
    )
    tested_ids = {a for (a,) in tested_q.distinct().all()}

    teams_tested = {
        t
        for (t,) in db.query(AssessmentSession.team_id)
        .filter(AssessmentSession.window_id == window.id)
        .distinct()
        .all()
    }

    athletes_total_q = db.query(func.count(Athlete.id)).filter(Athlete.is_active.is_(True))
    if gender:
        athletes_total_q = athletes_total_q.filter(Athlete.gender == gender)
    athletes_total = athletes_total_q.scalar() or 0

    teams_total = (
        db.query(func.count(Team.id)).filter(Team.is_active.is_(True)).scalar() or 0
    )

    athletes_tested = len(tested_ids)
    coverage_pct = (
        round(min(athletes_tested / athletes_total, 1.0) * 100, 1)
        if athletes_total > 0
        else None
    )
    return {
        "athletes_tested": athletes_tested,
        "athletes_total": athletes_total,
        "teams_tested": len(teams_tested),
        "teams_total": teams_total,
        "coverage_pct": coverage_pct,
        "is_indicative": athletes_tested < MIN_TILE_SAMPLE,
    }


def _development_by_age(
    db: Session, window: AssessmentWindow, gender: Optional[str], age_band: Optional[str]
) -> list[dict]:
    rows = (
        db.query(
            DevelopmentScore.development_score,
            DevelopmentScore.delta,
            Athlete.birth_year,
            Athlete.gender,
        )
        .join(Athlete, Athlete.id == DevelopmentScore.athlete_id)
        .filter(DevelopmentScore.window_id == window.id)
        .all()
    )

    buckets: dict[str, dict[str, list]] = defaultdict(lambda: {"scores": [], "deltas": []})
    for score, delta, birth_year, ath_gender in rows:
        if gender and ath_gender != gender:
            continue
        band = age_band_from_birth_year(birth_year) or "—"
        if age_band and band != age_band:
            continue
        buckets[band]["scores"].append(score)
        buckets[band]["deltas"].append(delta)

    out = []
    for band, data in buckets.items():
        sample = len([s for s in data["scores"] if s is not None])
        out.append(
            {
                "age_band": band,
                "avg_delta": _avg(data["deltas"]),
                "avg_score": _avg(data["scores"]),
                "sample": sample,
                "is_indicative": sample < MIN_TILE_SAMPLE,
            }
        )
    out.sort(key=lambda r: r["age_band"])
    return out


def _adoption(db: Session, window: AssessmentWindow) -> dict:
    snaps = (
        db.query(MethodicalIndexSnapshot.adoption)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
        )
        .all()
    )
    adoptions = [a for (a,) in snaps if a is not None]
    teams_with_program = len([a for a in adoptions if a >= 100.0])
    # Резерв: ако още няма snapshot-и, броим директно активните програми.
    if not adoptions:
        teams_with_program = (
            db.query(func.count(func.distinct(ClubCycleInstance.team_id)))
            .filter(ClubCycleInstance.status == "active")
            .scalar()
            or 0
        )
    teams_total = db.query(func.count(Team.id)).filter(Team.is_active.is_(True)).scalar() or 0
    return {
        "avg_adoption": _avg(adoptions),
        "teams_with_program": teams_with_program,
        "teams_total": teams_total,
        "is_indicative": len(adoptions) < MIN_TILE_SAMPLE,
    }


def _norms(
    db: Session, window: AssessmentWindow, gender: Optional[str], age_band: Optional[str]
) -> list[dict]:
    rows = (
        db.query(
            AssessmentResult.test_code,
            AssessmentResult.raw_value,
            Athlete.birth_year,
            Athlete.gender,
        )
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.raw_value.isnot(None),
        )
        .all()
    )

    test_names = {
        code: name for (code, name) in db.query(TestDefinition.code, TestDefinition.name).all()
    }

    buckets: dict[tuple, list[float]] = defaultdict(list)
    for test_code, raw_value, birth_year, ath_gender in rows:
        if gender and ath_gender != gender:
            continue
        band = age_band_from_birth_year(birth_year) or "—"
        if age_band and band != age_band:
            continue
        g = ath_gender or "—"
        buckets[(test_code, band, g)].append(raw_value)

    out = []
    for (test_code, band, g), values in buckets.items():
        sample = len(values)
        out.append(
            {
                "test_code": test_code,
                "test_name": test_names.get(test_code, test_code),
                "age_band": band,
                "gender": g,
                "mean_value": round(statistics.fmean(values), 2) if values else None,
                "sample": sample,
                "is_indicative": sample < MIN_NORM_SAMPLE,
            }
        )
    out.sort(key=lambda r: (r["test_code"], r["age_band"], r["gender"]))
    return out


def _leaders_risk(db: Session, window: AssessmentWindow) -> dict:
    rows = (
        db.query(MethodicalIndexSnapshot.subject_id, MethodicalIndexSnapshot.methodical_index, Team.name)
        .join(Team, Team.id == MethodicalIndexSnapshot.subject_id)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
            MethodicalIndexSnapshot.methodical_index.isnot(None),
        )
        .all()
    )
    ranked = sorted(rows, key=lambda r: r[1], reverse=True)

    def _row(item):
        return {"team_id": item[0], "team_name": item[2], "methodical_index": item[1]}

    leaders = [_row(r) for r in ranked[:LEADERS_LIMIT]]
    risk = [_row(r) for r in ranked[-LEADERS_LIMIT:][::-1]] if len(ranked) > LEADERS_LIMIT else []
    return {"leaders": leaders, "risk": risk}


def _discipline(db: Session, window: AssessmentWindow) -> dict:
    snaps = (
        db.query(MethodicalIndexSnapshot.measurement_discipline)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
        )
        .all()
    )
    vals = [d for (d,) in snaps if d is not None]
    return {
        "avg_discipline": _avg(vals),
        "sample": len(vals),
        "is_indicative": len(vals) < MIN_TILE_SAMPLE,
    }


# =========================
# Публичен интерфейс
# =========================
def build_federation_dashboard(
    db: Session,
    window_id: Optional[int] = None,
    gender: Optional[str] = None,
    age_band: Optional[str] = None,
) -> dict:
    filters = {"gender": gender, "age_band": age_band}
    window = resolve_window(db, window_id)
    if window is None:
        return {
            "window_id": None,
            "window_label": None,
            "filters": filters,
        }

    return {
        "window_id": window.id,
        "window_label": _window_label(window),
        "coverage": _coverage(db, window, gender),
        "development_by_age": _development_by_age(db, window, gender, age_band),
        "adoption": _adoption(db, window),
        "norms": _norms(db, window, gender, age_band),
        "leaders_risk": _leaders_risk(db, window),
        "discipline": _discipline(db, window),
        "filters": filters,
    }
