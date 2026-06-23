# backend/app/services/norm_resolver.py
"""Norm Resolver (ADR-002) — Phase 1, norm-ready инфраструктура.

Капсулира **избора на нормативен източник** за една клетка
(`test_code × age_band × gender`), който досега беше вграден в
`normalize_session_results`. Резолверът НЕ изчислява оценка — само избира
норма и я описва (source/confidence/explanation/стойности). Самата
нормализация (raw + norm → 0–100) остава в `assessment_scoring`.

ВАЖНО (Phase 1): тази първа версия възпроизвежда ТЕКУЩОТО поведение 1:1.
  • приоритет: AssessmentNorm (ако sample_count ≥ MIN_NORM_SAMPLE) → cohort → neutral;
  • не въвежда нови източници (national/federation/seed/historical) — те са
    запазени за следваща фаза и засега никога не се избират;
  • не чете нормативни данни извън съществуващата `AssessmentNorm` таблица.

Йерархията от ADR-002 (National → Federation → Seed → Historical → Cohort →
Neutral) ще се „събуди" в следваща фаза; днес горните слоеве нямат данни и
резолверът пада на Cohort — точно както системата работи сега.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

# Преизползваме съществуващите помощници и прагове, за да гарантираме
# идентично поведение. Тези символи са частни за scoring и не се ползват
# другаде, така че няма риск от разминаване.
from app.services.assessment_scoring import (
    MIN_COHORT_SAMPLE,
    MIN_NORM_SAMPLE,
    _cohort_stats,
    _norm_lookup,
)
# ADR-003 Стъпка 3: централизирана оценка на доверие/eligibility.
from app.services import norm_confidence as nc
# Официални репери от националното тестване 2022 (външен референтен слой).
from app.national_method import national_norms_2022 as nn2022


class NormSource:
    """Откъде идва избраната норма. Phase 1 ползва само първите три."""

    ASSESSMENT_NORM = "assessment_norm"  # съществуваща AssessmentNorm (узряла норма)
    NATIONAL_2022 = "national_2022"  # официален репер от националното тестване 2022
    COHORT = "cohort"  # относителна спрямо кохортата в прозореца
    NEUTRAL = "neutral"  # няма достатъчно данни → неутрална оценка
    # Запазени за следваща фаза (ADR-002), засега не се връщат:
    NATIONAL = "national"
    FEDERATION = "federation"
    SEED = "seed"
    HISTORICAL = "historical"


# ADR-003 Стъпка 3: един източник на истина за нивата на доверие — Confidence
# Engine-ът. `NormConfidence` остава като alias за обратна съвместимост.
NormConfidence = nc.ConfidenceLevel

# Нивата, при които резултатът се счита за „индикативен" (за обратна
# съвместимост с `AssessmentResult.is_indicative`).
_INDICATIVE_LEVELS = frozenset({nc.ConfidenceLevel.LOW, nc.ConfidenceLevel.INDICATIVE})

# Мап от `AssessmentNorm.source` към концептуалния тип за Confidence Engine.
_SOURCE_TYPE_MAP = {
    "seed": nc.NormSourceType.SEED,
    "computed": nc.NormSourceType.NATIONAL,
}


def _map_norm_source(source: Optional[str]) -> str:
    return _SOURCE_TYPE_MAP.get(source or "computed", nc.NormSourceType.NATIONAL)


@dataclass(frozen=True)
class ResolvedNorm:
    """Резултат от резолюцията на норма за една клетка.

    Носи стойностите за нормализация (`mean`/`std`) плюс метаданни
    (source/confidence/explanation/sample_size). `applicable=False` означава,
    че няма база за оценка и извикващият трябва да ползва неутрална стойност.
    """

    source: str
    confidence: str
    applicable: bool
    mean: Optional[float] = None
    std: Optional[float] = None
    sample_size: int = 0
    explanation: str = ""
    # Алтернативен начин на оценяване: ако е зададено, оценката 0–100 се смята
    # директно от опорни точки (raw→score), а не чрез mean/std z-оценка. Ползва
    # се от референтния слой 2022, чиито нива (Незадоволително…Отлично) са
    # абсолютна скала, а не разпределение със средно/отклонение.
    band_anchors: Optional[list[tuple[float, float]]] = None

    @property
    def is_indicative(self) -> bool:
        """Обратно-съвместимо мапване към стария булев флаг."""
        return self.confidence in _INDICATIVE_LEVELS


class NormResolver:
    """Избира нормативен източник за клетка в рамките на даден прозорец.

    Конструира се веднъж на сесия/прозорец и кешира кохортната статистика по
    тест (както досегашният `cohort_cache`), за да избегне повторни заявки.
    """

    def __init__(self, db: Session, window_id: int) -> None:
        self.db = db
        self.window_id = window_id
        self._cohort_cache: dict[str, tuple[Optional[float], Optional[float], int]] = {}

    def resolve(
        self, test_code: str, age_band: Optional[str], gender: Optional[str]
    ) -> ResolvedNorm:
        """Връща избраната норма за клетката. Не променя БД, не смята оценка."""
        # 1) Узряла AssessmentNorm (днес единственото реално ниво над cohort).
        norm = _norm_lookup(self.db, test_code, age_band, gender)
        if norm is not None and self._norm_eligible(norm):
            return ResolvedNorm(
                source=NormSource.ASSESSMENT_NORM,
                confidence=self._norm_confidence(norm),
                applicable=True,
                mean=norm.mean_value,
                std=norm.std_value,
                sample_size=int(norm.sample_count or 0),
                explanation=(
                    f"Норма от батерията за {age_band}/{gender} "
                    f"(n={int(norm.sample_count or 0)})"
                ),
            )

        # 2) Национален репер 2022 — официален външен стандарт за покритите
        #    клетки (момичета U13/U14, момчета U13/U14). Стои НАД cohort, но ПОД
        #    реално изчислена норма: щом се натрупа `computed` норма, тя печели.
        #    Оценява се чрез нива (банди), не чрез mean/std, и е „индикативен"
        #    (един сезон, ограничена извадка) докато имаме свои данни.
        bands = nn2022.get_bands(test_code, age_band, gender)
        if bands is not None:
            return ResolvedNorm(
                source=NormSource.NATIONAL_2022,
                confidence=nc.evaluate_confidence(
                    nc.NormEvidence(source_type=nc.NormSourceType.HISTORICAL)
                ),
                applicable=True,
                band_anchors=bands.anchors(),
                sample_size=0,
                explanation=(
                    f"Национален репер 2022 за {age_band}/{gender} "
                    f"(индикативен — отправна точка)"
                ),
            )

        # 3) Cohort fallback — статистика в рамките на прозореца (кеширана).
        if test_code not in self._cohort_cache:
            self._cohort_cache[test_code] = _cohort_stats(self.db, self.window_id, test_code)
        mean, std, n = self._cohort_cache[test_code]
        if mean is not None and std is not None and n >= MIN_COHORT_SAMPLE and std > 0:
            return ResolvedNorm(
                source=NormSource.COHORT,
                confidence=nc.evaluate_confidence(
                    nc.NormEvidence(source_type=nc.NormSourceType.COHORT, sample_size=n)
                ),
                applicable=True,
                mean=mean,
                std=std,
                sample_size=n,
                explanation=f"Спрямо кохортата в прозореца (n={n})",
            )

        # 4) Neutral — няма достатъчно данни за смислена оценка.
        return ResolvedNorm(
            source=NormSource.NEUTRAL,
            confidence=nc.evaluate_confidence(
                nc.NormEvidence(source_type=nc.NormSourceType.NEUTRAL)
            ),
            applicable=False,
            mean=None,
            std=None,
            sample_size=n if isinstance(n, int) else 0,
            explanation="Недостатъчно данни — неутрална оценка",
        )

    # --- ADR-003 абстракции (eligibility + confidence) ---
    @staticmethod
    def _norm_eligible(norm) -> bool:
        """Дали съхранена норма е избираема. Поведенчески неутрално:

        изисква mean/std да са налични, а после:
          • БЕЗ maturity metadata (днешното състояние) → историческият
            sample-gate (`sample_count ≥ MIN_NORM_SAMPLE`);
          • С maturity metadata (бъдеще) → ADR-003 `is_eligible_for_resolution`.
        Понеже днес `maturity_level` е винаги NULL, се ползва само sample-gate-ът.
        """
        if norm.mean_value is None or not norm.std_value:
            return False
        if norm.maturity_level is None:
            return (norm.sample_count or 0) >= MIN_NORM_SAMPLE
        return nc.is_eligible_for_resolution(_map_norm_source(norm.source), norm.maturity_level)

    @staticmethod
    def _norm_confidence(norm) -> str:
        """Доверие за съхранена норма. Поведенчески неутрално:

        без maturity/coverage/season metadata (днес) → историческото MEDIUM;
        иначе → ADR-003 Confidence Engine. Днес metadata е NULL → MEDIUM.
        """
        if (
            norm.maturity_level is None
            and norm.coverage is None
            and norm.season_count is None
        ):
            return nc.ConfidenceLevel.MEDIUM
        return nc.evaluate_confidence(
            nc.NormEvidence(
                source_type=_map_norm_source(norm.source),
                sample_size=int(norm.sample_count or 0),
                coverage=float(norm.coverage or 0.0),
                season_count=int(norm.season_count or 0),
                maturity_level=norm.maturity_level,
            )
        )
