from __future__ import annotations

import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.athlete_room_auth import get_current_athlete_room_athlete
from app.models import Athlete, AthletePayment, Club, Team, TeamMember, TeamPortalItem
from app.routers.parent_portal import (
    PARENT_FEE_DUE_DAY,
    _apply_ack_body,
    _apply_schedule_highlights,
    _attendance_summary_from_rows,
    _build_parent_attendance_list,
    _build_schedule_for_teams,
    _fee_due_date_iso,
    _last_payment,
    _month_key_now,
    _month_last_day,
    _month_window,
    _pick_next_by_kind,
    _team_ids_for_athlete,
)
from app.schemas.parent_portal import ParentCurrentMonthFee, ParentPortalAckBody, ParentPushStatusResponse
from app.schemas.parent_portal import ParentPushSubscribeRequest, ParentPushTestResponse, ParentPushVapidResponse
from app.routers.team_portal import _item_to_response
from app.schemas.athlete_room import AthleteRoomHomeNotification, AthleteRoomMeResponse
from app.schemas.parent_portal import ParentScheduleItem
from app.services.parent_portal_notify import build_home_notifications, get_pending_marker_state
from app.services.team_chat import total_unread_for_athlete
from app.services.parent_push import (
    PORTAL_ATHLETE_ROOM,
    delete_subscription_for_athlete,
    push_configured,
    push_status_for_portal,
    send_test_notification,
    upsert_subscription,
)
from app.settings import settings

router = APIRouter()


def _monday_of_week_iso(iso_date: str | None = None) -> str:
    d = date.fromisoformat(iso_date or date.today().isoformat())
    d -= timedelta(days=d.weekday())
    return d.isoformat()


_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")
_UPCOMING_HORIZON_DAYS = 45


def _club_for_athlete(db: Session, athlete: Athlete) -> Club | None:
    if athlete.club_id:
        club = db.query(Club).filter(Club.id == athlete.club_id).first()
        if club:
            return club
    team_ids = _team_ids_for_athlete(db, athlete.id)
    if team_ids:
        team = db.query(Team).filter(Team.id == team_ids[0]).first()
        if team and team.club_id:
            return db.query(Club).filter(Club.id == team.club_id).first()
    return None


def _team_names(db: Session, athlete_id: int) -> list[str]:
    rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete_id, TeamMember.is_active.is_(True))
        .all()
    )
    return [x[0] for x in rows if x[0]]


def _feed_items(db: Session, team_ids: list[int]) -> list:
    if not team_ids:
        return []
    items = (
        db.query(TeamPortalItem)
        .filter(TeamPortalItem.team_id.in_(team_ids))
        .order_by(TeamPortalItem.created_at.desc())
        .limit(80)
        .all()
    )
    return [_item_to_response(i) for i in items]


def _current_month_fee(db: Session, athlete: Athlete) -> ParentCurrentMonthFee:
    mk = _month_key_now()
    pay_rows = (
        db.query(AthletePayment)
        .filter(AthletePayment.athlete_id == athlete.id, AthletePayment.month_key.in_(_month_window(12)))
        .all()
    )
    pay_map = {p.month_key: p for p in pay_rows}
    current_pay = pay_map.get(mk)
    last_pay_row, last_pay_mk = _last_payment(pay_map)
    return ParentCurrentMonthFee(
        month_key=mk,
        paid=mk in pay_map,
        amount=float(current_pay.amount or 0) if current_pay else 0.0,
        paid_at=current_pay.paid_at if current_pay else None,
        due_day=PARENT_FEE_DUE_DAY,
        due_date=_fee_due_date_iso(mk, PARENT_FEE_DUE_DAY),
        last_paid_at=last_pay_row.paid_at if last_pay_row else None,
        last_paid_month_key=last_pay_mk,
    )


def _build_me(db: Session, athlete: Athlete, month_key: str | None = None) -> AthleteRoomMeResponse:
    teams = _team_names(db, athlete.id)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    mk = (month_key or _month_key_now()).strip()
    if not _MONTH_KEY_RE.match(mk):
        mk = _month_key_now()

    schedule: list[ParentScheduleItem] = []
    next_training = None
    next_competition = None
    _, pending_dates, fee_highlight = get_pending_marker_state(db, athlete.id)
    if team_ids:
        schedule = _apply_schedule_highlights(
            db,
            athlete.id,
            _build_schedule_for_teams(db, team_ids, f"{mk}-01", _month_last_day(mk)),
        )
        today = date.today()
        upcoming = _apply_schedule_highlights(
            db,
            athlete.id,
            _build_schedule_for_teams(
                db,
                team_ids,
                today.isoformat(),
                (today + timedelta(days=_UPCOMING_HORIZON_DAYS)).isoformat(),
            ),
        )
        next_training = _pick_next_by_kind(upcoming, competition=False)
        next_competition = _pick_next_by_kind(upcoming, competition=True)

    today_s = date.today().isoformat()
    attendance_since = (date.today() - timedelta(days=90)).isoformat()
    attendance_to = (date.today() + timedelta(days=14)).isoformat()
    attendance_rows = _build_parent_attendance_list(db, athlete.id, team_ids, attendance_since, attendance_to)
    attendance_summary = _attendance_summary_from_rows([r for r in attendance_rows if r.date <= today_s])

    club_row = _club_for_athlete(db, athlete)

    return AthleteRoomMeResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        teams=teams,
        club_name=club_row.name if club_row else None,
        club_logo_url=club_row.logo_url if club_row else None,
        schedule_month_key=mk,
        week_start=_monday_of_week_iso(),
        monthly_schedule=schedule,
        next_training=next_training,
        next_competition=next_competition,
        items=_feed_items(db, team_ids),
        attendance_summary=attendance_summary,
        current_month_fee=_current_month_fee(db, athlete),
        pending_schedule_dates=pending_dates,
        fee_change_highlight=fee_highlight,
        avatar_url=None,
        chat_unread_count=total_unread_for_athlete(db, athlete.id),
        home_notifications=[
            AthleteRoomHomeNotification(**n) for n in build_home_notifications(db, athlete.id)
        ],
    )


@router.get("/athlete-room/me", response_model=AthleteRoomMeResponse)
def athlete_room_me(
    month: str | None = Query(None, description="YYYY-MM for initial schedule month"),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    month_key = None
    if month is not None:
        mk = month.strip()
        if not _MONTH_KEY_RE.match(mk):
            raise HTTPException(status_code=422, detail="month must be YYYY-MM")
        month_key = mk
    return _build_me(db, athlete, month_key)


@router.get("/athlete-room/me/schedule", response_model=list[ParentScheduleItem])
def athlete_room_schedule(
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    team_ids = _team_ids_for_athlete(db, athlete.id)
    if not team_ids:
        return []
    mk = month.strip()
    items = _build_schedule_for_teams(db, team_ids, f"{mk}-01", _month_last_day(mk))
    return _apply_schedule_highlights(db, athlete.id, items)


@router.post("/athlete-room/me/ack-change", status_code=204)
def athlete_room_ack_change_me(
    body: ParentPortalAckBody,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    _apply_ack_body(db, athlete.id, body)
    return None


@router.get("/athlete-room/push/vapid-public-key", response_model=ParentPushVapidResponse)
def athlete_room_push_vapid_public_key():
    key = (settings.vapid_public_key or "").strip()
    if not push_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured.")
    return ParentPushVapidResponse(public_key=key, configured=True)


@router.get("/athlete-room/me/push-status", response_model=ParentPushStatusResponse)
def athlete_room_push_status_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    count = push_status_for_portal(db, athlete.id, PORTAL_ATHLETE_ROOM)
    return ParentPushStatusResponse(subscribed=count > 0, push_available=push_configured())


@router.post("/athlete-room/me/push-subscription", status_code=204)
def athlete_room_push_subscribe_me(
    payload: ParentPushSubscribeRequest,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    if not push_configured():
        raise HTTPException(status_code=503, detail="Push notifications are not configured.")
    upsert_subscription(
        db,
        athlete.id,
        payload.endpoint.strip(),
        payload.keys.p256dh.strip(),
        payload.keys.auth.strip(),
        portal=PORTAL_ATHLETE_ROOM,
    )
    return None


@router.post("/athlete-room/me/push-test", response_model=ParentPushTestResponse)
def athlete_room_push_test_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    result = send_test_notification(db, athlete.id, portal=PORTAL_ATHLETE_ROOM)
    return ParentPushTestResponse(
        sent=result.get("sent", 0),
        subscriptions=result.get("subscriptions", 0),
        configured=push_configured(),
        errors=result.get("errors") or [],
    )


@router.delete("/athlete-room/me/push-subscription", status_code=204)
def athlete_room_push_unsubscribe_me(
    endpoint: str | None = Query(None),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    delete_subscription_for_athlete(
        db, athlete.id, endpoint.strip() if endpoint else None, portal=PORTAL_ATHLETE_ROOM
    )
    return None
