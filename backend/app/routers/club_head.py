from datetime import datetime
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from openpyxl import Workbook
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, AthletePayment, AttendanceRecord, Team, TeamSession, Training, User, UserRole
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club as _ensure_head_admin
from app.routers.fees import _ensure_pdf_font, _iter_months
from app.services.club_membership_consent import (
    DEFAULT_FEE_AMOUNT,
    DEFAULT_FEE_CURRENCY,
    DEFAULT_FEE_DUE_DAY,
    resolve_club_fee_settings,
)

router = APIRouter()


def _ensure_head_with_club(user: User):
    if user.role != UserRole.club_head_coach:
        raise HTTPException(status_code=403, detail="Only club head coach can access this module")
    if not user.club_id:
        raise HTTPException(status_code=422, detail="Head coach is not assigned to a club")


class ClubFeesSettingsOut(BaseModel):
    club_id: int
    club_name: str
    enabled: bool = True
    fee_amount: int
    fee_due_day: int
    fee_currency: str = "€"
    defaults: dict = Field(default_factory=dict)


class ClubFeesSettingsUpdate(BaseModel):
    club_id: Optional[int] = None
    enabled: Optional[bool] = None
    fee_amount: Optional[int] = Field(None, ge=0, le=10000)
    fee_due_day: Optional[int] = Field(None, ge=1, le=28)


def _fees_settings_payload(club) -> ClubFeesSettingsOut:
    resolved = resolve_club_fee_settings(club)
    return ClubFeesSettingsOut(
        club_id=club.id,
        club_name=club.name,
        enabled=resolved["enabled"],
        fee_amount=resolved["fee_amount"],
        fee_due_day=resolved["fee_due_day"],
        fee_currency=resolved["fee_currency"],
        defaults={
            "fee_amount": DEFAULT_FEE_AMOUNT,
            "fee_due_day": DEFAULT_FEE_DUE_DAY,
            "fee_currency": DEFAULT_FEE_CURRENCY,
        },
    )


@router.get("/club/fees-settings", response_model=ClubFeesSettingsOut)
def get_club_fees_settings(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Настройки: събира ли клубът месечна такса (+ сума и падеж)."""
    _ensure_head_admin(current_user)
    club = _club_for_user(db, current_user, club_id)
    return _fees_settings_payload(club)


@router.put("/club/fees-settings", response_model=ClubFeesSettingsOut)
def update_club_fees_settings(
    payload: ClubFeesSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """
    Вкл./изкл. месечни такси за клуба.
    Не → скрива таксите при родител и треньор.
    Да → сума + падеж (default 15 € / 10-о число).
    """
    _ensure_head_admin(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    if payload.enabled is not None:
        club.monthly_fees_enabled = bool(payload.enabled)
    if payload.fee_amount is not None:
        club.membership_consent_fee_amount = int(payload.fee_amount)
    if payload.fee_due_day is not None:
        club.membership_consent_fee_due_day = int(payload.fee_due_day)

    # При включване без записани сума/падеж — записваме defaults.
    if club.monthly_fees_enabled:
        if club.membership_consent_fee_amount is None:
            club.membership_consent_fee_amount = DEFAULT_FEE_AMOUNT
        if club.membership_consent_fee_due_day is None:
            club.membership_consent_fee_due_day = DEFAULT_FEE_DUE_DAY

    db.commit()
    db.refresh(club)
    return _fees_settings_payload(club)


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


def _club_pdf(title: str, lines: list[str]) -> bytes:
    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 45
    c.setFont(font_name, 14)
    c.drawString(45, y, title)
    y -= 24
    c.setLineWidth(0.5)
    c.line(45, y, width - 45, y)
    y -= 20
    c.setFont(font_name, 10)
    for line in lines:
        c.drawString(45, y, line[:120])
        y -= 16
        if y < 60:
            c.showPage()
            c.setFont(font_name, 10)
            y = height - 50
    c.save()
    return buffer.getvalue()


def _club_fees_export_rows(
    db: Session,
    current_user: User,
    from_month: str,
    to_month: str,
    coach_id: int | None,
):
    months = _iter_months(from_month, to_month)
    q = (
        db.query(Athlete, User.name)
        .outerjoin(User, User.id == Athlete.coach_id)
        .filter(Athlete.club_id == current_user.club_id)
    )
    if coach_id:
        q = q.filter(Athlete.coach_id == int(coach_id))
    athletes = q.order_by(Athlete.athlete_name.asc()).all()
    athlete_ids = [a.id for a, _ in athletes]
    payments = []
    if athlete_ids:
        payments = (
            db.query(AthletePayment)
            .filter(
                AthletePayment.athlete_id.in_(athlete_ids),
                AthletePayment.month_key >= months[0],
                AthletePayment.month_key <= months[-1],
            )
            .all()
        )
    by_pair = {(p.athlete_id, p.month_key): p for p in payments}
    out = []
    for athlete, coach_name in athletes:
        for m in months:
            p = by_pair.get((athlete.id, m))
            out.append(
                {
                    "athlete_name": athlete.athlete_name,
                    "coach_name": coach_name or "",
                    "month_key": m,
                    "paid": "да" if p else "не",
                    "amount": float(p.amount) if p else "",
                    "paid_at": p.paid_at.strftime("%d.%m.%Y %H:%M") if p and p.paid_at else "",
                }
            )
    return out


@router.get("/club/reports/fees.xlsx")
def export_club_fees_xlsx(
    from_month: str = Query(...),
    to_month: str = Query(...),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    rows = _club_fees_export_rows(db, current_user, from_month, to_month, coach_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Такси"
    ws.append(["Състезател", "Треньор", "Месец", "Платено", "Сума", "Дата на плащане"])
    for r in rows:
        ws.append([r["athlete_name"], r["coach_name"], r["month_key"], r["paid"], r["amount"], r["paid_at"]])
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    fname = f"klub_taksi_{from_month}_{to_month}.xlsx"
    return Response(
        content=bio.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/club/reports/fees.pdf")
def export_club_fees_pdf(
    from_month: str = Query(...),
    to_month: str = Query(...),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    rows = _club_fees_export_rows(db, current_user, from_month, to_month, coach_id)
    lines = [f"Период: {from_month} – {to_month}", f"Редове: {len(rows)}", ""]
    for r in rows[:400]:
        lines.append(
            f"{r['athlete_name']} | {r['coach_name']} | {r['month_key']} | {r['paid']} | {r['amount']} | {r['paid_at']}"
        )
    if len(rows) > 400:
        lines.append("… (съкратено в PDF; използвай Excel за пълния списък)")
    pdf = _club_pdf("Отчет: месечни такси (клуб)", lines)
    fname = f"klub_taksi_{from_month}_{to_month}.pdf"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})


def _club_attendance_export_rows(db: Session, current_user: User, from_date: str, to_date: str):
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date must be <= to_date")
    rows = (
        db.query(
            TeamSession.date,
            Team.name,
            Athlete.athlete_name,
            AttendanceRecord.status,
            AttendanceRecord.note,
            TeamSession.title,
        )
        .join(Team, Team.id == TeamSession.team_id)
        .join(AttendanceRecord, AttendanceRecord.session_id == TeamSession.id)
        .join(Athlete, Athlete.id == AttendanceRecord.athlete_id)
        .filter(
            Team.club_id == current_user.club_id,
            TeamSession.date >= from_date,
            TeamSession.date <= to_date,
        )
        .order_by(TeamSession.date.desc(), Team.name.asc(), Athlete.athlete_name.asc())
        .all()
    )
    return [
        {
            "date": d,
            "team": tn,
            "athlete": an,
            "status": st or "",
            "note": (note or "")[:500],
            "title": (ttl or "")[:255],
        }
        for d, tn, an, st, note, ttl in rows
    ]


_STATUS_BG = {"present": "присъства", "late": "закъсня", "absent": "отсъства", "excused": "извинен"}


@router.get("/club/reports/attendance.xlsx")
def export_club_attendance_xlsx(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    rows = _club_attendance_export_rows(db, current_user, from_date, to_date)
    wb = Workbook()
    ws = wb.active
    ws.title = "Присъствие"
    ws.append(["Дата", "Отбор", "Състезател", "Статус", "Заглавие сесия", "Бележка"])
    for r in rows:
        st = str(r["status"]).lower()
        ws.append(
            [
                r["date"],
                r["team"],
                r["athlete"],
                _STATUS_BG.get(st, r["status"]),
                r["title"],
                r["note"],
            ]
        )
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    fname = f"klub_prisastvie_{from_date}_{to_date}.xlsx"
    return Response(
        content=bio.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/club/reports/attendance.pdf")
def export_club_attendance_pdf(
    from_date: str = Query(...),
    to_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head_with_club(current_user)
    rows = _club_attendance_export_rows(db, current_user, from_date, to_date)
    lines = [f"Период: {from_date} – {to_date}", f"Редове: {len(rows)}", ""]
    for r in rows[:500]:
        st = str(r["status"]).lower()
        st_label = _STATUS_BG.get(st, r["status"])
        lines.append(f"{r['date']} | {r['team']} | {r['athlete']} | {st_label}")
    if len(rows) > 500:
        lines.append("… (съкратено в PDF; използвай Excel за пълния списък)")
    pdf = _club_pdf("Отчет: присъствие (клуб)", lines)
    fname = f"klub_prisastvie_{from_date}_{to_date}.pdf"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})
