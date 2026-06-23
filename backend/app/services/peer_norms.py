# backend/app/services/peer_norms.py
"""Връстниково сравнение — процентил спрямо всички деца от същата възраст и пол.

Това е „живият" слой за сравнение Б (виж скаутската таблица): за един показател
събираме ПОСЛЕДНАТА стойност на всеки връстник в системата (същ пол, същата
възрастова група, изведена от рождената година) и казваме „по-добър от X% от
връстниците".

Принцип:
  • НЕ променя официалната оценка/нормализация/Development Score — само чете.
  • Малка извадка (под прага) → маркира се „индикативно", не подвежда.
  • Чистата математика (`percentile_rank`) е отделена от БД и се тества пряко.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
)
from app.services.assessment_scoring import MIN_NORM_SAMPLE, window_sort_key

# Под този брой връстници сравнението е „индикативно" (както при нормите).
MIN_PEER_SAMPLE = MIN_NORM_SAMPLE


@dataclass(frozen=True)
class PeerComparison:
    """Резултат от връстниковото сравнение за една стойност."""

    percentile: float  # 0–100: „по-добър от X% от връстниците"
    sample_size: int  # брой връстници в извадката (без самото дете)
    is_indicative: bool  # True при малка извадка


def percentile_rank(value: float, peers: list[float], higher_better: bool = True) -> float:
    """Процентилен ранг на `value` спрямо `peers` (0–100), съобразен с посоката.

    „По-добър от X%": броим връстниците, които стойността бие, плюс половината
    равни (стандартно midrank третиране на равенствата). За `higher_better=False`
    (напр. бързина) по-малката стойност е по-добра.
    """
    n = len(peers)
    if n == 0:
        return 0.0
    if higher_better:
        worse = sum(1 for p in peers if p < value)
    else:
        worse = sum(1 for p in peers if p > value)
    ties = sum(1 for p in peers if p == value)
    return round((worse + 0.5 * ties) / n * 100, 1)


def birth_year_for_band(age_band: Optional[str], ref_year: Optional[int] = None) -> Optional[int]:
    """Рождена година за U-band (огледало на `age_band_from_birth_year`)."""
    if not age_band or not isinstance(age_band, str):
        return None
    s = age_band.strip().upper()
    if not s.startswith("U"):
        return None
    try:
        age = int(s[1:])
    except ValueError:
        return None
    ref = ref_year or date.today().year
    return ref - age


def peer_latest_values(
    db: Session,
    test_code: str,
    age_band: Optional[str],
    gender: Optional[str],
    *,
    exclude_athlete_id: Optional[int] = None,
    ref_year: Optional[int] = None,
) -> list[float]:
    """Последната стойност за теста на всеки връстник (същ пол + възрастова група).

    „Последна" = по подредбата на прозорците (`window_sort_key`). Детето,
    подадено в `exclude_athlete_id`, се изключва, за да не се брои само спрямо себе си.
    """
    birth_year = birth_year_for_band(age_band, ref_year)
    if birth_year is None or not gender:
        return []

    rows = (
        db.query(AssessmentResult.athlete_id, AssessmentResult.raw_value, AssessmentWindow)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(AssessmentWindow, AssessmentWindow.id == AssessmentSession.window_id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentResult.test_code == test_code,
            AssessmentResult.raw_value.isnot(None),
            Athlete.birth_year == birth_year,
            Athlete.gender == gender,
        )
        .all()
    )

    latest: dict[int, float] = {}
    for athlete_id, raw_value, _window in sorted(rows, key=lambda r: window_sort_key(r[2])):
        if exclude_athlete_id is not None and athlete_id == exclude_athlete_id:
            continue
        latest[athlete_id] = raw_value
    return list(latest.values())


def compute_peer_percentile(
    db: Session,
    test_code: str,
    age_band: Optional[str],
    gender: Optional[str],
    value: Optional[float],
    *,
    higher_better: bool,
    exclude_athlete_id: Optional[int] = None,
    ref_year: Optional[int] = None,
) -> Optional[PeerComparison]:
    """Връстников процентил за стойност, или None, ако няма с кого да сравним."""
    if value is None:
        return None
    peers = peer_latest_values(
        db, test_code, age_band, gender, exclude_athlete_id=exclude_athlete_id, ref_year=ref_year
    )
    n = len(peers)
    if n == 0:
        return None
    return PeerComparison(
        percentile=percentile_rank(value, peers, higher_better),
        sample_size=n,
        is_indicative=n < MIN_PEER_SAMPLE,
    )
