from __future__ import annotations

import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.athlete_room_auth import get_current_athlete_room_athlete
from app.models import Athlete, Club, Team, TeamMember, TeamPortalItem
from app.routers.parent_portal import (
    _attendance_summary_from_rows,
    _build_parent_attendance_list,
    _build_schedule_for_teams,
    _month_key_now,
    _month_last_day,
    _pick_next_by_kind,
    _team_ids_for_athlete,
)
from app.routers.team_portal import _item_to_response, _monday_of_week_iso
from app.schemas.athlete_room import AthleteRoomMeResponse
from app.schemas.parent_portal import ParentScheduleItem

router = APIRouter()

_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")
_UPCOMING_HORIZON_DAYS = 45


def _club_name_for_athlete(db: Session, athlete: Athlete) -> str | None:
    if athlete.club_id:
        club = db.query(Club).filter(Club.id == athlete.club_id).first()
        if club:
            return club.name
    team_ids = _team_ids_for_athlete(db, athlete.id)
    if team_ids:
        team = db.query(Team).filter(Team.id == team_ids[0]).first()
        if team and team.club_id:
            club = db.query(Club).filter(Club.id == team.club_id).first()
            return club.name if club else None
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


def _build_me(db: Session, athlete: Athlete, month_key: str | None = None) -> AthleteRoomMeResponse:
    teams = _team_names(db, athlete.id)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    mk = (month_key or _month_key_now()).strip()
    if not _MONTH_KEY_RE.match(mk):
        mk = _month_key_now()

    schedule: list[ParentScheduleItem] = []
    next_training = None
    next_competition = None
    if team_ids:
        schedule = _build_schedule_for_teams(db, team_ids, f"{mk}-01", _month_last_day(mk))
        today = date.today()
        upcoming = _build_schedule_for_teams(
            db,
            team_ids,
            today.isoformat(),
            (today + timedelta(days=_UPCOMING_HORIZON_DAYS)).isoformat(),
        )
        next_training = _pick_next_by_kind(upcoming, competition=False)
        next_competition = _pick_next_by_kind(upcoming, competition=True)

    today_s = date.today().isoformat()
    attendance_since = (date.today() - timedelta(days=90)).isoformat()
    attendance_to = (date.today() + timedelta(days=14)).isoformat()
    attendance_rows = _build_parent_attendance_list(db, athlete.id, team_ids, attendance_since, attendance_to)
    attendance_summary = _attendance_summary_from_rows([r for r in attendance_rows if r.date <= today_s])

    return AthleteRoomMeResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        teams=teams,
        club_name=_club_name_for_athlete(db, athlete),
        schedule_month_key=mk,
        week_start=_monday_of_week_iso(),
        monthly_schedule=schedule,
        next_training=next_training,
        next_competition=next_competition,
        items=_feed_items(db, team_ids),
        attendance_summary=attendance_summary,
        avatar_url=None,
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
    return _build_schedule_for_teams(db, team_ids, f"{mk}-01", _month_last_day(mk))
