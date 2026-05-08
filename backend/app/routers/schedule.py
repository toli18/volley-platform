from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Team,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
    UserRole,
)
from app.schemas.schedule import (
    ScheduleExceptionCreate,
    ScheduleExceptionRead,
    ScheduleOccurrence,
    ScheduleOccurrencesResponse,
    ScheduleRuleCreate,
    ScheduleRuleRead,
    ScheduleRuleUpdate,
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
            raise HTTPException(status_code=409, detail="Conflict: another training is scheduled in this location and time")


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
    if not rules:
        return {"items": []}

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

    # Preload names for teams/coaches referenced by rules and overrides.
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

    # Materialize occurrences by scanning dates in range.
    items: list[ScheduleOccurrence] = []
    days = (d1 - d0).days
    for day_idx in range(days + 1):
        cur = d0 + timedelta(days=day_idx)
        weekday = cur.weekday()  # 0=Mon
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
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    club_id = _ensure_club(current_user)
    _validate_rule_payload(payload)

    team = _ensure_team_in_club(db, club_id, payload.team_id)
    coach = _ensure_coach_in_club(db, club_id, payload.coach_id)
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

