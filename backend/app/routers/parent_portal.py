from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.parent_auth import get_current_parent_athlete
from app.models import (
    Athlete,
    AthleteParentAccessToken,
    AthletePayment,
    AttendanceRecord,
    Club,
    Team,
    TeamMember,
    TeamSession,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
)
from app.schemas.parent_portal import (
    ParentAthleteProfileResponse,
    ParentAttendanceRow,
    ParentAttendanceSummary,
    ParentCurrentMonthFee,
    ParentFeeCoachContact,
    ParentPaymentRow,
    ParentScheduleItem,
)

router = APIRouter()

# Day of month when monthly fee is due (shown in parent portal).
PARENT_FEE_DUE_DAY = 10


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


def _month_last_day(month_key: str) -> str:
    y, m = [int(x) for x in month_key.split("-")]
    last = date(y, m, 1).replace(day=28) + timedelta(days=4)
    last = (last - timedelta(days=last.day)).day
    return f"{month_key}-{str(last).zfill(2)}"


def _build_schedule_for_teams(
    db: Session,
    team_ids: list[int],
    from_date: str,
    to_date: str,
) -> list[ParentScheduleItem]:
    if not team_ids:
        return []
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
    rule_ids = [r.id for r in rules]
    exc_map = {}
    if rule_ids:
        exc_rows = (
            db.query(TrainingScheduleException)
            .filter(
                TrainingScheduleException.rule_id.in_(rule_ids),
                TrainingScheduleException.date >= from_date,
                TrainingScheduleException.date <= to_date,
            )
            .all()
        )
        exc_map = {(e.rule_id, e.date): e for e in exc_rows}
    team_name_map = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all())
    d0 = datetime.strptime(from_date, "%Y-%m-%d").date()
    d1 = datetime.strptime(to_date, "%Y-%m-%d").date()
    days = (d1 - d0).days
    schedule_items: list[ParentScheduleItem] = []
    for i in range(days + 1):
        cur = d0 + timedelta(days=i)
        cur_s = cur.isoformat()
        for r in rules or []:
            if int(r.weekday) != cur.weekday():
                continue
            if r.effective_from > cur_s:
                continue
            if r.effective_to and r.effective_to < cur_s:
                continue
            exc = exc_map.get((r.id, cur_s))
            if exc and exc.kind == "cancelled":
                schedule_items.append(
                    ParentScheduleItem(
                        date=cur_s,
                        start_time=r.start_time,
                        end_time=r.end_time,
                        location=r.location or "",
                        team_name=team_name_map.get(int(r.team_id)),
                        event_type="training",
                        is_cancelled=True,
                    )
                )
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
                    event_type="training",
                    is_cancelled=False,
                )
            )

    from app.competition_kinds import competition_kind_label
    from app.models import ClubCompetitionEvent

    comp_rows = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.team_id.in_(team_ids),
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.date >= from_date,
            ClubCompetitionEvent.date <= to_date,
        )
        .all()
    )
    for e in comp_rows:
        kind = str(e.competition_kind)
        schedule_items.append(
            ParentScheduleItem(
                date=e.date,
                start_time=e.start_time,
                end_time=e.end_time,
                location=e.location,
                team_name=team_name_map.get(int(e.team_id)),
                event_type="competition",
                competition_kind=kind,
                competition_kind_label=competition_kind_label(kind),
            )
        )

    schedule_items.sort(key=lambda x: (x.date, x.start_time or ""))
    return schedule_items


def _is_upcoming_schedule_item(item: ParentScheduleItem, today_s: str, now_t: str) -> bool:
    if item.date > today_s:
        return True
    return item.date == today_s and (item.start_time or "") >= now_t


def _pick_next_by_kind(items: list[ParentScheduleItem], *, competition: bool) -> ParentScheduleItem | None:
    today_s = date.today().isoformat()
    now_t = datetime.utcnow().strftime("%H:%M")
    for item in items:
        is_comp = (item.event_type or "training") == "competition"
        if competition and not is_comp:
            continue
        if not competition and is_comp:
            continue
        if _is_upcoming_schedule_item(item, today_s, now_t):
            return item
    return None


def _count_competitions_in_month(items: list[ParentScheduleItem], month_key: str) -> int:
    prefix = f"{month_key}-"
    return sum(1 for i in items if (i.event_type or "training") == "competition" and i.date.startswith(prefix))


def _last_payment(pay_map: dict[str, AthletePayment]) -> tuple[AthletePayment | None, str | None]:
    if not pay_map:
        return None, None
    best_key = max(pay_map.keys())
    row = pay_map[best_key]
    return row, best_key


def _fee_due_date_iso(month_key: str, due_day: int = PARENT_FEE_DUE_DAY) -> str:
    y, m = [int(x) for x in month_key.split("-")]
    last_dom = _month_last_day(month_key)
    last_day = int(last_dom.split("-")[2])
    day = min(max(1, due_day), last_day)
    return f"{month_key}-{str(day).zfill(2)}"


def _pick_next_event(items: list[ParentScheduleItem]) -> ParentScheduleItem | None:
    """Earliest upcoming item of any kind (legacy compat)."""
    today_s = date.today().isoformat()
    now_t = datetime.utcnow().strftime("%H:%M")
    for item in items:
        if _is_upcoming_schedule_item(item, today_s, now_t):
            return item
    return None


def _cancelled_training_keys(
    db: Session, team_ids: list[int], from_date: str, to_date: str
) -> set[tuple[str, int]]:
    if not team_ids:
        return set()
    rows = (
        db.query(TrainingScheduleException.date, TrainingScheduleRule.team_id)
        .join(TrainingScheduleRule, TrainingScheduleRule.id == TrainingScheduleException.rule_id)
        .filter(
            TrainingScheduleRule.team_id.in_(team_ids),
            TrainingScheduleException.kind == "cancelled",
            TrainingScheduleException.date >= from_date,
            TrainingScheduleException.date <= to_date,
        )
        .all()
    )
    return {(str(d), int(tid)) for d, tid in rows}


def _build_parent_attendance_list(
    db: Session,
    athlete_id: int,
    team_ids: list[int],
    from_date: str,
    to_date: str,
) -> list[ParentAttendanceRow]:
    cancelled_keys = _cancelled_training_keys(db, team_ids, from_date, to_date)
    attendance_rows = (
        db.query(AttendanceRecord.status, TeamSession.date, Team.name, Team.id)
        .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
        .join(Team, Team.id == TeamSession.team_id)
        .filter(AttendanceRecord.athlete_id == athlete_id, TeamSession.date >= from_date, TeamSession.date <= to_date)
        .order_by(TeamSession.date.desc())
        .limit(120)
        .all()
    )
    covered: set[tuple[str, int]] = set()
    items: list[ParentAttendanceRow] = []
    for status, day, team_name, team_id in attendance_rows:
        key = (str(day), int(team_id))
        covered.add(key)
        is_cancelled = key in cancelled_keys
        items.append(
            ParentAttendanceRow(
                status="cancelled" if is_cancelled else (status or "present"),
                date=str(day),
                team_name=team_name,
                team_id=int(team_id),
                is_cancelled=is_cancelled,
            )
        )

    if cancelled_keys:
        team_name_map = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all())
        for day_s, tid in sorted(cancelled_keys, key=lambda x: x[0], reverse=True):
            key = (day_s, tid)
            if key in covered:
                continue
            items.append(
                ParentAttendanceRow(
                    status="cancelled",
                    date=day_s,
                    team_name=team_name_map.get(tid),
                    team_id=tid,
                    is_cancelled=True,
                )
            )

    items.sort(key=lambda x: x.date, reverse=True)
    return items


def _attendance_summary_from_rows(rows: list[ParentAttendanceRow]) -> ParentAttendanceSummary:
    active = [r for r in rows if not r.is_cancelled]
    present = sum(1 for r in active if r.status == "present")
    late = sum(1 for r in active if r.status == "late")
    absent = sum(1 for r in active if r.status == "absent")
    excused = sum(1 for r in active if r.status == "excused")
    total = len(active)
    rate = round(((present + late) / total) * 100.0, 1) if total else 0.0
    return ParentAttendanceSummary(
        present=present,
        late=late,
        absent=absent,
        excused=excused,
        total=total,
        attendance_rate_percent=rate,
    )


_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")


def _resolve_parent_portal_athlete(db: Session, token: str) -> Athlete:
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
    return athlete


def _team_ids_for_athlete(db: Session, athlete_id: int) -> list[int]:
    return [
        tm.team_id
        for tm in db.query(TeamMember).filter(TeamMember.athlete_id == athlete_id, TeamMember.is_active.is_(True)).all()
    ]


@router.get("/parent-portal/{token}/schedule", response_model=list[ParentScheduleItem])
def parent_portal_schedule(
    token: str,
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    athlete = _resolve_parent_portal_athlete(db, token)
    month_key = month.strip()
    from_date = f"{month_key}-01"
    to_date = _month_last_day(month_key)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    return _build_schedule_for_teams(db, team_ids, from_date, to_date)


def _build_parent_athlete_profile(db: Session, athlete: Athlete) -> ParentAthleteProfileResponse:
    team_rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete.id, TeamMember.is_active.is_(True))
        .all()
    )
    teams = [x[0] for x in team_rows]

    team_ids = _team_ids_for_athlete(db, athlete.id)
    today_s = date.today().isoformat()
    attendance_since = (date.today() - timedelta(days=90)).isoformat()
    attendance_to = (date.today() + timedelta(days=14)).isoformat()
    last_attendance = _build_parent_attendance_list(db, athlete.id, team_ids, attendance_since, attendance_to)
    attendance_summary = _attendance_summary_from_rows([r for r in last_attendance if r.date <= today_s])

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
    to_date = _month_last_day(this_month)
    schedule_items = _build_schedule_for_teams(db, team_ids, from_date, to_date)

    today = date.today()
    horizon_to = (today + timedelta(days=45)).isoformat()
    upcoming_pool = _build_schedule_for_teams(db, team_ids, today.isoformat(), horizon_to)
    next_training_item = _pick_next_by_kind(upcoming_pool, competition=False)
    next_competition_item = _pick_next_by_kind(upcoming_pool, competition=True)
    next_event = _pick_next_event(upcoming_pool)

    current_pay = pay_map.get(this_month)
    last_pay_row, last_pay_mk = _last_payment(pay_map)
    due_date_iso = _fee_due_date_iso(this_month, PARENT_FEE_DUE_DAY)
    current_month_fee = ParentCurrentMonthFee(
        month_key=this_month,
        paid=this_month in pay_map,
        amount=float(current_pay.amount or 0) if current_pay else 0.0,
        paid_at=current_pay.paid_at if current_pay else None,
        due_day=PARENT_FEE_DUE_DAY,
        due_date=due_date_iso,
        last_paid_at=last_pay_row.paid_at if last_pay_row else None,
        last_paid_month_key=last_pay_mk,
    )
    competitions_this_month = _count_competitions_in_month(schedule_items, this_month)

    fee_coach = ParentFeeCoachContact()
    coach_row = db.query(User).filter(User.id == athlete.coach_id).first()
    if coach_row:
        fee_coach.name = coach_row.name
        fee_coach.email = coach_row.email
    if athlete.club_id:
        club_row = db.query(Club).filter(Club.id == athlete.club_id).first()
        if club_row:
            fee_coach.club_name = club_row.name
            fee_coach.club_phone = club_row.contact_phone

    return ParentAthleteProfileResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        parent_name=athlete.parent_name,
        parent_phone=athlete.parent_phone,
        teams=teams,
        fee_coach=fee_coach,
        current_month_fee=current_month_fee,
        next_event=next_event,
        next_training=next_training_item,
        next_competition=next_competition_item,
        attendance_summary=attendance_summary,
        last_attendance=last_attendance,
        schedule_month_key=this_month,
        monthly_schedule=schedule_items,
        monthly_payments=monthly_payments,
        competitions_this_month=competitions_this_month,
        fee_due_day=PARENT_FEE_DUE_DAY,
    )


@router.get("/parent-portal/me", response_model=ParentAthleteProfileResponse)
def parent_portal_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _build_parent_athlete_profile(db, athlete)


@router.get("/parent-portal/me/schedule", response_model=list[ParentScheduleItem])
def parent_portal_me_schedule(
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    month_key = month.strip()
    from_date = f"{month_key}-01"
    to_date = _month_last_day(month_key)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    return _build_schedule_for_teams(db, team_ids, from_date, to_date)


@router.get("/parent-portal/{token}", response_model=ParentAthleteProfileResponse)
def parent_portal_view(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _build_parent_athlete_profile(db, athlete)
