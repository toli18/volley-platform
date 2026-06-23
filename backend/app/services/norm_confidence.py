# backend/app/services/norm_confidence.py
"""Norm Confidence Engine (ADR-003, Стъпка 2) — ЧИСТ модул.

Дефинира жизнения цикъл на норма (Maturity) и изчислява доверие (Confidence)
като **чисти функции върху in-memory структури**. Няма достъп до БД, няма IO,
няма импорти от модели/router/scoring. Модулът все още НЕ е закачен никъде —
въвеждането му не променя текущото поведение на системата.

Съдържание:
  • MaturityLevel   — SEED → PROVISIONAL → VALIDATED → MATURE
  • ConfidenceLevel — HIGH / MEDIUM / LOW / INDICATIVE
  • NormSourceType  — категории източници (за eligibility/confidence правила)
  • ConfidenceThresholds — конфигурируеми прагове (методически комитет)
  • NormEvidence    — входна in-memory структура
  • чисти функции:  classify_maturity, evaluate_confidence,
                    is_eligible_for_resolution

Стойностите на ConfidenceLevel съвпадат с `NormConfidence` в `norm_resolver`,
за да е безшевна бъдещата интеграция (виж integration plan в ADR-003).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


# =========================
# Нива
# =========================
class MaturityLevel:
    """Жизнен цикъл на норма за клетка (test × age × gender [× scope])."""

    SEED = "seed"  # външен репер или недостатъчно данни
    PROVISIONAL = "provisional"  # първи реални данни, под праг за доверие
    VALIDATED = "validated"  # значима извадка, прилично покритие
    MATURE = "mature"  # голяма извадка, ≥2 сезона, широко покритие


class ConfidenceLevel:
    """Ниво на доверие (съвпада с NormConfidence в norm_resolver)."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INDICATIVE = "indicative"


class NormSourceType:
    """Категории нормативни източници (концептуални)."""

    SEED = "seed"
    HISTORICAL = "historical"
    FEDERATION = "federation"
    NATIONAL = "national"
    REGIONAL = "regional"
    CLUB = "club"
    COHORT = "cohort"
    NEUTRAL = "neutral"


# Подреждане (за сравнения и „cap" на нива).
_MATURITY_ORDER = {
    MaturityLevel.SEED: 0,
    MaturityLevel.PROVISIONAL: 1,
    MaturityLevel.VALIDATED: 2,
    MaturityLevel.MATURE: 3,
}
_CONFIDENCE_ORDER = {
    ConfidenceLevel.INDICATIVE: 0,
    ConfidenceLevel.LOW: 1,
    ConfidenceLevel.MEDIUM: 2,
    ConfidenceLevel.HIGH: 3,
}

# Семантични групи източници.
_EXTERNAL_REFERENCE = frozenset({NormSourceType.SEED, NormSourceType.HISTORICAL})
_DATA_DERIVED = frozenset({NormSourceType.NATIONAL, NormSourceType.REGIONAL, NormSourceType.CLUB})


# =========================
# Прагове (конфигурируеми)
# =========================
@dataclass(frozen=True)
class ConfidenceThresholds:
    """Прагове за узряване/доверие. Дефолтите са разумни начални стойности и
    подлежат на настройка от методическия комитет без промяна на логиката."""

    n_min: int = 30  # под този брой — недостатъчно (SEED-tier)
    n_validated: int = 150  # за VALIDATED / MEDIUM
    n_high: int = 300  # за MATURE / HIGH
    coverage_min: float = 0.34  # ≈ 2 от 6 региона
    coverage_high: float = 0.66  # ≈ 4 от 6 региона
    seasons_for_mature: int = 2


DEFAULT_THRESHOLDS = ConfidenceThresholds()


# =========================
# Вход
# =========================
@dataclass(frozen=True)
class NormEvidence:
    """In-memory доказателства за една норма/клетка.

    `coverage` е дял 0.0–1.0 (представителност). `maturity_level` е по избор —
    ако липсва, се изчислява от данните чрез `classify_maturity`.
    """

    source_type: str
    sample_size: int = 0
    coverage: float = 0.0
    season_count: int = 0
    maturity_level: Optional[str] = None


# =========================
# Помощни (чисти)
# =========================
def maturity_rank(level: Optional[str]) -> int:
    return _MATURITY_ORDER.get(level or MaturityLevel.SEED, 0)


def confidence_rank(level: str) -> int:
    return _CONFIDENCE_ORDER.get(level, 0)


def _cap(level: str, ceiling: str) -> str:
    """Връща по-ниското от двете нива на доверие."""
    return level if confidence_rank(level) <= confidence_rank(ceiling) else ceiling


# =========================
# Чисти функции
# =========================
def classify_maturity(
    sample_size: int,
    season_count: int,
    coverage: float,
    thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
) -> str:
    """Определя maturity ниво за **данни-производна** норма от наличните данни.

    Под `n_min` нормата не е достатъчна → остава SEED-tier (не PROVISIONAL).
    """
    t = thresholds
    if (
        sample_size >= t.n_high
        and season_count >= t.seasons_for_mature
        and coverage >= t.coverage_high
    ):
        return MaturityLevel.MATURE
    if sample_size >= t.n_validated and coverage >= t.coverage_min:
        return MaturityLevel.VALIDATED
    if sample_size >= t.n_min:
        return MaturityLevel.PROVISIONAL
    return MaturityLevel.SEED


def evaluate_confidence(
    evidence: NormEvidence,
    thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
) -> str:
    """Изчислява ниво на доверие по формалните правила на ADR-003 §4.

    Приоритетно отгоре надолу; накрая се прилага „coverage cap" за
    данни-производните източници (защита от регионален bias).
    """
    t = thresholds
    src = evidence.source_type

    # 1) Външни репери — винаги индикативни (неваладирани от наши данни).
    if src in _EXTERNAL_REFERENCE:
        return ConfidenceLevel.INDICATIVE
    # 2) Неутрален — няма база.
    if src == NormSourceType.NEUTRAL:
        return ConfidenceLevel.INDICATIVE
    # 3) Кохорта — относителна позиция, не норма.
    if src == NormSourceType.COHORT:
        return ConfidenceLevel.LOW
    # 4) Федерация — официална норма → поне MEDIUM (вдига се само при данни).
    if src == NormSourceType.FEDERATION:
        return ConfidenceLevel.MEDIUM

    # 5) Данни-производни (national/regional/club) — по maturity + прагове.
    maturity = evidence.maturity_level or classify_maturity(
        evidence.sample_size, evidence.season_count, evidence.coverage, t
    )

    if (
        maturity == MaturityLevel.MATURE
        and evidence.sample_size >= t.n_high
        and evidence.season_count >= t.seasons_for_mature
        and evidence.coverage >= t.coverage_high
    ):
        level = ConfidenceLevel.HIGH
    elif (
        maturity_rank(maturity) >= _MATURITY_ORDER[MaturityLevel.VALIDATED]
        and evidence.sample_size >= t.n_validated
        and evidence.coverage >= t.coverage_min
    ):
        level = ConfidenceLevel.MEDIUM
    elif evidence.sample_size >= t.n_min:
        level = ConfidenceLevel.LOW
    else:
        level = ConfidenceLevel.INDICATIVE

    # Coverage cap: тясно покритие не може да дава високо доверие.
    if evidence.coverage < t.coverage_min:
        level = _cap(level, ConfidenceLevel.LOW)
    return level


def is_eligible_for_resolution(source_type: str, maturity_level: Optional[str]) -> bool:
    """Може ли този източник да бъде избран от Resolver-а като активна норма.

    Правила:
      • външни репери (seed/historical) и федеративни норми — винаги избираеми
        (като референтни/официални, в съответната им приоритетна позиция);
      • данни-производни (national/regional/club) — само при maturity ≥ PROVISIONAL;
      • cohort/neutral — НЕ са maturity-gated норми (резолверът ги ползва като
        fallback извън този гейт) → връща False.
    """
    if source_type in _EXTERNAL_REFERENCE or source_type == NormSourceType.FEDERATION:
        return True
    if source_type in _DATA_DERIVED:
        return maturity_rank(maturity_level) >= _MATURITY_ORDER[MaturityLevel.PROVISIONAL]
    return False
