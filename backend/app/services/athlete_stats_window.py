"""
Прозорец на клубната история на състезателя.

Такси и присъствие за доклади/справки се броят от момента на създаване
на локалния запис (ръчно или при импорт/свързване от СЕК) — `Athlete.created_at`.
Месеци/дати преди това не влизат като „неплатено“ / очаквано присъствие,
за да не се изкривяват статистиките.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Iterable, Optional


def athlete_history_start_at(athlete: Any) -> Optional[datetime]:
    """Начало на клубната история в платформата."""
    created = getattr(athlete, "created_at", None)
    if isinstance(created, datetime):
        return created
    return None


def athlete_history_from_month(athlete: Any) -> Optional[str]:
    """YYYY-MM на месеца, от който започва задължението за такси; None = без ограничение."""
    start = athlete_history_start_at(athlete)
    if start is None:
        return None
    return f"{start.year:04d}-{start.month:02d}"


def athlete_history_from_date(athlete: Any) -> Optional[date]:
    """Календарна дата (UTC/naive от created_at), от която важи присъствието."""
    start = athlete_history_start_at(athlete)
    if start is None:
        return None
    return start.date() if hasattr(start, "date") else None


def month_in_athlete_history(athlete: Any, month_key: str) -> bool:
    """True ако месецът е в клубната история (или няма created_at → допускаме)."""
    start_m = athlete_history_from_month(athlete)
    if not start_m:
        return True
    mk = (month_key or "").strip()
    if not mk:
        return True
    return mk >= start_m


def date_in_athlete_history(athlete: Any, day: date | str | None) -> bool:
    """True ако денят е на/след създаването (или няма created_at)."""
    start_d = athlete_history_from_date(athlete)
    if start_d is None or day is None:
        return True
    if isinstance(day, str):
        day_s = day.strip()
        if len(day_s) >= 10:
            try:
                day = date.fromisoformat(day_s[:10])
            except ValueError:
                return True
        else:
            return True
    if not isinstance(day, date):
        return True
    return day >= start_d


def filter_months_in_athlete_history(months: Iterable[str], athlete: Any) -> list[str]:
    """Оставя само месеците в историята на състезателя."""
    return [m for m in months if month_in_athlete_history(athlete, m)]
