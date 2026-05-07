import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Athlete,
    AthletePayment,
    AttendanceRecord,
    Team,
    TeamMember,
    TeamSession,
    User,
    UserRole,
)
from app.schemas.teams import (
    AthleteAttendanceSummary,
    AthletePaymentMini,
    AthleteProfileResponse,
    AthleteTimelineEvent,
    AttendanceResponse,
    AttendanceSavePayload,
    TeamCreate,
    TeamAssignCoach,
    TeamAttendanceReportResponse,
    TeamAttendanceReportRow,
    TeamMembersResponse,
    TeamMemberAthleteRead,
    TeamRead,
    TeamUpdate,
    TeamMemberUpdate,
)

router = APIRouter()

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ATTENDANCE_STATUSES = {"present", "late", "absent", "excused"}


def _recent_month_keys(count: int = 12) -> list[str]:
    keys: list[str] = []
    now = datetime.utcnow()
    year, month = now.year, now.month
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return keys


def _dt_from_calendar_date(d: str, *, end_of_day: bool = False) -> datetime:
    if not d:
        return datetime.utcnow()
    hh, mm, ss = (23, 59, 59) if end_of_day else (12, 0, 0)
    try:
        y, mo, day = (int(x) for x in str(d).strip().split("-")[:3])
        return datetime(y, mo, day, hh, mm, ss)
    except Exception:
        return datetime.utcnow()


def _attendance_status_bg(status: str | None) -> str:
    if status == "present":
        return "Присъства"
    if status == "late":
        return "Закъсня"
    if status == "absent":
        return "Отсъства"
    if status == "excused":
        return "Извинен"
    return status or "—"


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_head_coach(user: User) -> bool:
    return _role_value(user) == UserRole.club_head_coach.value


def _ensure_team_owner(db: Session, team_id: int, user: User) -> Team:
    q = db.query(Team).filter(Team.id == team_id)
    if _is_head_coach(user):
        q = q.filter(Team.club_id == user.club_id)
    else:
        q = q.filter(Team.coach_id == user.id)
    team = q.first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


def _validate_date(raw: str) -> str:
    value = (raw or "").strip()
    if not DATE_RE.match(value):
        raise HTTPException(status_code=422, detail="date must be in format YYYY-MM-DD")
    return value


@router.get("/teams", response_model=list[TeamRead])
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    q = db.query(Team)
    if _is_head_coach(current_user):
        q = q.filter(Team.club_id == current_user.club_id)
    else:
        q = q.filter(Team.coach_id == current_user.id)
    return q.order_by(Team.is_active.desc(), Team.name.asc()).all()


@router.post("/teams", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    team = Team(
        coach_id=current_user.id,
        club_id=current_user.club_id,
        name=name,
        age_group=(payload.age_group or "").strip() or None,
        season=(payload.season or "").strip() or None,
        is_active=bool(payload.is_active),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.put("/teams/{team_id}", response_model=TeamRead)
def update_team(
    team_id: int,
    payload: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="name cannot be empty")
        team.name = name
    if "age_group" in data:
        team.age_group = (data.get("age_group") or "").strip() or None
    if "season" in data:
        team.season = (data.get("season") or "").strip() or None
    if "is_active" in data:
        team.is_active = bool(data.get("is_active"))
    team.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(team)
    return team


@router.put("/teams/{team_id}/assign-coach", response_model=TeamRead)
def assign_team_coach(
    team_id: int,
    payload: TeamAssignCoach,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    if not _is_head_coach(current_user):
        raise HTTPException(status_code=403, detail="Only club head coach can assign team coach")

    team = _ensure_team_owner(db, team_id, current_user)
    target_coach_id = int(payload.coach_id)
    target_coach = (
        db.query(User)
        .filter(
            User.id == target_coach_id,
            User.club_id == current_user.club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not target_coach:
        raise HTTPException(status_code=422, detail="Selected coach is invalid for this club")

    team.coach_id = target_coach_id
    team.updated_at = datetime.utcnow()

    active_member_ids = [
        x.athlete_id
        for x in db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.is_active.is_(True))
        .all()
    ]
    if active_member_ids:
        (
            db.query(Athlete)
            .filter(Athlete.id.in_(active_member_ids), Athlete.club_id == current_user.club_id)
            .update({Athlete.coach_id: target_coach_id}, synchronize_session=False)
        )

    db.commit()
    db.refresh(team)
    return team


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    db.delete(team)
    db.commit()
    return None


@router.get("/teams/{team_id}/members", response_model=TeamMembersResponse)
def get_team_members(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    members = (
        db.query(TeamMember, Athlete)
        .join(Athlete, Athlete.id == TeamMember.athlete_id)
        .filter(TeamMember.team_id == team.id, TeamMember.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    result = [
        TeamMemberAthleteRead(
            athlete_id=a.id,
            athlete_name=a.athlete_name,
            parent_name=a.parent_name,
            parent_phone=a.parent_phone,
            athlete_phone=a.athlete_phone,
            is_active=bool(a.is_active),
        )
        for _, a in members
    ]
    return TeamMembersResponse(team=team, members=result)


@router.put("/teams/{team_id}/members", response_model=TeamMembersResponse)
def replace_team_members(
    team_id: int,
    payload: TeamMemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    desired_ids = sorted(set(int(x) for x in (payload.athlete_ids or []) if x))
    if desired_ids:
        owned_query = db.query(Athlete).filter(Athlete.id.in_(desired_ids))
        if _is_head_coach(current_user):
            owned_query = owned_query.filter(Athlete.club_id == current_user.club_id)
        else:
            owned_query = owned_query.filter(Athlete.coach_id == current_user.id)
        if owned_query.count() != len(desired_ids):
            raise HTTPException(status_code=422, detail="One or more athletes are invalid for this club/coach")

    existing = db.query(TeamMember).filter(TeamMember.team_id == team.id).all()
    existing_map = {m.athlete_id: m for m in existing}

    for athlete_id, member in existing_map.items():
        if athlete_id not in desired_ids and member.is_active:
            member.is_active = False
            member.left_at = datetime.utcnow()

    for athlete_id in desired_ids:
        member = existing_map.get(athlete_id)
        if member:
            member.is_active = True
            member.left_at = None
        else:
            db.add(TeamMember(team_id=team.id, athlete_id=athlete_id, is_active=True))

    db.commit()
    return get_team_members(team_id, db, current_user)


@router.get("/teams/{team_id}/attendance", response_model=AttendanceResponse)
def get_team_attendance_by_date(
    team_id: int,
    date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    day = _validate_date(date)
    session = (
        db.query(TeamSession)
        .filter(TeamSession.team_id == team.id, TeamSession.date == day)
        .first()
    )
    members = (
        db.query(TeamMember, Athlete)
        .join(Athlete, Athlete.id == TeamMember.athlete_id)
        .filter(TeamMember.team_id == team.id, TeamMember.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    status_map: dict[int, AttendanceRecord] = {}
    if session:
        records = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.session_id == session.id)
            .all()
        )
        status_map = {r.athlete_id: r for r in records}

    items = []
    for _, athlete in members:
        rec = status_map.get(athlete.id)
        items.append(
            {
                "athlete_id": athlete.id,
                "athlete_name": athlete.athlete_name,
                "status": rec.status if rec else "present",
                "note": rec.note if rec else None,
            }
        )

    return AttendanceResponse(
        team_id=team.id,
        session_id=session.id if session else None,
        date=day,
        title=session.title if session else None,
        notes=session.notes if session else None,
        items=items,
    )


@router.post("/teams/{team_id}/attendance", response_model=AttendanceResponse)
def save_team_attendance(
    team_id: int,
    payload: AttendanceSavePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    day = _validate_date(payload.date)
    session = (
        db.query(TeamSession)
        .filter(TeamSession.team_id == team.id, TeamSession.date == day)
        .first()
    )
    if not session:
        session = TeamSession(team_id=team.id, date=day)
        db.add(session)
        db.flush()

    session.title = (payload.title or "").strip() or None
    session.notes = (payload.notes or "").strip() or None

    member_ids = {
        x.athlete_id
        for x in db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.is_active.is_(True))
        .all()
    }

    existing_records = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session.id).all()
    existing_map = {r.athlete_id: r for r in existing_records}

    for item in payload.items:
        if item.athlete_id not in member_ids:
            continue
        st = str(item.status or "").strip().lower()
        if st not in ATTENDANCE_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid attendance status: {item.status}")
        rec = existing_map.get(item.athlete_id)
        if rec:
            rec.status = st
            rec.note = (item.note or "").strip() or None
            rec.updated_at = datetime.utcnow()
        else:
            db.add(
                AttendanceRecord(
                    session_id=session.id,
                    athlete_id=item.athlete_id,
                    status=st,
                    note=(item.note or "").strip() or None,
                )
            )

    db.commit()
    return get_team_attendance_by_date(team_id, day, db, current_user)


@router.get("/teams/{team_id}/attendance/report", response_model=TeamAttendanceReportResponse)
def team_attendance_report(
    team_id: int,
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    start = _validate_date(from_date)
    end = _validate_date(to_date)
    if start > end:
        raise HTTPException(status_code=422, detail="from_date must be <= to_date")

    members = (
        db.query(TeamMember, Athlete)
        .join(Athlete, Athlete.id == TeamMember.athlete_id)
        .filter(TeamMember.team_id == team.id, TeamMember.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    member_map = {
        athlete.id: {
            "athlete_id": athlete.id,
            "athlete_name": athlete.athlete_name,
            "present": 0,
            "late": 0,
            "absent": 0,
            "excused": 0,
            "total": 0,
        }
        for _, athlete in members
    }

    sessions = (
        db.query(TeamSession)
        .filter(
            TeamSession.team_id == team.id,
            TeamSession.date >= start,
            TeamSession.date <= end,
        )
        .all()
    )
    session_ids = [s.id for s in sessions]
    records = []
    if session_ids:
        records = db.query(AttendanceRecord).filter(AttendanceRecord.session_id.in_(session_ids)).all()

    for rec in records:
        row = member_map.get(rec.athlete_id)
        if not row:
            continue
        st = str(rec.status or "").strip().lower()
        if st not in ATTENDANCE_STATUSES:
            continue
        row[st] += 1
        row["total"] += 1

    out_rows = []
    for row in member_map.values():
        rate = round(((row["present"] + row["late"]) / row["total"] * 100.0), 1) if row["total"] else 0.0
        out_rows.append(
            TeamAttendanceReportRow(
                athlete_id=row["athlete_id"],
                athlete_name=row["athlete_name"],
                present=row["present"],
                late=row["late"],
                absent=row["absent"],
                excused=row["excused"],
                total=row["total"],
                attendance_rate_percent=rate,
            )
        )

    return TeamAttendanceReportResponse(
        team_id=team.id,
        from_date=start,
        to_date=end,
        sessions_count=len(sessions),
        rows=out_rows,
    )


@router.get("/teams/athletes/{athlete_id}/profile", response_model=AthleteProfileResponse)
def athlete_profile(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    athlete = (
        db.query(Athlete)
        .filter(
            Athlete.id == athlete_id,
            Athlete.club_id == current_user.club_id if _is_head_coach(current_user) else Athlete.coach_id == current_user.id,
        )
        .first()
    )
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    team_rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(
            Team.club_id == current_user.club_id if _is_head_coach(current_user) else Team.coach_id == current_user.id,
            TeamMember.athlete_id == athlete.id,
            TeamMember.is_active.is_(True),
        )
        .all()
    )
    teams = [row[0] for row in team_rows]

    attendance_rows = (
        db.query(AttendanceRecord.status, TeamSession.date, Team.name)
        .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
        .join(Team, Team.id == TeamSession.team_id)
        .filter(
            AttendanceRecord.athlete_id == athlete.id,
            Team.club_id == current_user.club_id if _is_head_coach(current_user) else Team.coach_id == current_user.id,
        )
        .order_by(TeamSession.date.desc())
        .limit(50)
        .all()
    )
    present = sum(1 for s, _, _ in attendance_rows if s == "present")
    late = sum(1 for s, _, _ in attendance_rows if s == "late")
    absent = sum(1 for s, _, _ in attendance_rows if s == "absent")
    excused = sum(1 for s, _, _ in attendance_rows if s == "excused")
    total = len(attendance_rows)
    attendance_rate = round(((present + late) / total * 100.0), 1) if total else 0.0

    month_window = _recent_month_keys(12)
    payments_in_window = (
        db.query(AthletePayment)
        .filter(
            AthletePayment.athlete_id == athlete.id,
            AthletePayment.month_key.in_(month_window),
        )
        .all()
    )
    pay_by_month = {p.month_key: p for p in payments_in_window}
    payer_ids = {p.coach_id for p in payments_in_window}
    payer_lookup = dict(db.query(User.id, User.name).filter(User.id.in_(payer_ids)).all()) if payer_ids else {}

    payment_rows: list[AthletePaymentMini] = []
    for mk in month_window:
        p = pay_by_month.get(mk)
        if p:
            payment_rows.append(
                AthletePaymentMini(
                    month_key=mk,
                    amount=float(p.amount or 0),
                    paid_at=p.paid_at,
                    paid=True,
                    recorded_by_name=payer_lookup.get(p.coach_id),
                )
            )
        else:
            payment_rows.append(AthletePaymentMini(month_key=mk, amount=0, paid_at=None, paid=False))

    last_attendance = [
        {"status": status, "date": date, "team_name": team_name}
        for status, date, team_name in attendance_rows[:15]
    ]

    raw_timeline: list[dict] = []
    coach_name_row = db.query(User.name).filter(User.id == athlete.coach_id).first()
    primary_coach_name = coach_name_row[0] if coach_name_row else None

    created_at_v = getattr(athlete, "created_at", None)
    updated_at_v = getattr(athlete, "updated_at", None)

    if created_at_v:
        raw_timeline.append(
            {
                "at": created_at_v,
                "kind": "created",
                "label": "Създаване на състезател",
                "detail": None,
                "actor_name": primary_coach_name,
            }
        )

    create_ts = created_at_v or datetime.utcnow()
    update_ts = updated_at_v or create_ts
    if update_ts and create_ts and abs((update_ts - create_ts).total_seconds()) > 120:
        raw_timeline.append(
            {
                "at": update_ts,
                "kind": "profile_update",
                "label": "Актуализиран запис",
                "detail": "Профил, треньор или други данни (няма отделен журнал за типа промяна)",
                "actor_name": None,
            }
        )

    team_visibility = Team.club_id == current_user.club_id if _is_head_coach(current_user) else Team.coach_id == current_user.id

    membership_rows = (
        db.query(TeamMember, Team.name)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(TeamMember.athlete_id == athlete.id, team_visibility)
        .order_by(TeamMember.joined_at.asc())
        .limit(80)
        .all()
    )
    for tm, tname in membership_rows:
        jt = getattr(tm, "joined_at", None)
        if jt:
            raw_timeline.append(
                {
                    "at": jt,
                    "kind": "team_join",
                    "label": "Добавен към отбор",
                    "detail": tname,
                    "actor_name": None,
                }
            )

    pay_history = (
        db.query(AthletePayment)
        .filter(AthletePayment.athlete_id == athlete.id)
        .order_by(AthletePayment.paid_at.desc())
        .limit(40)
        .all()
    )
    payer_all = {p.coach_id for p in pay_history}
    payer_all_names = dict(db.query(User.id, User.name).filter(User.id.in_(payer_all)).all()) if payer_all else {}
    for p in pay_history:
        raw_timeline.append(
            {
                "at": p.paid_at or p.created_at,
                "kind": "payment",
                "label": "Плащане месечна такса",
                "detail": f"{p.month_key} · {float(p.amount or 0):.2f} лв.",
                "actor_name": payer_all_names.get(p.coach_id),
            }
        )

    for status, session_date, team_name in attendance_rows[:25]:
        raw_timeline.append(
            {
                "at": _dt_from_calendar_date(session_date),
                "kind": "attendance",
                "label": f"Присъствие: {_attendance_status_bg(status)}",
                "detail": team_name or None,
                "actor_name": None,
            }
        )

    raw_timeline.sort(key=lambda row: row["at"], reverse=True)
    timeline = [AthleteTimelineEvent(**row) for row in raw_timeline[:100]]

    return AthleteProfileResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        parent_name=athlete.parent_name,
        parent_phone=athlete.parent_phone,
        athlete_phone=athlete.athlete_phone,
        notes=athlete.notes,
        is_active=bool(athlete.is_active),
        created_at=created_at_v,
        updated_at=updated_at_v,
        teams=teams,
        attendance_summary=AthleteAttendanceSummary(
            present=present,
            late=late,
            absent=absent,
            excused=excused,
            total=total,
            attendance_rate_percent=attendance_rate,
        ),
        last_attendance=last_attendance,
        monthly_payments=payment_rows,
        timeline=timeline,
    )
