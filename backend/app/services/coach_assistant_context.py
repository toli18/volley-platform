"""Контекст за AI помощника: треньор → отбори → програма → календар → тестове."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    ClubCompetitionEvent,
    ClubCycleInstance,
    MethodCycle,
    MethodicalIndexSnapshot,
    Team,
    User,
    UserRole,
)
from app.national_method.annual_program import (
    ensure_annual_program_seeded,
    resolve_annual_program_band,
)
from app.national_method.content_policy import is_annual_program_cycle
from app.services.program_week_service import build_program_week

_BAND_YEARS = {
    "mini": 11,
    "U13": 13,
    "U14": 14,
    "U15": 15,
    "U16": 16,
    "U17": 17,
    "U18": 18,
}


def default_season_start(today: Optional[date] = None) -> date:
    """Начало на учебно-състезателен сезон (1 септември)."""
    today = today or date.today()
    year = today.year if today.month >= 8 else today.year - 1
    return date(year, 9, 1)


def _role_value(user: User) -> str:
    role = getattr(user, "role", None)
    return role.value if hasattr(role, "value") else str(role or "")


def list_coach_teams(db: Session, user: User) -> list[Team]:
    q = db.query(Team).filter(Team.is_active.is_(True))
    role = _role_value(user)
    if role in (UserRole.platform_admin.value, UserRole.federation_admin.value):
        if user.club_id:
            q = q.filter(Team.club_id == user.club_id)
    elif role == UserRole.club_head_coach.value:
        q = q.filter(Team.club_id == user.club_id)
    else:
        q = q.filter(Team.coach_id == user.id)
    return q.order_by(Team.name.asc()).all()


def _find_annual_macro_cycle(db: Session, age_group: str | None) -> Optional[MethodCycle]:
    ensure_annual_program_seeded(db)
    band = resolve_annual_program_band(age_group or "U14")
    cycles = (
        db.query(MethodCycle)
        .filter(MethodCycle.status == "published", MethodCycle.cycle_type == "macro")
        .order_by(MethodCycle.sort_order.asc(), MethodCycle.id.asc())
        .all()
    )
    for c in cycles:
        if not is_annual_program_cycle(c):
            continue
        key = str((c.structure_json or {}).get("annual_program_key") or "")
        if key.startswith(f"{band}-") or (c.age_band or "") == band:
            return c
    mesos = (
        db.query(MethodCycle)
        .filter(MethodCycle.status == "published", MethodCycle.cycle_type == "meso")
        .order_by(MethodCycle.sort_order.asc(), MethodCycle.id.asc())
        .all()
    )
    for c in mesos:
        if not is_annual_program_cycle(c):
            continue
        key = str((c.structure_json or {}).get("annual_program_key") or "")
        if key.startswith(f"{band}-") or (c.age_band or "") == band:
            return c
    return None


def ensure_team_annual_program(
    db: Session,
    team: Team,
    *,
    created_by: int,
    commit: bool = True,
) -> Optional[ClubCycleInstance]:
    """Ако отборът няма активна годишна програма — закачи макро цикъл по age_group."""
    existing = (
        db.query(ClubCycleInstance)
        .filter(ClubCycleInstance.team_id == team.id, ClubCycleInstance.status == "active")
        .order_by(ClubCycleInstance.id.desc())
        .first()
    )
    if existing:
        return existing
    if not team.club_id:
        return None
    cycle = _find_annual_macro_cycle(db, team.age_group)
    if not cycle:
        return None
    row = ClubCycleInstance(
        club_id=int(team.club_id),
        team_id=int(team.id),
        cycle_id=int(cycle.id),
        start_date=default_season_start().isoformat(),
        customizations_json={},
        status="active",
        created_by=int(created_by),
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def _next_competition(db: Session, team: Team, today: date) -> Optional[dict[str, Any]]:
    q = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.date >= today.isoformat(),
            ClubCompetitionEvent.date <= (today + timedelta(days=21)).isoformat(),
        )
        .order_by(ClubCompetitionEvent.date.asc(), ClubCompetitionEvent.start_time.asc())
    )
    if team.club_id:
        q = q.filter(ClubCompetitionEvent.club_id == int(team.club_id))
    rows = q.limit(30).all()
    team_rows = [e for e in rows if e.team_id == team.id]
    pick = team_rows[0] if team_rows else (rows[0] if rows else None)
    if not pick:
        return None
    try:
        match_day = date.fromisoformat(str(pick.date))
        days = (match_day - today).days
    except ValueError:
        days = None
    kind = getattr(pick, "competition_kind", None) or ""
    return {
        "date": pick.date,
        "opponent": getattr(pick, "opponent_name", None) or "",
        "kind": kind,
        "daysUntilMatch": days,
        "location": getattr(pick, "location", None) or "",
    }


def _today_program_day(week: dict[str, Any], today: date) -> Optional[dict[str, Any]]:
    today_iso = today.isoformat()
    for d in week.get("days") or []:
        if d.get("date") == today_iso:
            return d
    for d in week.get("days") or []:
        if d.get("execution_status") == "upcoming" and d.get("has_program_day"):
            return d
    days = week.get("days") or []
    return days[0] if days else None


def _assessment_hint(db: Session, team_id: int) -> Optional[str]:
    try:
        snap = (
            db.query(MethodicalIndexSnapshot)
            .filter(
                MethodicalIndexSnapshot.subject_type == "team",
                MethodicalIndexSnapshot.subject_id == team_id,
            )
            .order_by(MethodicalIndexSnapshot.id.desc())
            .first()
        )
    except Exception:
        return None
    if not snap:
        return None
    parts: list[str] = []
    if snap.methodical_index is not None:
        parts.append(f"методически индекс ≈ {snap.methodical_index}")
    if snap.development is not None:
        parts.append(f"развитие ≈ {snap.development}")
    if snap.adoption is not None:
        parts.append(f"приемане ≈ {snap.adoption}")
    if snap.measurement_discipline is not None:
        parts.append(f"дисциплина на измерване ≈ {snap.measurement_discipline}")
    return "; ".join(parts) if parts else None


def _focus_to_skill(focus_tokens: list[str]) -> tuple[Optional[str], Optional[str]]:
    text = " ".join(str(x).lower() for x in focus_tokens)
    mapping = [
        (("посрещ", "прием", "serve receive"), "Посрещане", "Разпределение"),
        (("разпредел", "пас", "setting"), "Разпределение", "Посрещане"),
        (("сервис", "начален"), "Сервис", "Посрещане"),
        (("атак", "напад", "шпиц"), "Атака", "Блок"),
        (("блок",), "Блок", "Защита"),
        (("защит", "диг"), "Защита", "Преход"),
        (("преход", "контра"), "Преход", "Атака"),
        (("коорд", "отскок", "физи", "сил"), "Координация", "Атака"),
    ]
    for keys, main, sec in mapping:
        if any(k in text for k in keys):
            return main, sec
    if focus_tokens:
        main = str(focus_tokens[0])[:40]
        sec = str(focus_tokens[1])[:40] if len(focus_tokens) > 1 else None
        return main, sec
    return None, None


def resolve_active_team(teams: list[Team], team_id: Optional[int]) -> Optional[Team]:
    if not teams:
        return None
    if team_id:
        for t in teams:
            if int(t.id) == int(team_id):
                return t
    return teams[0]


def build_coach_assistant_context(
    db: Session,
    user: User,
    *,
    team_id: Optional[int] = None,
    today: Optional[date] = None,
) -> dict[str, Any]:
    """Пълен контекст за чат/UI."""
    today = today or date.today()
    teams = list_coach_teams(db, user)
    team_summaries = [
        {
            "id": t.id,
            "name": t.name,
            "ageGroup": t.age_group,
            "season": t.season,
            "gender": t.gender,
        }
        for t in teams
    ]
    active = resolve_active_team(teams, team_id)
    out: dict[str, Any] = {
        "coachName": (user.name or "").strip() or None,
        "clubId": user.club_id,
        "teams": team_summaries,
        "activeTeam": None,
        "needsTeamPick": len(teams) > 1 and not team_id,
        "program": None,
        "calendar": None,
        "assessmentHint": None,
        "generateDefaults": {},
        "promptText": "",
        "knownFacts": [],
    }

    if not active:
        out["promptText"] = (
            "Треньорът няма активни отбори в профила. "
            "Питай само общо; при нужда подкани да създаде/избере отбор."
        )
        out["knownFacts"] = ["няма активен отбор"]
        return out

    ensure_team_annual_program(db, active, created_by=int(user.id), commit=True)

    week = build_program_week(db, active, week_offset=0, today=today)
    day = _today_program_day(week, today) if week.get("has_program") else None
    next_match = _next_competition(db, active, today)
    assessment = _assessment_hint(db, int(active.id))

    age_band = week.get("age_band") or resolve_annual_program_band(active.age_group)
    focus_tokens = list((day or {}).get("focus") or week.get("week_focus") or [])
    main_focus, secondary_focus = _focus_to_skill(focus_tokens)

    days_until = (next_match or {}).get("daysUntilMatch")
    period_phase = "inseason"
    intensity = "medium"
    orientation = "balanced"
    period_raw = str(week.get("period") or "").lower()
    if "подготов" in period_raw or period_raw == "prep":
        period_phase = "prep"
    elif "преход" in period_raw or period_raw == "offseason":
        period_phase = "offseason"

    if days_until is not None and days_until <= 2:
        period_phase = "taper"
        intensity = "low"

    generate_defaults: dict[str, Any] = {
        "teamId": active.id,
        "ageBand": age_band,
        "age": _BAND_YEARS.get(str(age_band), 15),
        "sessionDate": (day or {}).get("date") or today.isoformat(),
        "mainFocus": main_focus,
        "secondaryFocus": secondary_focus,
        "periodPhase": period_phase,
        "intensityTarget": intensity,
        "orientation": orientation,
        "programTheme": (day or {}).get("theme") or week.get("week_theme"),
        "textbookSlug": (day or {}).get("textbook_slug") or "",
        "daysUntilMatch": days_until,
        "assistantOverride": False,
    }
    if days_until is not None and days_until <= 1:
        generate_defaults["trainingTitle"] = f"{age_band} · активиране преди мач"

    out["activeTeam"] = {
        "id": active.id,
        "name": active.name,
        "ageGroup": active.age_group,
        "ageBand": age_band,
        "season": active.season,
        "gender": active.gender,
    }
    out["program"] = {
        "hasProgram": bool(week.get("has_program")),
        "cycleTitle": week.get("cycle_title"),
        "mesoNumber": week.get("meso_number"),
        "mesoTheme": week.get("meso_theme"),
        "period": week.get("period"),
        "periodLabel": week.get("period_label"),
        "weekInMeso": week.get("week_in_meso"),
        "weekTheme": week.get("week_theme"),
        "weekFocus": week.get("week_focus") or [],
        "weekLoad": week.get("week_load"),
        "today": {
            "date": (day or {}).get("date"),
            "weekday": (day or {}).get("weekday_label"),
            "theme": (day or {}).get("theme"),
            "focus": (day or {}).get("focus") or [],
            "sessionGoal": (day or {}).get("session_goal"),
            "intensity": (day or {}).get("intensity"),
            "textbookSlug": (day or {}).get("textbook_slug"),
        }
        if day
        else None,
        "message": week.get("message"),
    }
    out["calendar"] = {
        "weekTrainings": [
            {
                "date": d.get("date"),
                "weekday": d.get("weekday_label"),
                "theme": d.get("theme"),
                "status": d.get("execution_status"),
            }
            for d in (week.get("days") or [])[:7]
        ],
        "nextMatch": next_match,
    }
    out["assessmentHint"] = assessment
    out["generateDefaults"] = generate_defaults
    out["needsTeamPick"] = len(teams) > 1 and (not team_id)

    facts = [
        f"треньор: {out['coachName'] or '—'}",
        f"активен отбор: {active.name} ({age_band})",
    ]
    if week.get("has_program"):
        facts.append(
            f"програма: мезо {week.get('meso_number')} · седм. {week.get('week_in_meso')} · "
            f"{week.get('week_theme') or week.get('meso_theme') or '—'}"
        )
        if day and day.get("theme"):
            facts.append(f"дневен фокус: {day.get('theme')}")
    else:
        facts.append("няма активна годишна програма (опит за auto-attach направен)")
    if next_match and next_match.get("daysUntilMatch") is not None:
        facts.append(
            f"следващ мач след {next_match['daysUntilMatch']} дн. "
            f"({next_match.get('date')} vs {next_match.get('opponent') or '—'})"
        )
    if assessment:
        facts.append(f"тестове: {assessment}")
    out["knownFacts"] = facts

    lines = [
        f"Треньор: {out['coachName'] or 'неизвестен'}",
        f"Активен отбор: {active.name} | възрастова група: {active.age_group or age_band} | band: {age_band}",
        f"Пол на групата: {active.gender or '—'} | сезон: {active.season or '—'}",
    ]
    if len(teams) > 1:
        lines.append(
            "Отбори на треньора: "
            + "; ".join(f"{t.name} ({t.age_group or '—'})" for t in teams)
        )
        if out["needsTeamPick"]:
            lines.append(
                "ВАЖНО: треньорът води няколко отбора — ако не е ясно за кой говори, "
                "питай само „за кой отбор?“."
            )
    if week.get("has_program"):
        lines.append(
            f"Годишна програма БФВ: {week.get('cycle_title') or 'активна'} | "
            f"мезо {week.get('meso_number')} ({week.get('meso_theme') or '—'}) | "
            f"период: {week.get('period_label') or week.get('period') or '—'} | "
            f"седмица в мезо: {week.get('week_in_meso')} | тема на седмицата: {week.get('week_theme') or '—'} | "
            f"натоварване: {week.get('week_load') or '—'} | фокус: {', '.join(week.get('week_focus') or []) or '—'}"
        )
        if day:
            lines.append(
                f"Днешна/следваща тренировка ({day.get('date')} {day.get('weekday_label') or ''}): "
                f"тема={day.get('theme') or '—'}; цел={day.get('session_goal') or '—'}; "
                f"фокус={', '.join(day.get('focus') or []) or '—'}; интензитет={day.get('intensity') or '—'}"
            )
        cal_bits = []
        for d in (week.get("days") or [])[:5]:
            cal_bits.append(
                f"{d.get('weekday_label') or d.get('date')}: "
                f"{d.get('theme') or 'тренировка'} [{d.get('execution_status')}]"
            )
        if cal_bits:
            lines.append("Календар тази седмица: " + " | ".join(cal_bits))
    else:
        lines.append("Годишна програма: все още няма / не е стартирала за отбора.")
    if next_match:
        lines.append(
            f"Състезателен календар: следващ мач след {next_match.get('daysUntilMatch')} дни "
            f"на {next_match.get('date')} срещу {next_match.get('opponent') or '—'} "
            f"({next_match.get('kind') or 'мач'})."
        )
        if next_match.get("daysUntilMatch") is not None and int(next_match["daysUntilMatch"]) <= 1:
            lines.append(
                "Препоръка: днес облекчена тренировка / активиране преди мач — "
                "нисък обем, познати елементи, без нови умения."
            )
        elif next_match.get("daysUntilMatch") == 2:
            lines.append("Препоръка: намален обем, акцент върху свежест и ключови елементи.")
    if assessment:
        lines.append(f"Физически/диагностичен сигнал от тестове: {assessment}")
    lines.extend(
        [
            "Области за съвет: техника (посрещане, сервис, атака, блок, защита), тактика, "
            "физика (отскок, кор, координация без тежести при юноши), психика (фокус, комуникация, "
            "справяне с грешки, роли в полето, напрежение преди мач), организация на микроцикъла.",
            "ПРАВИЛО: НЕ питай за възрастова група, етап от годината или отбор, ако вече са дадени по-горе. "
            "Питай само липсващото (напр. кой отбор при няколко).",
        ]
    )
    out["promptText"] = "\n".join(lines)
    return out
