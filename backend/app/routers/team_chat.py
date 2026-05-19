from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.athlete_room_auth import get_current_athlete_room_athlete
from app.dependencies.roles import require_role
from app.models import Athlete, Team, User, UserRole
from app.routers.teams import _ensure_team_owner
from app.schemas.team_chat import (
    TeamChatChannelResponse,
    TeamChatChannelsResponse,
    TeamChatMessageCreate,
    TeamChatMessageResponse,
)
from app.services.parent_portal_notify import queue_team_chat_message
from app.services.team_chat import (
    CHAT_RETENTION_DAYS,
    delete_message,
    list_channels_for_athlete,
    list_messages_for_athlete,
    list_messages_for_coach,
    mark_chat_read,
    post_athlete_message,
    post_coach_message,
)

router = APIRouter()


@router.get("/athlete-room/me/chat/channels", response_model=TeamChatChannelsResponse)
def athlete_chat_channels(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    raw = list_channels_for_athlete(db, athlete)
    return TeamChatChannelsResponse(
        channels=[TeamChatChannelResponse(**c) for c in raw],
        retention_days=CHAT_RETENTION_DAYS,
    )


@router.get("/athlete-room/me/chat/{team_id}/messages", response_model=list[TeamChatMessageResponse])
def athlete_chat_messages(
    team_id: int,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    try:
        items = list_messages_for_athlete(db, athlete, team_id)
    except ValueError as exc:
        if str(exc) == "not_a_member":
            raise HTTPException(status_code=403, detail="Not a member of this team") from exc
        raise
    return [TeamChatMessageResponse(**m) for m in items]


@router.post("/athlete-room/me/chat/{team_id}/messages", response_model=TeamChatMessageResponse, status_code=201)
def athlete_chat_post(
    team_id: int,
    payload: TeamChatMessageCreate,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    try:
        msg = post_athlete_message(db, athlete, team_id, payload.body)
    except ValueError as exc:
        if str(exc) == "not_a_member":
            raise HTTPException(status_code=403, detail="Not a member of this team") from exc
        if str(exc) == "empty_body":
            raise HTTPException(status_code=400, detail="Message is required") from exc
        raise
    team = db.query(Team).filter(Team.id == team_id).first()
    if team:
        queue_team_chat_message(
            team_id,
            team.name,
            athlete.athlete_name,
            payload.body.strip()[:120],
            exclude_athlete_id=athlete.id,
        )
    from app.services.team_chat import message_to_dict

    return TeamChatMessageResponse(**message_to_dict(db, msg, athlete.id))


@router.post("/athlete-room/me/chat/{team_id}/read", status_code=204)
def athlete_chat_read(
    team_id: int,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_athlete_room_athlete),
):
    try:
        mark_chat_read(db, athlete.id, team_id)
    except ValueError as exc:
        if str(exc) == "not_a_member":
            raise HTTPException(status_code=403, detail="Not a member of this team") from exc
        raise
    return None


@router.get("/teams/{team_id}/chat/messages", response_model=list[TeamChatMessageResponse])
def coach_chat_messages(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    items = list_messages_for_coach(db, team_id)
    return [TeamChatMessageResponse(**m) for m in items]


@router.post("/teams/{team_id}/chat/messages", response_model=TeamChatMessageResponse, status_code=201)
def coach_chat_post(
    team_id: int,
    payload: TeamChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    team = _ensure_team_owner(db, team_id, current_user)
    try:
        msg = post_coach_message(db, team, current_user.id, payload.body)
    except ValueError as exc:
        if str(exc) == "empty_body":
            raise HTTPException(status_code=400, detail="Message is required") from exc
        raise
    label = current_user.name or "Треньор"
    queue_team_chat_message(team_id, team.name, label, payload.body.strip()[:120])
    from app.services.team_chat import message_to_dict

    return TeamChatMessageResponse(**message_to_dict(db, msg, None))


@router.delete("/teams/{team_id}/chat/messages/{message_id}", status_code=204)
def coach_chat_delete(
    team_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    if not delete_message(db, team_id, message_id):
        raise HTTPException(status_code=404, detail="Message not found")
    return None
