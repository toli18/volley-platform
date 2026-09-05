"""Контекст за AI помощника: треньор → отбори → програма → календар → тестове."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    BvfCardIndex,
    BvfCardIndexMember,
    ClubCompetitionEvent,
    ClubCycleInstance,
    MethodCycle,
    MethodicalIndexSnapshot,
    Team,
    TeamMember,
    User,
    UserRole,
)
from app.national_method.annual_program import (
    ensure_annual_program_seeded,
    resolve_annual_program_band,
)
from app.national_method.content_policy import is_annual_program_cycle
from app.national_method.program_position import monday_of
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


def _team_sex_code(team: Team) -> Optional[int]:
    g = str(team.gender or "").strip().lower()
    if g in {"female", "f", "w", "women", "1"}:
        return 1
    if g in {"male", "m", "men", "0"}:
        return 0
    name = str(team.name or "").lower()
    if any(x in name for x in ("девой", "момич", "жен", "момичета")):
        return 1
    if any(x in name for x in ("момч", "мъж", "юнош", "момчета")):
        return 0
    return None


def _team_age_numbers(team: Team) -> set[int]:
    """Извлечи възрастови кодове (12/13/14/16/18…) от age_group и име."""
    import re

    found: set[int] = set()
    blob = f"{team.age_group or ''} {team.name or ''}"
    for m in re.finditer(r"(?:u|под|до)?\s*(\d{2})", blob, flags=re.IGNORECASE):
        n = int(m.group(1))
        if 10 <= n <= 21:
            found.add(n)
    band = resolve_annual_program_band(team.age_group)
    if band in _BAND_YEARS:
        found.add(int(_BAND_YEARS[band]))
    return found


def _season_years_for(today: date) -> set[int]:
    start = default_season_start(today)
    return {start.year, today.year, today.year - 1}


def _card_index_label(ci: BvfCardIndex) -> str:
    label = ci.age_group or f"Под {ci.age}"
    sex_label = "жени" if int(ci.sex) == 1 else "мъже"
    return f"{label} · {sex_label} · {ci.year}"


def related_card_indexes_for_team(
    db: Session, team: Team, *, today: Optional[date] = None, limit: int = 6
) -> list[dict[str, Any]]:
    """Връзка група ↔ картотеки: първо общи спортисти, после резервна евристика.

    Основно правило: спортисти от тренировъчната група, които са и в картотека C →
    групата „познава“ мачовете на C.
    """
    today = today or date.today()
    if not team.club_id:
        return []

    years = _season_years_for(today)
    member_ids = {
        int(r[0])
        for r in db.query(TeamMember.athlete_id)
        .filter(TeamMember.team_id == int(team.id), TeamMember.is_active.is_(True))
        .all()
        if r[0]
    }

    out: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    # --- 1) Основен сигнал: застъпване на състав ---
    if member_ids:
        overlap_rows = (
            db.query(
                BvfCardIndexMember.card_index_id,
                func.count(BvfCardIndexMember.athlete_id).label("overlap"),
            )
            .join(BvfCardIndex, BvfCardIndex.id == BvfCardIndexMember.card_index_id)
            .filter(
                BvfCardIndexMember.athlete_id.in_(list(member_ids)),
                BvfCardIndex.club_id == int(team.club_id),
                BvfCardIndex.year.in_(list(years)),
            )
            .group_by(BvfCardIndexMember.card_index_id)
            .all()
        )
        # Праг: ≥1 общ спортист; сортирай по overlap
        overlap_rows = sorted(overlap_rows, key=lambda r: (-int(r.overlap), int(r.card_index_id)))
        ci_ids = [int(r.card_index_id) for r in overlap_rows if int(r.overlap) >= 1]
        if ci_ids:
            cis = {
                int(c.id): c
                for c in db.query(BvfCardIndex).filter(BvfCardIndex.id.in_(ci_ids)).all()
            }
            roster_sizes = {
                int(r[0]): int(r[1])
                for r in (
                    db.query(BvfCardIndexMember.card_index_id, func.count(BvfCardIndexMember.id))
                    .filter(BvfCardIndexMember.card_index_id.in_(ci_ids))
                    .group_by(BvfCardIndexMember.card_index_id)
                    .all()
                )
            }
            team_size = max(len(member_ids), 1)
            for row in overlap_rows:
                cid = int(row.card_index_id)
                ci = cis.get(cid)
                if not ci:
                    continue
                overlap = int(row.overlap)
                card_size = max(roster_sizes.get(cid, overlap), 1)
                pct_card = round(100.0 * overlap / card_size)
                pct_team = round(100.0 * overlap / team_size)
                # слаби единични връзки: пак ги показваме, но с по-нисък score
                score = 20 + overlap * 10 + min(pct_card, 40)
                out.append(
                    {
                        "id": ci.id,
                        "label": _card_index_label(ci),
                        "age": ci.age,
                        "ageGroup": ci.age_group,
                        "sex": ci.sex,
                        "year": ci.year,
                        "score": score,
                        "overlapAthletes": overlap,
                        "cardRosterSize": card_size,
                        "teamRosterSize": team_size,
                        "overlapPctOfCard": pct_card,
                        "overlapPctOfTeam": pct_team,
                        "reasons": [f"{overlap} общи спортисти"],
                        "linkKind": "roster_overlap",
                    }
                )
                seen_ids.add(cid)

    # --- 2) Резерва: възраст/пол/треньор само ако няма нито едно overlap ---
    if not out:
        rows = (
            db.query(BvfCardIndex)
            .filter(BvfCardIndex.club_id == int(team.club_id), BvfCardIndex.year.in_(list(years)))
            .order_by(BvfCardIndex.year.desc(), BvfCardIndex.age.asc())
            .limit(40)
            .all()
        )
        team_sex = _team_sex_code(team)
        team_ages = _team_age_numbers(team)
        team_coach = int(team.coach_id) if team.coach_id else None
        scored: list[tuple[int, BvfCardIndex, list[str]]] = []
        for ci in rows:
            if int(ci.id) in seen_ids:
                continue
            score = 0
            reasons: list[str] = []
            if team_sex is not None and int(ci.sex) == team_sex:
                score += 3
                reasons.append("пол")
            if team_ages and int(ci.age) in team_ages:
                score += 6
                reasons.append(f"възраст {ci.age}")
            elif team_ages and any(abs(int(ci.age) - a) <= 1 for a in team_ages):
                score += 3
                reasons.append(f"близка възраст {ci.age}")
            if team_coach and (
                ci.assigned_coach_user_id == team_coach or ci.second_coach_user_id == team_coach
            ):
                score += 4
                reasons.append("същият треньор")
            if score >= 8:  # по-строг праг — само ясни съвпадения
                scored.append((score, ci, reasons))
        scored.sort(key=lambda x: (-x[0], -x[1].year, x[1].age))
        for score, ci, reasons in scored[:limit]:
            out.append(
                {
                    "id": ci.id,
                    "label": _card_index_label(ci),
                    "age": ci.age,
                    "ageGroup": ci.age_group,
                    "sex": ci.sex,
                    "year": ci.year,
                    "score": score,
                    "overlapAthletes": 0,
                    "cardRosterSize": 0,
                    "teamRosterSize": len(member_ids),
                    "overlapPctOfCard": 0,
                    "overlapPctOfTeam": 0,
                    "reasons": reasons,
                    "linkKind": "heuristic_fallback",
                }
            )

    out.sort(
        key=lambda x: (
            0 if x.get("linkKind") == "roster_overlap" else 1,
            -int(x.get("overlapAthletes") or 0),
            -int(x.get("score") or 0),
        )
    )
    return out[:limit]


def _next_competition(db: Session, team: Team, today: date) -> Optional[dict[str, Any]]:
    """Следващ мач: група ИЛИ свързана картотека (предпочитай по-голям overlap)."""
    related = related_card_indexes_for_team(db, team, today=today)
    related_by_id = {int(r["id"]): r for r in related if r.get("id")}
    related_ids = list(related_by_id.keys())

    q = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.date >= today.isoformat(),
            ClubCompetitionEvent.date <= (today + timedelta(days=28)).isoformat(),
        )
        .order_by(ClubCompetitionEvent.date.asc(), ClubCompetitionEvent.start_time.asc())
    )
    if team.club_id:
        q = q.filter(ClubCompetitionEvent.club_id == int(team.club_id))
    rows = q.limit(50).all()

    team_event_ids = {int(e.id) for e in rows if e.team_id == team.id}
    team_rows = [e for e in rows if int(e.id) in team_event_ids]
    card_rows = [
        e
        for e in rows
        if e.card_index_id
        and int(e.card_index_id) in related_ids
        and int(e.id) not in team_event_ids
    ]

    def _card_overlap(ev: ClubCompetitionEvent) -> int:
        if not ev.card_index_id:
            return 0
        return int((related_by_id.get(int(ev.card_index_id)) or {}).get("overlapAthletes") or 0)

    card_rows.sort(key=lambda e: (str(e.date), -_card_overlap(e), str(e.start_time or "")))

    upcoming = _upcoming_matches_payload(
        team_rows, card_rows, related_by_id, team_event_ids=team_event_ids, today=today, limit=5
    )
    pick = team_rows[0] if team_rows else (card_rows[0] if card_rows else None)
    if not pick:
        return None

    source = "training_group" if int(pick.id) in team_event_ids else "card_index"
    try:
        days = (date.fromisoformat(str(pick.date)) - today).days
    except ValueError:
        days = None
    related_meta = related_by_id.get(int(pick.card_index_id)) if pick.card_index_id else None
    return {
        "date": pick.date,
        "opponent": getattr(pick, "opponent_name", None) or "",
        "kind": getattr(pick, "competition_kind", None) or "",
        "daysUntilMatch": days,
        "location": getattr(pick, "location", None) or "",
        "teamId": getattr(pick, "team_id", None),
        "cardIndexId": getattr(pick, "card_index_id", None),
        "cardIndexLabel": (related_meta or {}).get("label"),
        "linkedToTrainingGroup": int(pick.id) in team_event_ids,
        "source": source,
        "overlapAthletes": int((related_meta or {}).get("overlapAthletes") or 0),
        "relatedCardIndexes": related,
        "upcomingMatches": upcoming,
    }


def _upcoming_matches_payload(
    team_rows: list,
    card_rows: list,
    related_by_id: dict[int, dict[str, Any]],
    *,
    team_event_ids: set[int],
    today: date,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Обединен списък предстоящи мачове (група + свързани картотеки)."""
    by_id: dict[int, Any] = {}
    for e in team_rows + card_rows:
        by_id[int(e.id)] = e
    ordered = sorted(by_id.values(), key=lambda e: (str(e.date), str(e.start_time or "")))
    out: list[dict[str, Any]] = []
    for e in ordered[:limit]:
        meta = related_by_id.get(int(e.card_index_id)) if e.card_index_id else None
        try:
            days = (date.fromisoformat(str(e.date)) - today).days
        except ValueError:
            days = None
        is_group = int(e.id) in team_event_ids
        out.append(
            {
                "id": e.id,
                "date": e.date,
                "startTime": e.start_time,
                "opponent": getattr(e, "opponent_name", None) or "",
                "kind": getattr(e, "competition_kind", None) or "",
                "location": getattr(e, "location", None) or "",
                "daysUntilMatch": days,
                "teamId": e.team_id,
                "cardIndexId": e.card_index_id,
                "cardIndexLabel": (meta or {}).get("label"),
                "overlapAthletes": int((meta or {}).get("overlapAthletes") or 0),
                "source": "training_group" if is_group else "card_index",
            }
        )
    return out


def _week_offset_for(today: date, target: date) -> int:
    """Колко седмици (пон–нед) е target спрямо календарната седмица на today."""
    return (monday_of(target) - monday_of(today)).days // 7


def _program_day_on(week: dict[str, Any], target: date) -> Optional[dict[str, Any]]:
    """Само точен ден по дата — без fallback към понеделник (това чупеше URL date)."""
    target_iso = target.isoformat()
    for d in week.get("days") or []:
        if d.get("date") == target_iso:
            return d
    return None


def _soft_program_day(week: dict[str, Any], target: date) -> Optional[dict[str, Any]]:
    """Тема/фокус: точен ден, иначе следващ upcoming, иначе None (не days[0])."""
    exact = _program_day_on(week, target)
    if exact:
        return exact
    for d in week.get("days") or []:
        if d.get("execution_status") == "upcoming" and d.get("has_program_day"):
            return d
    return None


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
    for_date: Optional[date] = None,
) -> dict[str, Any]:
    """Пълен контекст за чат/UI.

    for_date — закачен ден от URL/календар (води за sessionDate).
    today — реалният календарен ден (за week_offset и „дни до мач“).
    """
    today = today or date.today()
    target = for_date or today
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

    week_offset = _week_offset_for(today, target)
    week = build_program_week(db, active, week_offset=week_offset, today=today)
    day = _program_day_on(week, target) if week.get("has_program") else None
    soft_day = _soft_program_day(week, target) if week.get("has_program") else None
    theme_day = day or soft_day
    next_match = _next_competition(db, active, today)
    related_cards = (next_match or {}).get("relatedCardIndexes") or related_card_indexes_for_team(
        db, active, today=today
    )
    assessment = _assessment_hint(db, int(active.id))

    age_band = week.get("age_band") or resolve_annual_program_band(active.age_group)
    focus_tokens = list((theme_day or {}).get("focus") or week.get("week_focus") or [])
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

    # sessionDate винаги е целевият ден (URL/календар), не fallback понеделник
    generate_defaults: dict[str, Any] = {
        "teamId": active.id,
        "ageBand": age_band,
        "age": _BAND_YEARS.get(str(age_band), 15),
        "sessionDate": target.isoformat(),
        "mainFocus": main_focus,
        "secondaryFocus": secondary_focus,
        "periodPhase": period_phase,
        "intensityTarget": intensity,
        "orientation": orientation,
        "programTheme": (theme_day or {}).get("theme") or week.get("week_theme"),
        "textbookSlug": (theme_day or {}).get("textbook_slug") or "",
        "daysUntilMatch": days_until,
        "assistantOverride": False,
        "datePinned": bool(for_date),
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
        "targetDate": target.isoformat(),
        "today": {
            "date": (theme_day or {}).get("date") or target.isoformat(),
            "weekday": (theme_day or {}).get("weekday_label"),
            "theme": (theme_day or {}).get("theme"),
            "focus": (theme_day or {}).get("focus") or [],
            "sessionGoal": (theme_day or {}).get("session_goal"),
            "intensity": (theme_day or {}).get("intensity"),
            "textbookSlug": (theme_day or {}).get("textbook_slug"),
            "exactMatch": bool(day),
        },
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
        "relatedCardIndexes": related_cards,
        "upcomingMatches": (next_match or {}).get("upcomingMatches") or [],
    }
    out["assessmentHint"] = assessment
    out["generateDefaults"] = generate_defaults
    out["needsTeamPick"] = len(teams) > 1 and (not team_id)

    facts = [
        f"треньор: {out['coachName'] or '—'}",
        f"тренировъчна група: {active.name} ({age_band})",
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
    if related_cards:
        bits = []
        for c in related_cards[:3]:
            lab = str(c.get("label") or c.get("id"))
            ov = int(c.get("overlapAthletes") or 0)
            if c.get("linkKind") == "roster_overlap" and ov:
                bits.append(f"{lab} ({ov} общи)")
            else:
                bits.append(f"{lab} (резервна връзка)")
        facts.append("картотеки в групата: " + ", ".join(bits))
    if next_match and next_match.get("daysUntilMatch") is not None:
        if next_match.get("source") == "card_index":
            ov = next_match.get("overlapAthletes") or 0
            scope = (
                f"от картотека ({next_match.get('cardIndexLabel') or 'СЕК'}"
                + (f", {ov} общи" if ov else "")
                + ")"
            )
        elif next_match.get("linkedToTrainingGroup"):
            scope = "за тази група"
        else:
            scope = "в календара"
        facts.append(
            f"следващ мач {scope} след {next_match['daysUntilMatch']} дн. "
            f"({next_match.get('date')} vs {next_match.get('opponent') or '—'})"
        )
    if assessment:
        facts.append(f"тестове: {assessment}")
    out["knownFacts"] = facts

    lines = [
        f"Треньор: {out['coachName'] or 'неизвестен'}",
        f"Тренировъчна група: {active.name} | възраст: {active.age_group or age_band} | band: {age_band}",
        f"Пол: {active.gender or '—'} | сезон: {active.season or '—'}",
        "Забележка: тренировките се записват към тренировъчна група. "
        "Картотечните отбори се разпознават автоматично по общи спортисти в състава; "
        "мачовете им в календара влизат в контекста (taper / подготовка).",
    ]
    if len(teams) > 1:
        lines.append(
            "Групи на треньора: "
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
    if related_cards:
        lines.append(
            "Картотечни отбори с общи спортисти в тази група: "
            + "; ".join(
                f"{c.get('label')} ({c.get('overlapAthletes') or 0} общи, {c.get('linkKind')})"
                for c in related_cards[:4]
            )
        )
    if next_match:
        src = next_match.get("source") or ""
        card_bit = ""
        if next_match.get("cardIndexLabel"):
            card_bit = f" | картотека: {next_match.get('cardIndexLabel')}"
            if next_match.get("overlapAthletes"):
                card_bit += f" ({next_match.get('overlapAthletes')} общи спортисти)"
        lines.append(
            f"Състезателен календар: следващ мач след {next_match.get('daysUntilMatch')} дни "
            f"на {next_match.get('date')} срещу {next_match.get('opponent') or '—'} "
            f"({next_match.get('kind') or 'мач'}; източник={src or '—'}{card_bit})."
        )
        upcoming = next_match.get("upcomingMatches") or []
        if len(upcoming) > 1:
            lines.append(
                "Предстоящи мачове: "
                + " | ".join(
                    f"{m.get('date')} vs {m.get('opponent') or '—'} "
                    f"[{m.get('source')}"
                    + (f"/{m.get('cardIndexLabel')}" if m.get("cardIndexLabel") else "")
                    + "]"
                    for m in upcoming[:4]
                )
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
