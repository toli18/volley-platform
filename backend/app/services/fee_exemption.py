"""Клубни/индивидуални освобождавания от месечна такса."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from app.models import Athlete, Club
from app.services.club_membership_consent import club_monthly_fees_enabled

DEFAULT_FEE_AGE_EXEMPT_MIN = 18

FeeExemptReason = Literal["manual", "age"]


def next_month_key(now: datetime | None = None) -> str:
    d = now or datetime.utcnow()
    y, m = d.year, d.month
    if m == 12:
        return f"{y + 1:04d}-01"
    return f"{y:04d}-{m + 1:02d}"


def current_month_key(now: datetime | None = None) -> str:
    d = now or datetime.utcnow()
    return f"{d.year:04d}-{d.month:02d}"


def athlete_birth_year(athlete: Athlete) -> int | None:
    by = getattr(athlete, "birth_year", None)
    if by is not None:
        try:
            return int(by)
        except (TypeError, ValueError):
            pass
    bd = getattr(athlete, "birth_date", None)
    if bd is not None and getattr(bd, "year", None):
        return int(bd.year)
    return None


def athlete_age_on_jan1(athlete: Athlete, year: int) -> int | None:
    """Възраст към 1 януари на `year`: year − година_на_раждане."""
    by = athlete_birth_year(athlete)
    if by is None:
        return None
    return int(year) - int(by)


def _month_ge(month_key: str, from_month: str | None) -> bool:
    """True ако няма from_month или month_key >= from_month."""
    fm = (from_month or "").strip()
    if not fm:
        return True
    return str(month_key) >= fm


def resolve_fee_age_exempt_settings(club: Club | None) -> dict[str, Any]:
    if club is None:
        return {
            "enabled": False,
            "min_age": DEFAULT_FEE_AGE_EXEMPT_MIN,
            "from_month": None,
        }
    return {
        "enabled": bool(getattr(club, "fee_age_exempt_enabled", False)),
        "min_age": int(getattr(club, "fee_age_exempt_min_age", None) or DEFAULT_FEE_AGE_EXEMPT_MIN),
        "from_month": (getattr(club, "fee_age_exempt_from_month", None) or None),
    }


def athlete_fee_exempt_for_month(
    athlete: Athlete,
    club: Club | None,
    month_key: str,
) -> tuple[bool, Optional[FeeExemptReason]]:
    """
    Освободен ли е състезателят от такса за дадения месец (YYYY-MM).
    Ръчният флаг побеждава; иначе възрастово правило (≥ N към 1 ян. на годината на месеца).
    Без година на раждане → няма автоматично освобождаване.
    Важи само от from_month нататък (смяна на правилото = само напред).
    """
    if not club_monthly_fees_enabled(club):
        return False, None

    if bool(getattr(athlete, "fee_exempt_manual", False)):
        if _month_ge(month_key, getattr(athlete, "fee_exempt_from_month", None)):
            return True, "manual"

    age_cfg = resolve_fee_age_exempt_settings(club)
    if age_cfg["enabled"] and club is not None:
        if _month_ge(month_key, age_cfg["from_month"]):
            year = int(str(month_key)[:4])
            age = athlete_age_on_jan1(athlete, year)
            if age is not None and age >= int(age_cfg["min_age"]):
                return True, "age"

    return False, None


def athlete_fee_exempt_now(
    athlete: Athlete,
    club: Club | None,
    now: datetime | None = None,
) -> tuple[bool, Optional[FeeExemptReason]]:
    return athlete_fee_exempt_for_month(athlete, club, current_month_key(now))


def apply_manual_fee_exempt(
    athlete: Athlete,
    *,
    exempt: bool,
    note: str | None = None,
    now: datetime | None = None,
) -> None:
    """Вкл./изкл. ръчно освобождаване — ефект от следващия месец."""
    if exempt:
        was = bool(getattr(athlete, "fee_exempt_manual", False))
        athlete.fee_exempt_manual = True
        if not was or not (getattr(athlete, "fee_exempt_from_month", None) or "").strip():
            athlete.fee_exempt_from_month = next_month_key(now)
        if note is not None:
            athlete.fee_exempt_note = (note or "").strip() or None
    else:
        athlete.fee_exempt_manual = False
        athlete.fee_exempt_from_month = None
        if note is not None:
            athlete.fee_exempt_note = (note or "").strip() or None
        else:
            athlete.fee_exempt_note = None


def apply_club_age_exempt_settings(
    club: Club,
    *,
    enabled: bool | None = None,
    min_age: int | None = None,
    now: datetime | None = None,
) -> None:
    """
    Обновява възрастовото правило. При включване или смяна на N —
    from_month = следващият месец (само напред).
    """
    prev_enabled = bool(getattr(club, "fee_age_exempt_enabled", False))
    prev_min = int(getattr(club, "fee_age_exempt_min_age", None) or DEFAULT_FEE_AGE_EXEMPT_MIN)

    if enabled is not None:
        club.fee_age_exempt_enabled = bool(enabled)
    if min_age is not None:
        club.fee_age_exempt_min_age = int(min_age)

    new_enabled = bool(getattr(club, "fee_age_exempt_enabled", False))
    new_min = int(getattr(club, "fee_age_exempt_min_age", None) or DEFAULT_FEE_AGE_EXEMPT_MIN)

    if not new_enabled:
        club.fee_age_exempt_from_month = None
        return

    rule_changed = (not prev_enabled and new_enabled) or (prev_min != new_min)
    if rule_changed or not (getattr(club, "fee_age_exempt_from_month", None) or "").strip():
        club.fee_age_exempt_from_month = next_month_key(now)
