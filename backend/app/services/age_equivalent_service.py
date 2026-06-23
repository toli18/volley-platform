# backend/app/services/age_equivalent_service.py
"""Услуга за възрастов еквивалент (БД слой, Фаза 4).

За всяко дете и тест намира „на каква възраст отговаря представянето му" чрез
кривата възраст → средно от живите норми по възрастови групи (същия тест и пол).
Индикативен слой — не променя официалната оценка.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Athlete, TestDefinition
from app.models_assessment import TestCategory, TestDirection
from app.national_method.age_equivalent import age_band_to_years, age_equivalent
from app.services.assessment_scoring import age_band_from_birth_year
from app.services.norm_producer import compute_candidates
from app.services.talent_profile_service import _latest_raw_by_test


@dataclass(frozen=True)
class AgeEquivalentTest:
    test_code: str
    test_name: str
    unit: Optional[str]
    category: Optional[str]
    higher_better: bool
    latest: float
    equivalent_age: float
    status: str
    points_used: int
    delta_years: Optional[float]  # еквивалент − собствена възраст (ако е известна)


@dataclass(frozen=True)
class AgeEquivalentProfile:
    athlete_id: int
    athlete_name: Optional[str]
    gender: Optional[str]
    age_band: Optional[str]
    own_age: Optional[float]
    tests: tuple[AgeEquivalentTest, ...]


def _cat(td: TestDefinition) -> str:
    return td.category.value if hasattr(td.category, "value") else td.category


def _dir(td: TestDefinition) -> str:
    return td.direction.value if hasattr(td.direction, "value") else td.direction


def compute_athlete_age_equivalent(db: Session, athlete_id: int) -> Optional[AgeEquivalentProfile]:
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        return None

    gender = athlete.gender
    age_band = age_band_from_birth_year(athlete.birth_year)
    own_age = float(date.today().year - athlete.birth_year) if athlete.birth_year else None

    latest = _latest_raw_by_test(db, athlete_id)
    if not latest or not gender:
        return AgeEquivalentProfile(
            athlete_id=athlete_id, athlete_name=athlete.athlete_name, gender=gender,
            age_band=age_band, own_age=own_age, tests=(),
        )

    # Крива възраст → средно по тест (живи норми за същия пол, n ≥ праг за показване).
    candidates = compute_candidates(db, gender=gender, include_below_display=False)
    curve: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for c in candidates:
        if c.mean is None:
            continue
        yrs = age_band_to_years(c.age_band)
        if yrs is None:
            continue
        curve[c.test_code].append((yrs, c.mean))

    test_defs = {
        t.code: t
        for t in db.query(TestDefinition).filter(TestDefinition.is_active.is_(True)).all()
    }

    out: list[AgeEquivalentTest] = []
    for test_code, raw in latest.items():
        if raw is None:
            continue
        td = test_defs.get(test_code)
        if td is None:
            continue
        if _cat(td) == TestCategory.anthropometry.value or _dir(td) == TestDirection.context.value:
            continue
        higher_better = _dir(td) == TestDirection.higher_better.value
        eq = age_equivalent(curve.get(test_code, []), raw, higher_better)
        if eq is None:
            continue  # нужни са поне 2 възрастови групи с данни
        delta = round(eq.equivalent_age - own_age, 1) if own_age is not None else None
        out.append(
            AgeEquivalentTest(
                test_code=test_code,
                test_name=td.name,
                unit=td.unit,
                category=_cat(td),
                higher_better=higher_better,
                latest=raw,
                equivalent_age=eq.equivalent_age,
                status=eq.status,
                points_used=eq.points_used,
                delta_years=delta,
            )
        )

    out.sort(key=lambda t: t.test_name)
    return AgeEquivalentProfile(
        athlete_id=athlete_id, athlete_name=athlete.athlete_name, gender=gender,
        age_band=age_band, own_age=own_age, tests=tuple(out),
    )
