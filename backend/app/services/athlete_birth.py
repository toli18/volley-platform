from __future__ import annotations

from datetime import date
from typing import Optional


def sync_birth_year_from_date(birth_date: Optional[date]) -> Optional[int]:
    if birth_date is None:
        return None
    return int(birth_date.year)


def resolve_birth_date(
    *,
    birth_date: Optional[date] = None,
    birth_year: Optional[int] = None,
) -> tuple[Optional[date], Optional[int]]:
    """Prefer explicit birth_date; else build YYYY-01-01 from birth_year."""
    if birth_date is not None:
        return birth_date, birth_date.year
    if birth_year is not None:
        year = int(birth_year)
        return date(year, 1, 1), year
    return None, None


def resolve_place_of_birth(
    place_of_birth: Optional[str],
    club_city: Optional[str] = None,
) -> Optional[str]:
    place = (place_of_birth or "").strip() or None
    if place:
        return place
    city = (club_city or "").strip() or None
    return city
