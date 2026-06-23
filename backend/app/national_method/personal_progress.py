# backend/app/national_method/personal_progress.py
"""Личен прогрес — ЧИСТ модул (без БД/IO) за мотивационния изглед на детето.

Идея: екран, обърнат към самото дете — позитивен и прост. Стъпва върху вече
въведените резултати и репера 2022. Тук е само математиката:

  • `personal_best`     — личният рекорд (съобразен с посоката на теста);
  • `compute_improvement` — с колко се е подобрило спрямо предишния път;
  • `next_goal`         — следващата „летва" (ниво 2022) за СОБСТВЕНАТА възраст.

ВАЖНО: този слой НЕ променя официалната оценка/нормализация/Development Score —
само чете стойности и ги представя мотивиращо.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .national_norms_2022 import (
    GradeBands,
    LEVEL_EXCELLENT,
    LEVEL_SATISFACTORY,
    LEVEL_VERY_GOOD,
)


@dataclass(frozen=True)
class Improvement:
    """Сравнение на последната стойност спрямо предишната (за един тест)."""

    prev: Optional[float]  # предишната стойност (None, ако е първо измерване)
    latest: float  # последната стойност
    delta: Optional[float]  # latest − prev (сурова, със знак)
    improved: Optional[bool]  # подобрение ли е (съобразено с посоката)


@dataclass(frozen=True)
class NextGoal:
    """Следваща цел за собствената възраст (по нивата 2022)."""

    target_raw: float  # суровата стойност, която отключва следващото ниво
    next_level: str  # словесно име на следващото ниво
    gap: float  # колко още (в сурови единици, винаги >= 0)


def personal_best(values: list[float], higher_better: bool) -> Optional[float]:
    """Личният рекорд от всички измервания (max при higher_better, иначе min)."""
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return max(clean) if higher_better else min(clean)


def is_at_best(latest: Optional[float], best: Optional[float], higher_better: bool) -> bool:
    """True, ако последната стойност е (изравнява) личния рекорд."""
    if latest is None or best is None:
        return False
    return latest >= best if higher_better else latest <= best


def compute_improvement(values: list[float], higher_better: bool) -> Optional[Improvement]:
    """Подобрение спрямо предишното измерване (по последните две стойности).

    `values` са подредени хронологично (най-старо → най-ново). Връща None, ако
    няма нито една стойност.
    """
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    latest = clean[-1]
    if len(clean) < 2:
        return Improvement(prev=None, latest=latest, delta=None, improved=None)
    prev = clean[-2]
    delta = round(latest - prev, 2)
    improved = delta > 0 if higher_better else delta < 0
    return Improvement(prev=prev, latest=latest, delta=delta, improved=improved)


def next_goal(latest: float, bands: GradeBands, higher_better: bool) -> Optional[NextGoal]:
    """Следващата „летва" (ниво 2022) за собствената възраст, или None при върха.

    За higher_better целта е първият праг НАД текущата стойност; за lower_better
    (напр. бързина) — първият праг ПОД нея. Ако детето вече е „Отлично" → None.
    """
    levels = [
        (bands.t_low, LEVEL_SATISFACTORY),
        (bands.t_mid, LEVEL_VERY_GOOD),
        (bands.t_high, LEVEL_EXCELLENT),
    ]
    if higher_better:
        for thr, label in levels:  # праговете растат
            if latest < thr:
                return NextGoal(target_raw=thr, next_level=label, gap=round(thr - latest, 2))
        return None
    for thr, label in levels:  # за lower_better праговете намаляват (по-малко=по-добре)
        if latest > thr:
            return NextGoal(target_raw=thr, next_level=label, gap=round(latest - thr, 2))
    return None
