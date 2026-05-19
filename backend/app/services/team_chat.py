from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Athlete, AthleteTeamChatRead, Team, TeamChatMessage, TeamChatSenderKind, TeamMember, User

CHAT_RETENTION_DAYS = 15
_MAX_BODY_LEN = 2000


def _retention_cutoff() -> datetime:
    return datetime.utcnow() - timedelta(days=CHAT_RETENTION_DAYS)


def purge_expired_messages(db: Session, team_id: int | None = None) -> int:
    cutoff = _retention_cutoff()
    q = db.query(TeamChatMessage).filter(TeamChatMessage.created_at < cutoff)
    if team_id is not None:
        q = q.filter(TeamChatMessage.team_id == int(team_id))
    count = q.count()
    if count:
        q.delete(synchronize_session=False)
        db.commit()
    return count


def _athlete_team_ids(db: Session, athlete_id: int) -> list[tuple[int, str]]:
    rows = (
        db.query(Team.id, Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == int(athlete_id), TeamMember.is_active.is_(True))
        .order_by(Team.name.asc())
        .all()
    )
    return [(int(r[0]), r[1]) for r in rows if r[0]]


def _ensure_athlete_on_team(db: Session, athlete_id: int, team_id: int) -> Team:
    row = (
        db.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(
            TeamMember.athlete_id == int(athlete_id),
            TeamMember.team_id == int(team_id),
            TeamMember.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise ValueError("not_a_member")
    return row


def _last_read_at(db: Session, athlete_id: int, team_id: int) -> datetime | None:
    row = (
        db.query(AthleteTeamChatRead)
        .filter(
            AthleteTeamChatRead.athlete_id == int(athlete_id),
            AthleteTeamChatRead.team_id == int(team_id),
        )
        .first()
    )
    return row.last_read_at if row else None


def mark_chat_read(db: Session, athlete_id: int, team_id: int) -> None:
    _ensure_athlete_on_team(db, athlete_id, team_id)
    now = datetime.utcnow()
    row = (
        db.query(AthleteTeamChatRead)
        .filter(
            AthleteTeamChatRead.athlete_id == int(athlete_id),
            AthleteTeamChatRead.team_id == int(team_id),
        )
        .first()
    )
    if row:
        row.last_read_at = now
    else:
        db.add(AthleteTeamChatRead(athlete_id=int(athlete_id), team_id=int(team_id), last_read_at=now))
    db.commit()


def _unread_count(db: Session, athlete_id: int, team_id: int) -> int:
    cutoff = _retention_cutoff()
    last_read = _last_read_at(db, athlete_id, team_id)
    q = db.query(func.count(TeamChatMessage.id)).filter(
        TeamChatMessage.team_id == int(team_id),
        TeamChatMessage.created_at >= cutoff,
    )
    if last_read:
        q = q.filter(TeamChatMessage.created_at > last_read)
    q = q.filter(
        (TeamChatMessage.athlete_id.is_(None)) | (TeamChatMessage.athlete_id != int(athlete_id))
    )
    return int(q.scalar() or 0)


def list_channels_for_athlete(db: Session, athlete: Athlete) -> list[dict]:
    purge_expired_messages(db)
    channels = []
    for team_id, team_name in _athlete_team_ids(db, athlete.id):
        cutoff = _retention_cutoff()
        last_msg = (
            db.query(TeamChatMessage)
            .filter(TeamChatMessage.team_id == team_id, TeamChatMessage.created_at >= cutoff)
            .order_by(TeamChatMessage.created_at.desc())
            .first()
        )
        preview = None
        last_at = None
        if last_msg:
            preview = (last_msg.body or "").strip()[:120]
            last_at = last_msg.created_at
        channels.append(
            {
                "team_id": team_id,
                "team_name": team_name,
                "last_message_preview": preview,
                "last_message_at": last_at,
                "unread_count": _unread_count(db, athlete.id, team_id),
            }
        )
    return channels


def _sender_label(db: Session, msg: TeamChatMessage) -> str:
    if msg.sender_kind == TeamChatSenderKind.coach:
        if msg.coach_user_id:
            u = db.query(User).filter(User.id == msg.coach_user_id).first()
            if u and u.name:
                return u.name
        return "Треньор"
    if msg.athlete_id:
        a = db.query(Athlete).filter(Athlete.id == msg.athlete_id).first()
        if a:
            return a.athlete_name
    return "Състезател"


def message_to_dict(db: Session, msg: TeamChatMessage, viewer_athlete_id: int | None) -> dict:
    is_mine = (
        viewer_athlete_id is not None
        and msg.sender_kind == TeamChatSenderKind.athlete
        and int(msg.athlete_id or 0) == int(viewer_athlete_id)
    )
    return {
        "id": msg.id,
        "team_id": msg.team_id,
        "sender_kind": msg.sender_kind.value if hasattr(msg.sender_kind, "value") else str(msg.sender_kind),
        "sender_label": _sender_label(db, msg),
        "body": msg.body,
        "created_at": msg.created_at,
        "is_mine": is_mine,
    }


def list_messages_for_athlete(db: Session, athlete: Athlete, team_id: int, limit: int = 150) -> list[dict]:
    purge_expired_messages(db, team_id)
    _ensure_athlete_on_team(db, athlete.id, team_id)
    cutoff = _retention_cutoff()
    rows = (
        db.query(TeamChatMessage)
        .filter(TeamChatMessage.team_id == int(team_id), TeamChatMessage.created_at >= cutoff)
        .order_by(TeamChatMessage.created_at.asc())
        .limit(min(limit, 300))
        .all()
    )
    return [message_to_dict(db, m, athlete.id) for m in rows]


def post_athlete_message(db: Session, athlete: Athlete, team_id: int, body: str) -> TeamChatMessage:
    purge_expired_messages(db, team_id)
    _ensure_athlete_on_team(db, athlete.id, team_id)
    text = body.strip()[:_MAX_BODY_LEN]
    if not text:
        raise ValueError("empty_body")
    msg = TeamChatMessage(
        team_id=int(team_id),
        sender_kind=TeamChatSenderKind.athlete,
        athlete_id=int(athlete.id),
        body=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    mark_chat_read(db, athlete.id, team_id)
    return msg


def post_coach_message(db: Session, team: Team, coach_user_id: int, body: str) -> TeamChatMessage:
    purge_expired_messages(db, team.id)
    text = body.strip()[:_MAX_BODY_LEN]
    if not text:
        raise ValueError("empty_body")
    msg = TeamChatMessage(
        team_id=int(team.id),
        sender_kind=TeamChatSenderKind.coach,
        coach_user_id=int(coach_user_id),
        body=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def list_messages_for_coach(db: Session, team_id: int, limit: int = 150) -> list[dict]:
    purge_expired_messages(db, team_id)
    cutoff = _retention_cutoff()
    rows = (
        db.query(TeamChatMessage)
        .filter(TeamChatMessage.team_id == int(team_id), TeamChatMessage.created_at >= cutoff)
        .order_by(TeamChatMessage.created_at.asc())
        .limit(min(limit, 300))
        .all()
    )
    return [message_to_dict(db, m, None) for m in rows]


def delete_message(db: Session, team_id: int, message_id: int) -> bool:
    row = (
        db.query(TeamChatMessage)
        .filter(TeamChatMessage.id == int(message_id), TeamChatMessage.team_id == int(team_id))
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def total_unread_for_athlete(db: Session, athlete_id: int) -> int:
    total = 0
    for team_id, _ in _athlete_team_ids(db, athlete_id):
        total += _unread_count(db, athlete_id, team_id)
    return total
