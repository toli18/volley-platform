from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, AthletePayment, AttendanceRecord, Team, TeamSession, Training, User, UserRole

router = APIRouter()


def _ensure_head_with_club(user: User):
    if user.role != UserRole.club_head_coach:
        raise HTTPException(status_code=403, detail="Only club head coach can access this module")
    if not user.club_id:
        raise HTTPException(status_code=422, detail="Head coach is not assigned to a club")


@router.get("/club/athletes")
def club_athletes(
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    q = db.query(Athlete).filter(Athlete.club_id == current_user.club_id)
    if coach_id:
        q = q.filter(Athlete.coach_id == coach_id)
    athletes = q.order_by(Athlete.athlete_name.asc()).all()
    return athletes


@router.get("/club/fees/summary")
def club_fees_summary(
    month_key: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    athletes = db.query(Athlete).filter(Athlete.club_id == current_user.club_id).all()
    athlete_ids = [a.id for a in athletes]
    paid_ids = set()
    total_paid = 0.0
    if athlete_ids:
        payments = (
            db.query(AthletePayment)
            .filter(AthletePayment.athlete_id.in_(athlete_ids), AthletePayment.month_key == month_key)
            .all()
        )
        for p in payments:
            paid_ids.add(p.athlete_id)
            total_paid += float(p.amount or 0)
    return {
        "month_key": month_key,
        "total_athletes": len(athletes),
        "paid_athletes": len(paid_ids),
        "unpaid_athletes": max(0, len(athletes) - len(paid_ids)),
        "total_paid_amount": round(total_paid, 2),
    }


@router.get("/club/attendance/summary")
def club_attendance_summary(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must be <= to_date")

    team_ids = [x[0] for x in db.query(Team.id).filter(Team.club_id == current_user.club_id).all()]
    if not team_ids:
        return {"from_date": from_date, "to_date": to_date, "sessions_count": 0, "present": 0, "late": 0, "absent": 0, "excused": 0}
    sessions = (
        db.query(TeamSession.id)
        .filter(TeamSession.team_id.in_(team_ids), TeamSession.date >= from_date, TeamSession.date <= to_date)
        .all()
    )
    session_ids = [s[0] for s in sessions]
    if not session_ids:
        return {"from_date": from_date, "to_date": to_date, "sessions_count": 0, "present": 0, "late": 0, "absent": 0, "excused": 0}

    records = db.query(AttendanceRecord.status).filter(AttendanceRecord.session_id.in_(session_ids)).all()
    counts = {"present": 0, "late": 0, "absent": 0, "excused": 0}
    for (status,) in records:
        key = str(status or "").strip().lower()
        if key in counts:
            counts[key] += 1
    return {"from_date": from_date, "to_date": to_date, "sessions_count": len(session_ids), **counts}


@router.get("/club/trainings")
def club_trainings(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    trainings = (
        db.query(Training, User.name)
        .join(User, User.id == Training.coach_id)
        .filter(Training.club_id == current_user.club_id)
        .order_by(Training.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status.value if hasattr(t.status, "value") else t.status,
            "source": t.source.value if hasattr(t.source, "value") else t.source,
            "coach_id": t.coach_id,
            "coach_name": coach_name,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t, coach_name in trainings
    ]


@router.get("/club/overview")
def club_overview(
    month_key: str = Query(...),
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    fees = club_fees_summary(month_key, db, current_user)
    attendance = club_attendance_summary(from_date, to_date, db, current_user)
    trainings = club_trainings(10, db, current_user)
    coaches = (
        db.query(User.id, User.name, User.email, User.role)
        .filter(User.club_id == current_user.club_id, User.role.in_([UserRole.coach, UserRole.club_head_coach]))
        .all()
    )
    return {
        "club_id": current_user.club_id,
        "month_key": month_key,
        "from_date": from_date,
        "to_date": to_date,
        "fees": fees,
        "attendance": attendance,
        "coaches": [
            {"id": c.id, "name": c.name, "email": c.email, "role": c.role.value if hasattr(c.role, "value") else c.role}
            for c in coaches
        ],
        "recent_trainings": trainings,
        "generated_at": datetime.utcnow(),
    }
