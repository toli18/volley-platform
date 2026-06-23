# backend/app/services/talent_profile_service.py
"""Услуга за профила на таланта (БД слой).

Вади последните сурови резултати на едно дете и ги подава на чистото ядро
(`national_method.talent_profile`). НЕ променя нищо в БД и не докосва
официалната оценка/нормализация — само чете и сглобява „надстроечния" профил.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
)
from app.national_method.talent_profile import TalentProfile, build_talent_profile
from app.services.assessment_scoring import age_band_from_birth_year, window_sort_key


def _latest_raw_by_test(db: Session, athlete_id: int) -> dict[str, Optional[float]]:
    """Последна непразна сурова стойност за всеки тест на детето.

    „Последна" се определя по подредбата на прозорците (`window_sort_key`):
    сезон → фаза → начална дата. По-новите презаписват по-старите.
    """
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
    latest: dict[str, Optional[float]] = {}
    for test_code, raw_value, _window in ordered:
        latest[test_code] = raw_value
    return latest


def compute_athlete_talent_profile(db: Session, athlete_id: int) -> Optional[TalentProfile]:
    """Сглобен профил на таланта за състезател или None, ако не съществува."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        return None

    age_band = age_band_from_birth_year(athlete.birth_year)
    raw_by_test = _latest_raw_by_test(db, athlete_id)
    return build_talent_profile(athlete.gender, age_band, raw_by_test)
