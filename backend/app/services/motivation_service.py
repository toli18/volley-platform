# backend/app/services/motivation_service.py
"""Услуга за мотивационния изглед на детето (БД слой).

Сглобява позитивна, проста картина за самото дете върху вече въведените
резултати:
  • личен рекорд и подобрение спрямо предишния път (чист модул personal_progress);
  • следваща цел спрямо нивата 2022 за СОБСТВЕНАТА възраст;
  • „спрямо големите" (талант) — препраща към talent_profile;
  • леко сравнение с връстниците (процентил) — препраща към peer_norms.

НЕ променя официалната оценка/нормализация/Development Score — само чете.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    TestDefinition,
)
from app.models_assessment import TestCategory, TestDirection
from app.national_method import national_norms_2022 as nn2022
from app.national_method.personal_progress import (
    NextGoal,
    compute_improvement,
    is_at_best,
    next_goal,
    personal_best,
)
from app.services.assessment_scoring import age_band_from_birth_year, window_sort_key
from app.services.peer_norms import compute_peer_percentile
from app.services.talent_profile_service import compute_athlete_talent_profile


@dataclass(frozen=True)
class MotivationTest:
    """Мотивационна картина за един тест."""

    test_code: str
    test_name: str
    unit: str
    higher_better: bool
    category: str

    latest: float
    personal_best: Optional[float]
    is_personal_best: bool  # последното изравнява/подобрява рекорда
    is_new_record: bool  # подобрение И рекорд (нов личен рекорд този път)

    prev: Optional[float]
    delta: Optional[float]
    improved: Optional[bool]

    next_goal: Optional[NextGoal]

    talent_score: Optional[float]
    talent_label: Optional[str]

    peer_percentile: Optional[float]
    peer_sample: int
    peer_indicative: bool


@dataclass(frozen=True)
class MotivationProfile:
    """Сглобена мотивационна картина за дете."""

    athlete_id: int
    athlete_name: Optional[str]
    gender: Optional[str]
    age_band: Optional[str]
    reference_age_band: Optional[str]
    tests: tuple[MotivationTest, ...]
    improved_count: int
    personal_best_count: int
    talent_index: Optional[float]
    talent_index_label: Optional[str]


def _history_by_test(db: Session, athlete_id: int) -> dict[str, list[float]]:
    """Хронологична поредица от сурови стойности за всеки тест (стар → нов)."""
    rows = (
        db.query(AssessmentResult.test_code, AssessmentResult.raw_value, AssessmentWindow)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(AssessmentWindow, AssessmentWindow.id == AssessmentSession.window_id)
        .filter(
            AssessmentResult.athlete_id == athlete_id,
            AssessmentResult.raw_value.isnot(None),
        )
        .all()
    )
    ordered = sorted(rows, key=lambda r: window_sort_key(r[2]))
    history: dict[str, list[float]] = {}
    for test_code, raw_value, _window in ordered:
        history.setdefault(test_code, []).append(raw_value)
    return history


def compute_athlete_motivation(db: Session, athlete_id: int) -> Optional[MotivationProfile]:
    """Сглобена мотивационна картина за състезател или None, ако не съществува."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        return None

    gender = athlete.gender
    age_band = age_band_from_birth_year(athlete.birth_year)
    history = _history_by_test(db, athlete_id)

    # Талант (спрямо по-големите) — за обогатяване по тест + общ индекс.
    talent = compute_athlete_talent_profile(db, athlete_id)
    talent_by_code = {t.test_code: t for t in (talent.tests if talent else ())}

    # Метаданни за тестовете, които детето е правило (без антропометрия/контекст).
    codes = list(history.keys())
    meta = {
        t.code: t
        for t in db.query(TestDefinition).filter(TestDefinition.code.in_(codes)).all()
    } if codes else {}

    tests: list[MotivationTest] = []
    improved_count = 0
    personal_best_count = 0

    for code in codes:
        td = meta.get(code)
        if td is None:
            continue
        category = td.category.value if hasattr(td.category, "value") else td.category
        direction = td.direction.value if hasattr(td.direction, "value") else td.direction
        if category == TestCategory.anthropometry.value or direction == TestDirection.context.value:
            continue

        higher_better = direction != TestDirection.lower_better.value
        values = history[code]
        imp = compute_improvement(values, higher_better)
        if imp is None:
            continue
        latest = imp.latest
        best = personal_best(values, higher_better)
        at_best = is_at_best(latest, best, higher_better)
        new_record = at_best and imp.improved is True

        bands = nn2022.get_bands(code, age_band, gender)
        goal = next_goal(latest, bands, higher_better) if bands is not None else None

        peer = compute_peer_percentile(
            db, code, age_band, gender, latest,
            higher_better=higher_better, exclude_athlete_id=athlete_id,
        )

        t_score = talent_by_code.get(code)
        tests.append(
            MotivationTest(
                test_code=code,
                test_name=td.name,
                unit=td.unit,
                higher_better=higher_better,
                category=category,
                latest=latest,
                personal_best=best,
                is_personal_best=at_best,
                is_new_record=new_record,
                prev=imp.prev,
                delta=imp.delta,
                improved=imp.improved,
                next_goal=goal,
                talent_score=t_score.talent_score if t_score else None,
                talent_label=t_score.talent_label if t_score else None,
                peer_percentile=peer.percentile if peer else None,
                peer_sample=peer.sample_size if peer else 0,
                peer_indicative=peer.is_indicative if peer else False,
            )
        )
        if imp.improved is True:
            improved_count += 1
        if new_record:
            personal_best_count += 1

    # Стабилен ред: по категория (тех/бързина/физика), после по код.
    cat_order = {"technical": 0, "speed": 1, "physical": 2}
    tests.sort(key=lambda t: (cat_order.get(t.category, 9), t.test_code))

    return MotivationProfile(
        athlete_id=athlete_id,
        athlete_name=athlete.athlete_name,
        gender=gender,
        age_band=age_band,
        reference_age_band=talent.reference_age_band if talent else nn2022.reference_age_band(gender),
        tests=tuple(tests),
        improved_count=improved_count,
        personal_best_count=personal_best_count,
        talent_index=talent.talent_index if talent else None,
        talent_index_label=talent.talent_index_label if talent else None,
    )
