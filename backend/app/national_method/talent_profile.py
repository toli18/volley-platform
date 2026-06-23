# backend/app/national_method/talent_profile.py
"""Профил на таланта — ЧИСТ модул (без БД/IO).

Идея (потвърдена с треньора): във волейбола талантът се вижда рано (9–12 г.).
Едно по-малко дете може вече да покрива летвата на по-голяма възрастова група.
Този слой сравнява суровите резултати на дете срещу **референтния стандарт 2022
за по-голяма възраст** (female → U13, male → U14) и дава число (0–100) + дума
(Незадоволително…Отлично) за всеки тест и общ „Индекс на таланта".

ВАЖНО — какво НЕ прави този слой:
  • не променя официалната оценка на детето за неговата възраст;
  • не участва в нормализацията, Development Score или Dashboard;
  • не пише в БД и не чете от нея.

Това е напълно отделен, „надстроечен" слой само за откриване на потенциал.
Стъпва изцяло върху вече тествания репер 2022 (`national_norms_2022`).
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Optional

from . import national_norms_2022 as nn2022


def _age_from_band(age_band: Optional[str]) -> Optional[int]:
    """Извлича числото от U-band (напр. „U10" → 10). None при невалиден вход."""
    if not age_band or not isinstance(age_band, str):
        return None
    s = age_band.strip().upper()
    if not s.startswith("U"):
        return None
    try:
        return int(s[1:])
    except ValueError:
        return None


@dataclass(frozen=True)
class TalentTestScore:
    """Оценка на таланта за един тест спрямо референтния (по-голям) стандарт."""

    test_code: str
    raw_value: float
    talent_score: float  # 0–100 спрямо референтния стандарт 2022
    talent_label: str  # словесно ниво (Незадоволително…Отлично)


@dataclass(frozen=True)
class TalentProfile:
    """Сглобен профил на таланта за едно дете.

    `covered` е True само ако полът е покрит от таблиците 2022 (иначе няма летва
    за сравнение). `is_aspirational` е True, когато детето е по-малко от
    референтната възраст — тогава сравнението наистина е „спрямо по-големите".
    """

    gender: Optional[str]
    age_band: Optional[str]  # собствената възраст на детето (контекст)
    reference_age_band: Optional[str]  # горната летва, спрямо която мерим
    covered: bool
    is_aspirational: bool
    tests: tuple[TalentTestScore, ...]
    talent_index: Optional[float]  # средно от талант-оценките по тестове
    talent_index_label: Optional[str]


def build_talent_profile(
    gender: Optional[str],
    age_band: Optional[str],
    raw_by_test: dict[str, Optional[float]],
) -> TalentProfile:
    """Сглобява профил на таланта от сурови резултати по тестове.

    `raw_by_test` е { test_code: raw_value }. Тестове без репер 2022 или без
    стойност се пропускат. Оценява се срещу референтния (по-голям) стандарт за
    пола; редът на тестовете е стабилен (по код), за предвидим изход.
    """
    ref = nn2022.reference_age_band(gender)

    scores: list[TalentTestScore] = []
    for test_code in sorted(raw_by_test):
        raw = raw_by_test[test_code]
        if raw is None:
            continue
        score = nn2022.score_2022(raw, test_code, ref, gender)
        if score is None:
            continue
        scores.append(
            TalentTestScore(
                test_code=test_code,
                raw_value=raw,
                talent_score=score,
                talent_label=nn2022.grade_label(score),
            )
        )

    if scores:
        talent_index = round(statistics.fmean(t.talent_score for t in scores), 1)
        talent_index_label = nn2022.grade_label(talent_index)
    else:
        talent_index = None
        talent_index_label = None

    own_age = _age_from_band(age_band)
    ref_age = _age_from_band(ref)
    is_aspirational = (
        own_age is not None and ref_age is not None and own_age < ref_age
    )

    return TalentProfile(
        gender=gender,
        age_band=age_band,
        reference_age_band=ref,
        covered=ref is not None,
        is_aspirational=is_aspirational,
        tests=tuple(scores),
        talent_index=talent_index,
        talent_index_label=talent_index_label,
    )
