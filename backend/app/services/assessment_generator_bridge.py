# backend/app/services/assessment_generator_bridge.py
"""Мост: диагностика → предписание.

Чете нормализираните резултати на състезателя в даден прозорец, намира
дефицитите (нормализиран резултат под праг) и сглобява заявка за AI
генератора, така че генерираната тренировка да таргетира най-слабите области.
Това затваря методическата верига: тест → диагноза → тренировка.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
)

# Мапинг тест → волейболно умение (речникът на генератора, _SKILL_CANONICAL):
# Посрещане, Разпределение, Сервис, Атака, Блок, Защита, Преход, Координация, Игра.
TEST_TO_DOMAIN: dict[str, str] = {
    "TECH_PASS_BOT": "Посрещане",      # подаване отдолу = прием
    "TECH_PASS_TOP": "Разпределение",  # подаване отгоре = разпределение
    "TECH_SERVE": "Сервис",
    "TECH_ATTACK": "Атака",
    "SPEED_9363": "Координация",
    "PHYS_MEDBALL": "Координация",
    "PHYS_LONGJUMP": "Координация",
    "PHYS_JUMP_1ARM": "Координация",
    "PHYS_JUMP_2ARM": "Координация",
    "PHYS_JUMP_APPROACH": "Координация",
}

DEFICIT_THRESHOLD = 45.0  # нормализиран резултат под това = дефицит
DEFAULT_FOCUS = "Посрещане"  # ако няма данни (cold-start)


def _athlete_age(athlete: Athlete, ref_year: Optional[int] = None) -> Optional[int]:
    if not athlete.birth_year:
        return None
    ref = ref_year or date.today().year
    age = ref - int(athlete.birth_year)
    return age if 5 <= age <= 60 else None


def find_deficits(db: Session, athlete_id: int, window: AssessmentWindow) -> list[dict]:
    """Връща дефицитите по умение, сортирани възходящо (най-слабото първо).

    За всяко умение взима НАЙ-СЛАБИЯ нормализиран резултат измежду тестовете,
    които го измерват. `is_deficit` маркира тези под прага.
    """
    rows = (
        db.query(AssessmentResult.test_code, AssessmentResult.normalized)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.athlete_id == athlete_id,
            AssessmentResult.normalized.isnot(None),
        )
        .all()
    )

    by_domain: dict[str, float] = {}
    for test_code, normalized in rows:
        domain = TEST_TO_DOMAIN.get(test_code)
        if domain is None:
            continue
        value = float(normalized)
        if domain not in by_domain or value < by_domain[domain]:
            by_domain[domain] = value

    deficits = [
        {"domain": domain, "normalized": round(value, 1), "is_deficit": value < DEFICIT_THRESHOLD}
        for domain, value in by_domain.items()
    ]
    deficits.sort(key=lambda item: item["normalized"])
    return deficits


def build_generate_request(
    db: Session,
    athlete: Athlete,
    window: AssessmentWindow,
    *,
    duration_min: int = 90,
    players_count: int = 12,
) -> dict[str, Any]:
    """Сглобява prefilled заявка за генератора според дефицитите на състезателя.

    Връща `{"generate_request": <dict за GenerateRequest>, "deficits": [...]}`.
    Не извиква генератора — само подготвя заявката (виж run_generation).
    """
    deficits = find_deficits(db, athlete.id, window)
    focus_order = [d["domain"] for d in deficits]
    main_focus = focus_order[0] if focus_order else DEFAULT_FOCUS
    secondary_focus = focus_order[1] if len(focus_order) > 1 else None

    age = _athlete_age(athlete)
    focus_skills = [f for f in (main_focus, secondary_focus) if f]

    generate_request: dict[str, Any] = {
        # ако възрастта е неизвестна, подаваме band-а по подразбиране (resolve_age_band го разбира)
        "age": age if age is not None else "U14",
        "level": "развиващи се",
        "mainFocus": main_focus,
        "secondaryFocus": secondary_focus,
        "periodPhase": "inseason",
        "durationTotalMin": duration_min,
        "playersCount": players_count,
        "focusSkills": focus_skills,
        "focusDomains": focus_skills,
        "intensityTarget": "medium",
        "gender": athlete.gender,
        # без planner-контекст (cycleId/textbookSlug/sessionCode), за да се
        # запази нашият mainFocus от дефицитите (виж enrich_request).
    }

    return {"generate_request": generate_request, "deficits": deficits}
