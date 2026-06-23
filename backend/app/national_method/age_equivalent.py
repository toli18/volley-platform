# backend/app/national_method/age_equivalent.py
"""Възрастов еквивалент (Фаза 4) — ЧИСТ модул.

Отговаря на въпроса: „на каква възраст отговаря това представяне?" —
напр. дете на 11 г. скача като средно дете на 13 г.

Стъпва на кривата „възраст → средна стойност" (от живите норми по възрастови
групи за същия тест и пол). За суровата стойност на детето намираме възрастта,
при която средното на популацията съвпада с неговия резултат (линейна
интерполация по кривата). Това е индикативен слой — НЕ променя официалната оценка.

Без БД, без IO — само математика върху подадени точки.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AgeEquivalent:
    equivalent_age: float  # на колко години отговаря представянето
    status: str  # "in_range" | "above_oldest" | "below_youngest"
    points_used: int  # брой възрастови групи, ползвани за кривата


def age_band_to_years(age_band: Optional[str]) -> Optional[float]:
    """„U13" → 13.0. Връща None при невалиден вход."""
    if not age_band:
        return None
    s = age_band.strip().upper().lstrip("U")
    try:
        return float(s)
    except ValueError:
        return None


def age_equivalent(
    points: list[tuple[float, float]],
    raw: float,
    higher_better: bool,
) -> Optional[AgeEquivalent]:
    """Изчислява възрастов еквивалент.

    `points` са двойки (възраст_в_години, средна_стойност) от живите норми по
    възрастови групи за същия тест и пол. Нужни са поне 2 различни възрасти.

    Логиката се уеднаквява чрез знаков множител: за „по-малко е по-добре"
    (време) обръщаме знака, така че по-доброто винаги расте с възрастта.
    """
    # Уникални възрасти, сортирани; при дубликат — последната стойност печели.
    by_age: dict[float, float] = {}
    for age, mean in points:
        if age is None or mean is None:
            continue
        by_age[float(age)] = float(mean)
    items = sorted(by_age.items())
    if len(items) < 2:
        return None

    s = 1.0 if higher_better else -1.0
    ages = [a for a, _ in items]
    vals = [s * m for _, m in items]  # трансформирани: по-голямо = по-добро
    r = s * raw

    n = len(items)
    # Под най-малката (по-слабо от най-малката възраст) → еквивалент = най-малката.
    if r <= vals[0]:
        return AgeEquivalent(equivalent_age=round(ages[0], 1), status="below_youngest", points_used=n)
    # Над най-голямата (по-добро от най-голямата възраст) → еквивалент = най-голямата.
    if r >= vals[-1]:
        return AgeEquivalent(equivalent_age=round(ages[-1], 1), status="above_oldest", points_used=n)

    # В обхвата: намираме сегмент, в който r попада, и интерполираме линейно.
    for i in range(n - 1):
        lo, hi = vals[i], vals[i + 1]
        a_lo, a_hi = ages[i], ages[i + 1]
        # Сегментът трябва да „обхваща" r (работи и за непостоянна монотонност).
        if (lo <= r <= hi) or (hi <= r <= lo):
            if hi == lo:
                eq = (a_lo + a_hi) / 2.0
            else:
                eq = a_lo + (r - lo) / (hi - lo) * (a_hi - a_lo)
            return AgeEquivalent(equivalent_age=round(eq, 1), status="in_range", points_used=n)

    # Резерв при немонотонна крива: най-близката по стойност възраст.
    nearest = min(range(n), key=lambda i: abs(vals[i] - r))
    return AgeEquivalent(equivalent_age=round(ages[nearest], 1), status="in_range", points_used=n)
