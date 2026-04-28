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
    AttendanceResponse,
    AttendanceSavePayload,
    TeamCreate,
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


def _ensure_team_owner(db: Session, team_id: int, user: User) -> Team:
    team = db.query(Team).filter(Team.id == team_id, Team.coach_id == user.id).first()
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
    return (
        db.query(Team)
        .filter(Team.coach_id == current_user.id)
        .order_by(Team.is_active.desc(), Team.name.asc())
        .all()
    )


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
        owned_count = (
            db.query(Athlete)
            .filter(Athlete.coach_id == current_user.id, Athlete.id.in_(desired_ids))
            .count()
        )
        if owned_count != len(desired_ids):
            raise HTTPException(status_code=422, detail="One or more athletes are invalid for this coach")

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
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = (
        db.query(Athlete)
        .filter(Athlete.id == athlete_id, Athlete.coach_id == current_user.id)
        .first()
    )
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    team_rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(Team.coach_id == current_user.id, TeamMember.athlete_id == athlete.id, TeamMember.is_active.is_(True))
        .all()
    )
    teams = [row[0] for row in team_rows]

    attendance_rows = (
        db.query(AttendanceRecord.status, TeamSession.date, Team.name)
        .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
        .join(Team, Team.id == TeamSession.team_id)
        .filter(AttendanceRecord.athlete_id == athlete.id, Team.coach_id == current_user.id)
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

    payments = (
        db.query(AthletePayment)
        .filter(AthletePayment.athlete_id == athlete.id)
        .order_by(AthletePayment.month_key.desc())
        .limit(12)
        .all()
    )
    payment_rows = [
        AthletePaymentMini(month_key=p.month_key, amount=float(p.amount or 0), paid_at=p.paid_at)
        for p in payments
    ]

    last_attendance = [
        {"status": status, "date": date, "team_name": team_name}
        for status, date, team_name in attendance_rows[:15]
    ]

    return AthleteProfileResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        parent_name=athlete.parent_name,
        parent_phone=athlete.parent_phone,
        athlete_phone=athlete.athlete_phone,
        notes=athlete.notes,
        is_active=bool(athlete.is_active),
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
    )
