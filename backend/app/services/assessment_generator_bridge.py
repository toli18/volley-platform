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


def build_team_diagnosis(
    db: Session,
    session: AssessmentSession,
    *,
    duration_min: int = 90,
    players_count: Optional[int] = None,
) -> dict[str, Any]:
    """Агрегира дефицити за всички състезатели със данни в сесията.

    Връща отборни фокуси + индивидуални списъци + prefilled generate_request
    за отборна тренировка.
    """
    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == session.window_id).first()
    if window is None:
        return {
            "session_id": session.id,
            "team_id": session.team_id,
            "window_id": session.window_id,
            "athlete_count": 0,
            "main_focus": None,
            "secondary_focus": None,
            "domains": [],
            "athletes": [],
            "coach_notes": ["Няма прозорец за тази сесия."],
            "generate_request": {},
        }

    athlete_ids = [
        aid
        for (aid,) in db.query(AssessmentResult.athlete_id)
        .filter(AssessmentResult.session_id == session.id)
        .distinct()
        .all()
    ]
    athletes = (
        db.query(Athlete).filter(Athlete.id.in_(athlete_ids)).all() if athlete_ids else []
    )
    athletes_by_id = {a.id: a for a in athletes}

    per_athlete: list[dict] = []
    domain_stats: dict[str, dict[str, Any]] = {}

    for aid in athlete_ids:
        athlete = athletes_by_id.get(aid)
        if athlete is None:
            continue
        deficits = find_deficits(db, aid, window)
        if not deficits:
            continue
        focus_order = [d["domain"] for d in deficits]
        per_athlete.append(
            {
                "athlete_id": aid,
                "athlete_name": athlete.athlete_name,
                "main_focus": focus_order[0] if focus_order else None,
                "secondary_focus": focus_order[1] if len(focus_order) > 1 else None,
                "deficits": deficits,
            }
        )
        for d in deficits:
            domain = d["domain"]
            bucket = domain_stats.setdefault(
                domain, {"sum": 0.0, "n": 0, "deficit_count": 0, "athlete_ids": []}
            )
            bucket["sum"] += float(d["normalized"])
            bucket["n"] += 1
            bucket["athlete_ids"].append(aid)
            if d["is_deficit"]:
                bucket["deficit_count"] += 1

    domains = []
    for domain, bucket in domain_stats.items():
        mean = round(bucket["sum"] / bucket["n"], 1) if bucket["n"] else None
        domains.append(
            {
                "domain": domain,
                "deficit_count": bucket["deficit_count"],
                "athlete_count": bucket["n"],
                "mean_normalized": mean,
                "is_team_deficit": bool(
                    bucket["deficit_count"] >= max(1, (len(per_athlete) + 1) // 2)
                    or (mean is not None and mean < DEFICIT_THRESHOLD)
                ),
            }
        )
    domains.sort(key=lambda x: (x["deficit_count"], -(x["mean_normalized"] or 0)), reverse=True)

    main_focus = domains[0]["domain"] if domains else DEFAULT_FOCUS
    secondary_focus = domains[1]["domain"] if len(domains) > 1 else None

    coach_notes: list[str] = []
    if not per_athlete:
        coach_notes.append("Няма състезатели с нормализирани резултати в тази сесия.")
    else:
        coach_notes.append(
            f"Отборна диагностика върху {len(per_athlete)} състезател(и) с данни."
        )
        if main_focus:
            coach_notes.append(
                f"Общ приоритет за отбора: {main_focus}"
                + (f", вторичен: {secondary_focus}." if secondary_focus else ".")
            )
        for row in per_athlete:
            if row.get("main_focus"):
                coach_notes.append(
                    f"{row['athlete_name']}: акцент върху {row['main_focus']}"
                    + (f" (и {row['secondary_focus']})" if row.get("secondary_focus") else "")
                    + "."
                )

    n_players = players_count if players_count is not None else max(8, len(per_athlete) or 12)
    # Средна възраст за generate_request.
    ages = [_athlete_age(athletes_by_id[a["athlete_id"]]) for a in per_athlete]
    ages = [a for a in ages if a is not None]
    avg_age = int(round(sum(ages) / len(ages))) if ages else "U14"
    genders = {athletes_by_id[a["athlete_id"]].gender for a in per_athlete if athletes_by_id.get(a["athlete_id"])}
    gender = genders.pop() if len(genders) == 1 else None

    focus_skills = [f for f in (main_focus, secondary_focus) if f]
    generate_request: dict[str, Any] = {
        "age": avg_age,
        "level": "развиващи се",
        "mainFocus": main_focus,
        "secondaryFocus": secondary_focus,
        "periodPhase": "inseason",
        "durationTotalMin": duration_min,
        "playersCount": n_players,
        "focusSkills": focus_skills,
        "focusDomains": focus_skills,
        "intensityTarget": "medium",
        "gender": gender,
        "notes": "Отборна тренировка по диагнозата от диагностичната сесия.",
    }

    return {
        "session_id": session.id,
        "team_id": session.team_id,
        "window_id": session.window_id,
        "athlete_count": len(per_athlete),
        "main_focus": main_focus,
        "secondary_focus": secondary_focus,
        "domains": domains,
        "athletes": per_athlete,
        "coach_notes": coach_notes,
        "generate_request": generate_request,
    }
