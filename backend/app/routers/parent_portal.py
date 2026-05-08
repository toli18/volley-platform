from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Athlete,
    AthleteParentAccessToken,
    AthletePayment,
    AttendanceRecord,
    Team,
    TeamMember,
    TeamSession,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
    UserRole,
)
from app.schemas.parent_portal import (
    ParentAccessCreateResponse,
    ParentAccessStatusResponse,
    ParentAthleteProfileResponse,
    ParentAttendanceRow,
    ParentAttendanceSummary,
    ParentPaymentRow,
    ParentScheduleItem,
)

router = APIRouter()


def _is_head_coach(user: User) -> bool:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role == UserRole.club_head_coach.value


def _month_key_now() -> str:
    return date.today().strftime("%Y-%m")


def _month_window(count: int = 12) -> list[str]:
    out = []
    d = date.today().replace(day=1)
    for _ in range(count):
        out.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return out


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _token_preview(raw: str) -> str:
    if len(raw) <= 10:
        return raw
    return f"{raw[:6]}...{raw[-4:]}"


def _build_parent_url(request: Request, token_raw: str) -> str:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin:
        return f"{origin}/parent/{token_raw}"
    base = str(request.base_url).rstrip("/")
    return f"{base}/parent/{token_raw}"


def _ensure_athlete_owned(db: Session, athlete_id: int, current_user: User) -> Athlete:
    q = db.query(Athlete).filter(Athlete.id == int(athlete_id))
    if _is_head_coach(current_user):
        q = q.filter(Athlete.club_id == current_user.club_id)
    else:
        q = q.filter(Athlete.coach_id == current_user.id)
    athlete = q.first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


def _get_active_token(db: Session, athlete_id: int) -> AthleteParentAccessToken | None:
    now = datetime.utcnow()
    row = (
        db.query(AthleteParentAccessToken)
        .filter(
            AthleteParentAccessToken.athlete_id == int(athlete_id),
            AthleteParentAccessToken.is_active.is_(True),
        )
        .order_by(AthleteParentAccessToken.created_at.desc())
        .first()
    )
    if not row:
        return None
    if row.expires_at and row.expires_at < now:
        row.is_active = False
        db.commit()
        return None
    return row


@router.get("/teams/athletes/{athlete_id}/parent-access", response_model=ParentAccessStatusResponse)
def parent_access_status(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owned(db, athlete_id, current_user)
    token_row = _get_active_token(db, athlete.id)
    if not token_row:
        return ParentAccessStatusResponse(has_active_token=False)
    return ParentAccessStatusResponse(
        has_active_token=True,
        token_preview=f"{token_row.token_prefix}...",
        parent_url=None,
        expires_at=token_row.expires_at,
        last_used_at=token_row.last_used_at,
    )


@router.post("/teams/athletes/{athlete_id}/parent-access", response_model=ParentAccessCreateResponse)
def create_parent_access(
    athlete_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owned(db, athlete_id, current_user)
    db.query(AthleteParentAccessToken).filter(AthleteParentAccessToken.athlete_id == athlete.id).update(
        {AthleteParentAccessToken.is_active: False}, synchronize_session=False
    )
    raw = secrets.token_urlsafe(32)
    row = AthleteParentAccessToken(
        athlete_id=athlete.id,
        token_hash=_token_hash(raw),
        token_prefix=raw[:10],
        created_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ParentAccessCreateResponse(parent_url=_build_parent_url(request, raw), token_preview=_token_preview(raw), expires_at=row.expires_at)


@router.post("/teams/athletes/{athlete_id}/parent-access/rotate", response_model=ParentAccessCreateResponse)
def rotate_parent_access(
    athlete_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    return create_parent_access(athlete_id=athlete_id, request=request, db=db, current_user=current_user)


@router.delete("/teams/athletes/{athlete_id}/parent-access", status_code=204)
def revoke_parent_access(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owned(db, athlete_id, current_user)
    db.query(AthleteParentAccessToken).filter(AthleteParentAccessToken.athlete_id == athlete.id).update(
        {AthleteParentAccessToken.is_active: False}, synchronize_session=False
    )
    db.commit()
    return None


@router.get("/parent-portal/{token}", response_model=ParentAthleteProfileResponse)
def parent_portal_view(token: str, db: Session = Depends(get_db)):
    row = (
        db.query(AthleteParentAccessToken)
        .filter(AthleteParentAccessToken.token_hash == _token_hash(token), AthleteParentAccessToken.is_active.is_(True))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invalid parent access link")
    if row.expires_at and row.expires_at < datetime.utcnow():
        row.is_active = False
        db.commit()
        raise HTTPException(status_code=410, detail="Parent access link expired")

    athlete = db.query(Athlete).filter(Athlete.id == row.athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    row.last_used_at = datetime.utcnow()
    db.commit()

    team_rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete.id, TeamMember.is_active.is_(True))
        .all()
    )
    teams = [x[0] for x in team_rows]

    attendance_rows = (
        db.query(AttendanceRecord.status, TeamSession.date, Team.name)
        .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
        .join(Team, Team.id == TeamSession.team_id)
        .filter(AttendanceRecord.athlete_id == athlete.id)
        .order_by(TeamSession.date.desc())
        .limit(30)
        .all()
    )
    present = sum(1 for s, _, _ in attendance_rows if s == "present")
    late = sum(1 for s, _, _ in attendance_rows if s == "late")
    absent = sum(1 for s, _, _ in attendance_rows if s == "absent")
    excused = sum(1 for s, _, _ in attendance_rows if s == "excused")
    total = len(attendance_rows)
    rate = round(((present + late) / total) * 100.0, 1) if total else 0.0
    last_attendance = [ParentAttendanceRow(status=s or "present", date=d, team_name=tname) for s, d, tname in attendance_rows[:15]]

    mk = _month_window(12)
    pay_rows = db.query(AthletePayment).filter(AthletePayment.athlete_id == athlete.id, AthletePayment.month_key.in_(mk)).all()
    pay_map = {p.month_key: p for p in pay_rows}
    monthly_payments = [
        ParentPaymentRow(
            month_key=k,
            amount=float(pay_map[k].amount or 0) if k in pay_map else 0.0,
            paid=k in pay_map,
            paid_at=pay_map[k].paid_at if k in pay_map else None,
        )
        for k in mk
    ]

    this_month = _month_key_now()
    from_date = f"{this_month}-01"
    y, m = [int(x) for x in this_month.split("-")]
    last_day = date(y, m, 1).replace(day=28) + timedelta(days=4)
    last_day = (last_day - timedelta(days=last_day.day)).day
    to_date = f"{this_month}-{str(last_day).zfill(2)}"

    team_ids = [tm.team_id for tm in db.query(TeamMember).filter(TeamMember.athlete_id == athlete.id, TeamMember.is_active.is_(True)).all()]
    schedule_items: list[ParentScheduleItem] = []
    if team_ids:
        rules = (
            db.query(TrainingScheduleRule)
            .filter(
                TrainingScheduleRule.team_id.in_(team_ids),
                TrainingScheduleRule.is_active.is_(True),
                TrainingScheduleRule.effective_from <= to_date,
                (TrainingScheduleRule.effective_to.is_(None)) | (TrainingScheduleRule.effective_to >= from_date),
            )
            .all()
        )
        if rules:
            rule_ids = [r.id for r in rules]
            exc_rows = (
                db.query(TrainingScheduleException)
                .filter(TrainingScheduleException.rule_id.in_(rule_ids), TrainingScheduleException.date >= from_date, TrainingScheduleException.date <= to_date)
                .all()
            )
            exc_map = {(e.rule_id, e.date): e for e in exc_rows}
            team_name_map = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all())
            d0 = datetime.strptime(from_date, "%Y-%m-%d").date()
            d1 = datetime.strptime(to_date, "%Y-%m-%d").date()
            days = (d1 - d0).days
            for i in range(days + 1):
                cur = d0 + timedelta(days=i)
                cur_s = cur.isoformat()
                for r in rules:
                    if int(r.weekday) != cur.weekday():
                        continue
                    if r.effective_from > cur_s:
                        continue
                    if r.effective_to and r.effective_to < cur_s:
                        continue
                    exc = exc_map.get((r.id, cur_s))
                    if exc and exc.kind == "cancelled":
                        continue
                    location = exc.location if exc and exc.kind == "override" and exc.location else r.location
                    start_t = exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
                    end_t = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time
                    schedule_items.append(
                        ParentScheduleItem(
                            date=cur_s,
                            start_time=start_t,
                            end_time=end_t,
                            location=location,
                            team_name=team_name_map.get(int(r.team_id)),
                        )
                    )
            schedule_items.sort(key=lambda x: (x.date, x.start_time))

    return ParentAthleteProfileResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        parent_name=athlete.parent_name,
        parent_phone=athlete.parent_phone,
        teams=teams,
        attendance_summary=ParentAttendanceSummary(
            present=present,
            late=late,
            absent=absent,
            excused=excused,
            total=total,
            attendance_rate_percent=rate,
        ),
        last_attendance=last_attendance,
        monthly_schedule=schedule_items,
        monthly_payments=monthly_payments,
    )
