from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.competition_kinds import competition_kind_label, is_valid_competition_kind
from app.models import (
    ClubCompetitionEvent,
    Team,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
    UserRole,
)
from app.schemas.competitions import CompetitionEventCreate, CompetitionEventRead, CompetitionEventUpdate
from app.schemas.schedule import (
    ScheduleExceptionCreate,
    ScheduleExceptionRead,
    ScheduleOccurrence,
    ScheduleOccurrencesResponse,
    ScheduleRuleCreate,
    ScheduleRuleRead,
    ScheduleRuleUpdate,
)
from app.services.schedule_competitions import (
    can_edit_competition,
    can_manage_team,
    load_competition_occurrences,
)

router = APIRouter()


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_head_coach(user: User) -> bool:
    return _role_value(user) == UserRole.club_head_coach.value


def _ensure_club(user: User) -> int:
    club_id = int(getattr(user, "club_id", 0) or 0)
    if club_id <= 0:
        raise HTTPException(status_code=422, detail="User is not assigned to a club")
    return club_id


def _parse_date(value: str, field: str) -> date:
    raw = (value or "").strip()
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{field} must be YYYY-MM-DD") from exc


def _parse_hhmm(value: str, field: str) -> tuple[int, int]:
    raw = (value or "").strip()
    if len(raw) != 5 or raw[2] != ":":
        raise HTTPException(status_code=422, detail=f"{field} must be HH:MM")
    try:
        hh = int(raw[:2])
        mm = int(raw[3:])
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{field} must be HH:MM") from exc
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        raise HTTPException(status_code=422, detail=f"{field} must be HH:MM")
    return hh, mm


def _time_to_minutes(hhmm: str) -> int:
    hh, mm = _parse_hhmm(hhmm, "time")
    return hh * 60 + mm


def _normalize_location(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def _validate_rule_payload(payload: ScheduleRuleCreate | ScheduleRuleUpdate) -> None:
    start = getattr(payload, "start_time", None)
    end = getattr(payload, "end_time", None)
    if start is not None:
        _parse_hhmm(start, "start_time")
    if end is not None:
        _parse_hhmm(end, "end_time")
    if start and end:
        if _time_to_minutes(end) <= _time_to_minutes(start):
            raise HTTPException(status_code=422, detail="end_time must be after start_time")

    ef = getattr(payload, "effective_from", None)
    et = getattr(payload, "effective_to", None)
    if ef is not None:
        _parse_date(ef, "effective_from")
    if et is not None and str(et).strip():
        _parse_date(et, "effective_to")
    if ef and et and str(et).strip():
        if str(et) < str(ef):
            raise HTTPException(status_code=422, detail="effective_to must be >= effective_from")


def _ensure_team_in_club(db: Session, club_id: int, team_id: int) -> Team:
    team = db.query(Team).filter(Team.id == int(team_id), Team.club_id == club_id).first()
    if not team:
        raise HTTPException(status_code=422, detail="Invalid team for this club")
    return team


def _ensure_coach_in_club(db: Session, club_id: int, coach_id: int) -> User:
    coach = (
        db.query(User)
        .filter(
            User.id == int(coach_id),
            User.club_id == club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not coach:
        raise HTTPException(status_code=422, detail="Invalid coach for this club")
    return coach


def _can_edit_rule(user: User, rule: TrainingScheduleRule) -> bool:
    if _is_head_coach(user):
        return True
    return int(rule.coach_id) == int(user.id)


def _rules_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return max(a_start, b_start) < min(a_end, b_end)


def _effective_ranges_overlap(a_from: str, a_to: str | None, b_from: str, b_to: str | None) -> bool:
    a_to_v = a_to or "9999-12-31"
    b_to_v = b_to or "9999-12-31"
    return not (a_to_v < b_from or b_to_v < a_from)


def _validate_location_conflicts(
    db: Session,
    *,
    club_id: int,
    rule_id: int | None,
    weekday: int,
    location: str,
    start_time: str,
    end_time: str,
    effective_from: str,
    effective_to: str | None,
) -> None:
    loc_norm = _normalize_location(location).lower()
    q = (
        db.query(TrainingScheduleRule)
        .filter(
            TrainingScheduleRule.club_id == club_id,
            TrainingScheduleRule.is_active.is_(True),
            TrainingScheduleRule.weekday == int(weekday),
        )
    )
    if rule_id:
        q = q.filter(TrainingScheduleRule.id != int(rule_id))
    candidates = q.all()
    s0 = _time_to_minutes(start_time)
    e0 = _time_to_minutes(end_time)
    for r in candidates:
        if _normalize_location(r.location).lower() != loc_norm:
            continue
        if not _effective_ranges_overlap(effective_from, effective_to, r.effective_from, r.effective_to):
            continue
        if _rules_overlap(s0, e0, _time_to_minutes(r.start_time), _time_to_minutes(r.end_time)):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Конфликт в графика: зала '{location}' вече е заета в "
                    f"{r.start_time}-{r.end_time} (ден {int(r.weekday) + 1}). "
                    "Изберете друга зала или час."
                ),
            )


def _validate_override_conflicts(
    db: Session,
    *,
    club_id: int,
    source_rule_id: int,
    on_date: str,
    location: str,
    start_time: str,
    end_time: str,
) -> None:
    d = _parse_date(on_date, "date")
    weekday = d.weekday()
    location_norm = _normalize_location(location).lower()
    start_m = _time_to_minutes(start_time)
    end_m = _time_to_minutes(end_time)

    rules = (
        db.query(TrainingScheduleRule)
        .filter(
            TrainingScheduleRule.club_id == club_id,
            TrainingScheduleRule.is_active.is_(True),
            TrainingScheduleRule.weekday == int(weekday),
            TrainingScheduleRule.effective_from <= on_date,
            (TrainingScheduleRule.effective_to.is_(None)) | (TrainingScheduleRule.effective_to >= on_date),
            TrainingScheduleRule.id != int(source_rule_id),
        )
        .all()
    )
    if not rules:
        return

    rule_ids = [r.id for r in rules]
    exc_rows = (
        db.query(TrainingScheduleException)
        .filter(TrainingScheduleException.rule_id.in_(rule_ids), TrainingScheduleException.date == on_date)
        .all()
    )
    exc_by_rule_id = {e.rule_id: e for e in exc_rows}

    for r in rules:
        exc = exc_by_rule_id.get(r.id)
        if exc and exc.kind == "cancelled":
            continue
        other_location = _normalize_location(exc.location) if exc and exc.kind == "override" and exc.location else _normalize_location(r.location)
        if other_location.lower() != location_norm:
            continue
        other_start = exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
        other_end = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time
        if _rules_overlap(start_m, end_m, _time_to_minutes(other_start), _time_to_minutes(other_end)):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Конфликт в графика: зала '{location}' е заета на {on_date} "
                    f"в {other_start}-{other_end}. Изберете друга зала или час."
                ),
            )


@router.get("/schedule", response_model=ScheduleOccurrencesResponse)
def list_schedule_occurrences(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    coach_id: int | None = Query(default=None),
    team_id: int | None = Query(default=None),
    location: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    club_id = _ensure_club(current_user)
    d0 = _parse_date(from_date, "from")
    d1 = _parse_date(to_date, "to")
    if d1 < d0:
        raise HTTPException(status_code=422, detail="to must be >= from")
    if (d1 - d0).days > 92:
        raise HTTPException(status_code=422, detail="Date range too large (max 92 days)")

    q = db.query(TrainingScheduleRule).filter(
        TrainingScheduleRule.club_id == club_id,
        TrainingScheduleRule.is_active.is_(True),
        TrainingScheduleRule.effective_from <= d1.isoformat(),
    )
    q = q.filter((TrainingScheduleRule.effective_to.is_(None)) | (TrainingScheduleRule.effective_to >= d0.isoformat()))
    if coach_id:
        q = q.filter(TrainingScheduleRule.coach_id == int(coach_id))
    if team_id:
        q = q.filter(TrainingScheduleRule.team_id == int(team_id))
    if location and location.strip():
        search = f"%{location.strip()}%"
        q = q.filter(TrainingScheduleRule.location.ilike(search))
    rules = q.all()

    items: list[ScheduleOccurrence] = []

    if rules:
        rule_ids = [r.id for r in rules]
        exc_rows = (
            db.query(TrainingScheduleException)
            .filter(
                TrainingScheduleException.rule_id.in_(rule_ids),
                TrainingScheduleException.date >= d0.isoformat(),
                TrainingScheduleException.date <= d1.isoformat(),
            )
            .all()
        )
        exc_by_key: dict[tuple[int, str], TrainingScheduleException] = {(e.rule_id, e.date): e for e in exc_rows}

        coach_ids: set[int] = {int(r.coach_id) for r in rules}
        team_ids: set[int] = {int(r.team_id) for r in rules}
        for e in exc_rows:
            if e.kind == "override":
                if e.coach_id:
                    coach_ids.add(int(e.coach_id))
                if e.team_id:
                    team_ids.add(int(e.team_id))

        coach_names = dict(db.query(User.id, User.name).filter(User.id.in_(coach_ids)).all()) if coach_ids else {}
        team_names = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all()) if team_ids else {}

        days = (d1 - d0).days
        for day_idx in range(days + 1):
            cur = d0 + timedelta(days=day_idx)
            weekday = cur.weekday()
            cur_s = cur.isoformat()
            for r in rules:
                if int(r.weekday) != int(weekday):
                    continue
                if r.effective_from > cur_s:
                    continue
                if r.effective_to and r.effective_to < cur_s:
                    continue
                exc = exc_by_key.get((r.id, cur_s))
                if exc and exc.kind == "cancelled":
                    continue

                coach_id_v = int(exc.coach_id) if exc and exc.kind == "override" and exc.coach_id else int(r.coach_id)
                team_id_v = int(exc.team_id) if exc and exc.kind == "override" and exc.team_id else int(r.team_id)
                location_v = (
                    _normalize_location(exc.location)
                    if exc and exc.kind == "override" and exc.location
                    else _normalize_location(r.location)
                )
                start_v = exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
                end_v = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time

                items.append(
                    ScheduleOccurrence(
                        date=cur_s,
                        weekday=weekday,
                        event_type="training",
                        rule_id=int(r.id),
                        exception_id=int(exc.id) if exc else None,
                        is_cancelled=False,
                        location=location_v,
                        start_time=start_v,
                        end_time=end_v,
                        coach_id=coach_id_v,
                        coach_name=coach_names.get(coach_id_v),
                        team_id=team_id_v,
                        team_name=team_names.get(team_id_v),
                    )
                )

    line_filter = None if _is_head_coach(current_user) else int(current_user.id)
    items.extend(
        load_competition_occurrences(
            db,
            club_id=club_id,
            d0=d0,
            d1=d1,
            coach_id=int(coach_id) if coach_id else None,
            team_id=int(team_id) if team_id else None,
            location=location,
            line_coach_user_id=line_filter,
        )
    )

    items.sort(key=lambda it: (it.date, it.start_time, it.location))
    return {"items": items}


@router.get("/schedule/rules", response_model=list[ScheduleRuleRead])
def list_schedule_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    q = db.query(TrainingScheduleRule).filter(TrainingScheduleRule.club_id == club_id)
    if not _is_head_coach(current_user):
        q = q.filter(TrainingScheduleRule.coach_id == int(current_user.id))
    return q.order_by(TrainingScheduleRule.is_active.desc(), TrainingScheduleRule.weekday.asc(), TrainingScheduleRule.start_time.asc()).all()


@router.post("/schedule/rules", response_model=ScheduleRuleRead, status_code=status.HTTP_201_CREATED)
def create_schedule_rule(
    payload: ScheduleRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    _validate_rule_payload(payload)

    team = _ensure_team_in_club(db, club_id, payload.team_id)
    if _is_head_coach(current_user):
        coach = _ensure_coach_in_club(db, club_id, payload.coach_id)
    else:
        if int(payload.coach_id) != int(current_user.id):
            raise HTTPException(status_code=403, detail="Треньорът може да добавя само свои тренировки")
        coach = current_user
    location = _normalize_location(payload.location)
    if not location:
        raise HTTPException(status_code=422, detail="location is required")

    _validate_location_conflicts(
        db,
        club_id=club_id,
        rule_id=None,
        weekday=payload.weekday,
        location=location,
        start_time=payload.start_time,
        end_time=payload.end_time,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )

    rule = TrainingScheduleRule(
        club_id=club_id,
        team_id=team.id,
        coach_id=coach.id,
        location=location,
        weekday=int(payload.weekday),
        start_time=payload.start_time,
        end_time=payload.end_time,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        is_active=bool(payload.is_active),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/schedule/rules/{rule_id}", response_model=ScheduleRuleRead)
def update_schedule_rule(
    rule_id: int,
    payload: ScheduleRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    rule = db.query(TrainingScheduleRule).filter(TrainingScheduleRule.id == int(rule_id), TrainingScheduleRule.club_id == club_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Schedule rule not found")
    if not _can_edit_rule(current_user, rule):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        return rule
    if not _is_head_coach(current_user) and "coach_id" in data and int(data.get("coach_id")) != int(current_user.id):
        raise HTTPException(status_code=403, detail="Треньорът може да променя само своите тренировки")

    # Apply updates into local candidates for conflict validation.
    weekday = int(data.get("weekday", rule.weekday))
    location = _normalize_location(data.get("location", rule.location))
    start_time = data.get("start_time", rule.start_time)
    end_time = data.get("end_time", rule.end_time)
    effective_from = data.get("effective_from", rule.effective_from)
    effective_to = data.get("effective_to", rule.effective_to)

    tmp = ScheduleRuleCreate(
        team_id=int(data.get("team_id", rule.team_id)),
        coach_id=int(data.get("coach_id", rule.coach_id)),
        location=location,
        weekday=weekday,
        start_time=start_time,
        end_time=end_time,
        effective_from=effective_from,
        effective_to=effective_to,
        is_active=bool(data.get("is_active", rule.is_active)),
    )
    _validate_rule_payload(tmp)

    team = _ensure_team_in_club(db, club_id, tmp.team_id)
    coach = _ensure_coach_in_club(db, club_id, tmp.coach_id)

    _validate_location_conflicts(
        db,
        club_id=club_id,
        rule_id=int(rule.id),
        weekday=weekday,
        location=location,
        start_time=start_time,
        end_time=end_time,
        effective_from=effective_from,
        effective_to=effective_to,
    )

    rule.team_id = team.id
    rule.coach_id = coach.id
    rule.location = location
    rule.weekday = weekday
    rule.start_time = start_time
    rule.end_time = end_time
    rule.effective_from = effective_from
    rule.effective_to = effective_to
    if "is_active" in data:
        rule.is_active = bool(data.get("is_active"))

    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/schedule/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    rule = db.query(TrainingScheduleRule).filter(TrainingScheduleRule.id == int(rule_id), TrainingScheduleRule.club_id == club_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Schedule rule not found")
    if not _can_edit_rule(current_user, rule):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    db.delete(rule)
    db.commit()
    return None


@router.post("/schedule/rules/{rule_id}/exceptions", response_model=ScheduleExceptionRead, status_code=status.HTTP_201_CREATED)
def create_schedule_exception(
    rule_id: int,
    payload: ScheduleExceptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    rule = db.query(TrainingScheduleRule).filter(TrainingScheduleRule.id == int(rule_id), TrainingScheduleRule.club_id == club_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Schedule rule not found")
    if not _can_edit_rule(current_user, rule):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    d = _parse_date(payload.date, "date")
    cur_s = d.isoformat()
    if cur_s < rule.effective_from:
        raise HTTPException(status_code=422, detail="Exception date is before rule effective_from")
    if rule.effective_to and cur_s > rule.effective_to:
        raise HTTPException(status_code=422, detail="Exception date is after rule effective_to")

    kind = str(payload.kind).strip().lower()
    if kind not in {"cancelled", "override"}:
        raise HTTPException(status_code=422, detail="Invalid exception kind")

    exc = (
        db.query(TrainingScheduleException)
        .filter(TrainingScheduleException.rule_id == rule.id, TrainingScheduleException.date == cur_s)
        .first()
    )
    if not exc:
        exc = TrainingScheduleException(rule_id=rule.id, date=cur_s, kind=kind)
        db.add(exc)
    exc.kind = kind

    if kind == "override":
        if payload.team_id is not None:
            _ensure_team_in_club(db, club_id, payload.team_id)
            exc.team_id = int(payload.team_id)
        if payload.coach_id is not None:
            _ensure_coach_in_club(db, club_id, payload.coach_id)
            exc.coach_id = int(payload.coach_id)
        if payload.location is not None:
            exc.location = _normalize_location(payload.location) or None
        if payload.start_time is not None:
            _parse_hhmm(payload.start_time, "start_time")
            exc.start_time = payload.start_time
        if payload.end_time is not None:
            _parse_hhmm(payload.end_time, "end_time")
            exc.end_time = payload.end_time
        if exc.start_time and exc.end_time and _time_to_minutes(exc.end_time) <= _time_to_minutes(exc.start_time):
            raise HTTPException(status_code=422, detail="end_time must be after start_time")
        if exc.location and exc.start_time and exc.end_time:
            _validate_override_conflicts(
                db,
                club_id=club_id,
                source_rule_id=rule.id,
                on_date=cur_s,
                location=exc.location,
                start_time=exc.start_time,
                end_time=exc.end_time,
            )
    else:
        exc.location = None
        exc.coach_id = None
        exc.team_id = None
        exc.start_time = None
        exc.end_time = None

    db.commit()
    db.refresh(exc)
    return exc


@router.delete("/schedule/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_exception(
    exception_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    exc = (
        db.query(TrainingScheduleException)
        .join(TrainingScheduleRule, TrainingScheduleRule.id == TrainingScheduleException.rule_id)
        .filter(TrainingScheduleException.id == int(exception_id), TrainingScheduleRule.club_id == club_id)
        .first()
    )
    if not exc:
        raise HTTPException(status_code=404, detail="Schedule exception not found")
    rule = db.query(TrainingScheduleRule).filter(TrainingScheduleRule.id == exc.rule_id).first()
    if not rule or not _can_edit_rule(current_user, rule):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    db.delete(exc)
    db.commit()
    return None


def _validate_competition_times(start_time: str, end_time: str) -> None:
    _parse_hhmm(start_time, "start_time")
    _parse_hhmm(end_time, "end_time")
    if _time_to_minutes(end_time) <= _time_to_minutes(start_time):
        raise HTTPException(status_code=422, detail="end_time must be after start_time")


def _competition_to_read(db: Session, event: ClubCompetitionEvent) -> CompetitionEventRead:
    team_name = db.query(Team.name).filter(Team.id == event.team_id).scalar()
    coach_name = db.query(User.name).filter(User.id == event.coach_id).scalar()
    kind = str(event.competition_kind)
    return CompetitionEventRead(
        id=int(event.id),
        club_id=int(event.club_id),
        team_id=int(event.team_id),
        coach_id=int(event.coach_id),
        date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        location=event.location,
        competition_kind=kind,
        competition_kind_label=competition_kind_label(kind),
        notes=event.notes,
        is_cancelled=bool(event.is_cancelled),
        created_at=event.created_at,
        updated_at=event.updated_at,
        team_name=team_name,
        coach_name=coach_name,
    )


def _resolve_competition_coach(
    db: Session,
    club_id: int,
    current_user: User,
    payload_coach_id: int,
    team: Team,
) -> User:
    if _is_head_coach(current_user):
        return _ensure_coach_in_club(db, club_id, payload_coach_id)
    if int(payload_coach_id) != int(current_user.id):
        raise HTTPException(status_code=403, detail="Треньорът може да добавя състезания само от свое име")
    return current_user


@router.get("/schedule/competitions", response_model=list[CompetitionEventRead])
def list_competition_events(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    coach_id: int | None = Query(default=None),
    team_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    d0 = _parse_date(from_date, "from")
    d1 = _parse_date(to_date, "to")
    if d1 < d0:
        raise HTTPException(status_code=422, detail="to must be >= from")
    line_filter = None if _is_head_coach(current_user) else int(current_user.id)
    occ = load_competition_occurrences(
        db,
        club_id=club_id,
        d0=d0,
        d1=d1,
        coach_id=int(coach_id) if coach_id else None,
        team_id=int(team_id) if team_id else None,
        location=None,
        line_coach_user_id=line_filter,
    )
    if not occ:
        return []
    comp_ids = [int(o.competition_id) for o in occ if o.competition_id]
    events = db.query(ClubCompetitionEvent).filter(ClubCompetitionEvent.id.in_(comp_ids)).all()
    by_id = {int(e.id): e for e in events}
    return [_competition_to_read(db, by_id[cid]) for cid in comp_ids if cid in by_id]


@router.post("/schedule/competitions", response_model=CompetitionEventRead, status_code=status.HTTP_201_CREATED)
def create_competition_event(
    payload: CompetitionEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    if not is_valid_competition_kind(payload.competition_kind):
        raise HTTPException(status_code=422, detail="Невалиден вид състезание")
    _parse_date(payload.date, "date")
    _validate_competition_times(payload.start_time, payload.end_time)
    team = _ensure_team_in_club(db, club_id, payload.team_id)
    if not can_manage_team(db, current_user, club_id, team.id, _is_head_coach(current_user)):
        raise HTTPException(status_code=403, detail="Нямате право за този отбор")
    coach = _resolve_competition_coach(db, club_id, current_user, payload.coach_id, team)
    location = _normalize_location(payload.location)
    if not location:
        raise HTTPException(status_code=422, detail="location is required")

    event = ClubCompetitionEvent(
        club_id=club_id,
        team_id=int(team.id),
        coach_id=int(coach.id),
        date=payload.date.strip(),
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=location,
        competition_kind=str(payload.competition_kind).strip(),
        notes=(payload.notes or "").strip() or None,
        is_cancelled=False,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _competition_to_read(db, event)


@router.put("/schedule/competitions/{event_id}", response_model=CompetitionEventRead)
def update_competition_event(
    event_id: int,
    payload: CompetitionEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    event = db.query(ClubCompetitionEvent).filter(ClubCompetitionEvent.id == int(event_id), ClubCompetitionEvent.club_id == club_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Състезанието не е намерено")
    if not can_edit_competition(db, current_user, event, _is_head_coach(current_user)):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if payload.competition_kind is not None:
        if not is_valid_competition_kind(payload.competition_kind):
            raise HTTPException(status_code=422, detail="Невалиден вид състезание")
        event.competition_kind = str(payload.competition_kind).strip()
    if payload.date is not None:
        _parse_date(payload.date, "date")
        event.date = payload.date.strip()
    if payload.start_time is not None:
        event.start_time = payload.start_time
    if payload.end_time is not None:
        event.end_time = payload.end_time
    if payload.start_time is not None or payload.end_time is not None:
        _validate_competition_times(event.start_time, event.end_time)
    if payload.location is not None:
        loc = _normalize_location(payload.location)
        if not loc:
            raise HTTPException(status_code=422, detail="location is required")
        event.location = loc
    if payload.notes is not None:
        event.notes = (payload.notes or "").strip() or None
    if payload.is_cancelled is not None:
        event.is_cancelled = bool(payload.is_cancelled)

    team = _ensure_team_in_club(db, club_id, payload.team_id if payload.team_id is not None else event.team_id)
    if payload.team_id is not None:
        if not can_manage_team(db, current_user, club_id, team.id, _is_head_coach(current_user)):
            raise HTTPException(status_code=403, detail="Нямате право за този отбор")
        event.team_id = int(team.id)

    if payload.coach_id is not None:
        coach = _resolve_competition_coach(db, club_id, current_user, payload.coach_id, team)
        event.coach_id = int(coach.id)
    elif payload.team_id is not None and not _is_head_coach(current_user):
        event.coach_id = int(current_user.id)

    db.commit()
    db.refresh(event)
    return _competition_to_read(db, event)


@router.delete("/schedule/competitions/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_competition_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    event = db.query(ClubCompetitionEvent).filter(ClubCompetitionEvent.id == int(event_id), ClubCompetitionEvent.club_id == club_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Състезанието не е намерено")
    if not can_edit_competition(db, current_user, event, _is_head_coach(current_user)):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    db.delete(event)
    db.commit()
    return None

