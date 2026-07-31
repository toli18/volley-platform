"""Athlete identity helpers — names, nationality, BVF lock rules."""

from __future__ import annotations

from datetime import date
from typing import Optional

DEFAULT_NATIONALITY = "България"

# BVF POST /players requires minLength 3 on each name part
NAME_MIN_LEN = 3
NAME_MAX_LEN = 25


def birth_date_from_egn(egn: Optional[str]) -> Optional[date]:
    """
    Извлича дата на раждане от българско ЕГН (YYMMDD + офсет на месеца).
    01–12 → 1900; 21–32 → 1800; 41–52 → 2000.
    """
    s = "".join(ch for ch in str(egn or "") if ch.isdigit())
    if len(s) < 6:
        return None
    try:
        yy = int(s[0:2])
        mm = int(s[2:4])
        dd = int(s[4:6])
    except ValueError:
        return None

    if 1 <= mm <= 12:
        year = 1900 + yy
        month = mm
    elif 21 <= mm <= 32:
        year = 1800 + yy
        month = mm - 20
    elif 41 <= mm <= 52:
        year = 2000 + yy
        month = mm - 40
    else:
        return None

    try:
        return date(year, month, dd)
    except ValueError:
        return None


def apply_birth_date_from_egn(athlete) -> bool:
    """Коригира birth_date / birth_year по ЕГН. Връща True ако има промяна."""
    parsed = birth_date_from_egn(getattr(athlete, "egn", None))
    if not parsed:
        return False
    changed = False
    if getattr(athlete, "birth_date", None) != parsed:
        athlete.birth_date = parsed
        changed = True
    if getattr(athlete, "birth_year", None) != parsed.year:
        athlete.birth_year = parsed.year
        changed = True
    return changed


def compose_athlete_name(
    first_name: Optional[str] = None,
    middle_name: Optional[str] = None,
    last_name: Optional[str] = None,
    fallback: Optional[str] = None,
) -> str:
    parts = [
        (first_name or "").strip(),
        (middle_name or "").strip(),
        (last_name or "").strip(),
    ]
    composed = " ".join(p for p in parts if p)
    if composed:
        return composed
    return (fallback or "").strip()


def normalize_name_part(value: Optional[str]) -> Optional[str]:
    s = (value or "").strip()
    return s or None


def validate_name_part(label: str, value: Optional[str], *, required: bool = True) -> str:
    s = (value or "").strip()
    if not s:
        if required:
            raise ValueError(f"{label} е задължително")
        return ""
    if len(s) < NAME_MIN_LEN:
        raise ValueError(f"{label} трябва да е поне {NAME_MIN_LEN} символа")
    if len(s) > NAME_MAX_LEN:
        raise ValueError(f"{label} е твърде дълго (макс. {NAME_MAX_LEN})")
    return s


def default_nationality_from_city(
    place_of_birth: Optional[str] = None,
    explicit: Optional[str] = None,
) -> str:
    """
    Националност от град на раждане.
    Засега: ако има град и няма изрична стойност → България.
    Чужденец: треньорът подава explicit nationality.
    """
    nat = (explicit or "").strip()
    if nat:
        return nat
    city = (place_of_birth or "").strip()
    if city:
        return DEFAULT_NATIONALITY
    return DEFAULT_NATIONALITY


def bvf_identity_locked(athlete) -> bool:
    return bool(getattr(athlete, "bvf_player_id", None))
