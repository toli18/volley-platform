from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    AthleteTeamChatRead,
    Team,
    TeamChatMessage,
    TeamChatMessageRead,
    TeamChatSenderKind,
    TeamMember,
    User,
)
from app.services.parent_portal_notify import clear_marker_for_athlete

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


def _active_roster(db: Session, team_id: int) -> list[tuple[int, str]]:
    rows = (
        db.query(Athlete.id, Athlete.athlete_name)
        .join(TeamMember, TeamMember.athlete_id == Athlete.id)
        .filter(TeamMember.team_id == int(team_id), TeamMember.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    return [(int(aid), name) for aid, name in rows]


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


def _touch_channel_read(db: Session, athlete_id: int, team_id: int) -> None:
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
    clear_marker_for_athlete(db, athlete_id, f"chat:{int(team_id)}")


def _coach_message_ids_for_team(db: Session, team_id: int, message_ids: list[int] | None = None) -> list[int]:
    cutoff = _retention_cutoff()
    q = db.query(TeamChatMessage.id).filter(
        TeamChatMessage.team_id == int(team_id),
        TeamChatMessage.sender_kind == TeamChatSenderKind.coach,
        TeamChatMessage.created_at >= cutoff,
    )
    if message_ids:
        q = q.filter(TeamChatMessage.id.in_([int(x) for x in message_ids if x]))
    return [int(r[0]) for r in q.all()]


def mark_messages_read(db: Session, athlete_id: int, team_id: int, message_ids: list[int]) -> int:
    """Record per-message read receipts for coach messages (idempotent)."""
    _ensure_athlete_on_team(db, athlete_id, team_id)
    valid_ids = _coach_message_ids_for_team(db, team_id, message_ids)
    if not valid_ids:
        _touch_channel_read(db, athlete_id, team_id)
        db.commit()
        return 0

    existing = {
        int(r[0])
        for r in db.query(TeamChatMessageRead.message_id)
        .filter(
            TeamChatMessageRead.athlete_id == int(athlete_id),
            TeamChatMessageRead.message_id.in_(valid_ids),
        )
        .all()
    }
    now = datetime.utcnow()
    added = 0
    for mid in valid_ids:
        if mid in existing:
            continue
        db.add(
            TeamChatMessageRead(
                message_id=mid,
                athlete_id=int(athlete_id),
                read_at=now,
            )
        )
        added += 1
    _touch_channel_read(db, athlete_id, team_id)
    db.commit()
    return added


def mark_chat_read(db: Session, athlete_id: int, team_id: int) -> None:
    """Mark all coach messages in the channel as read (e.g. on open)."""
    ids = _coach_message_ids_for_team(db, team_id, None)
    mark_messages_read(db, athlete_id, team_id, ids)


def _unread_count(db: Session, athlete_id: int, team_id: int) -> int:
    cutoff = _retention_cutoff()
    coach_ids = [
        int(r[0])
        for r in db.query(TeamChatMessage.id)
        .filter(
            TeamChatMessage.team_id == int(team_id),
            TeamChatMessage.created_at >= cutoff,
            TeamChatMessage.sender_kind == TeamChatSenderKind.coach,
        )
        .all()
    ]
    if not coach_ids:
        return 0
    read_ids = {
        int(r[0])
        for r in db.query(TeamChatMessageRead.message_id)
        .filter(
            TeamChatMessageRead.athlete_id == int(athlete_id),
            TeamChatMessageRead.message_id.in_(coach_ids),
        )
        .all()
    }
    return len(coach_ids) - len(read_ids)


def _reads_by_message_ids(db: Session, message_ids: list[int]) -> dict[int, list[dict]]:
    if not message_ids:
        return {}
    rows = (
        db.query(TeamChatMessageRead, Athlete.athlete_name)
        .join(Athlete, Athlete.id == TeamChatMessageRead.athlete_id)
        .filter(TeamChatMessageRead.message_id.in_(message_ids))
        .order_by(TeamChatMessageRead.read_at.asc())
        .all()
    )
    out: dict[int, list[dict]] = {}
    for rec, name in rows:
        out.setdefault(int(rec.message_id), []).append(
            {
                "athlete_id": int(rec.athlete_id),
                "athlete_name": name or f"Състезател #{rec.athlete_id}",
                "read_at": rec.read_at,
            }
        )
    return out


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


def _sender_labels_for_messages(
    db: Session, messages: list[TeamChatMessage]
) -> tuple[dict[int, str], dict[int, str]]:
    """Зарежда имената на всички податели с 2 заявки (вместо 1 на съобщение).

    Премахва N+1 в polling-а на чата: при N съобщения досега се правеха N
    отделни заявки през `_sender_label`; сега са най-много 2 общо.
    """
    coach_ids = {
        int(m.coach_user_id)
        for m in messages
        if m.sender_kind == TeamChatSenderKind.coach and m.coach_user_id
    }
    athlete_ids = {
        int(m.athlete_id)
        for m in messages
        if m.sender_kind == TeamChatSenderKind.athlete and m.athlete_id
    }
    coach_names: dict[int, str] = {}
    if coach_ids:
        coach_names = {
            int(i): n for i, n in db.query(User.id, User.name).filter(User.id.in_(coach_ids)).all()
        }
    athlete_names: dict[int, str] = {}
    if athlete_ids:
        athlete_names = {
            int(i): n
            for i, n in db.query(Athlete.id, Athlete.athlete_name).filter(Athlete.id.in_(athlete_ids)).all()
        }
    return coach_names, athlete_names


def _label_from_maps(
    msg: TeamChatMessage, coach_names: dict[int, str], athlete_names: dict[int, str]
) -> str:
    if msg.sender_kind == TeamChatSenderKind.coach:
        if msg.coach_user_id:
            name = coach_names.get(int(msg.coach_user_id))
            if name:
                return name
        return "Треньор"
    if msg.athlete_id:
        name = athlete_names.get(int(msg.athlete_id))
        if name:
            return name
    return "Състезател"


def message_to_dict(
    db: Session,
    msg: TeamChatMessage,
    viewer_athlete_id: int | None,
    *,
    roster_count: int = 0,
    read_by: list[dict] | None = None,
    sender_label: str | None = None,
) -> dict:
    is_mine = (
        viewer_athlete_id is not None
        and msg.sender_kind == TeamChatSenderKind.athlete
        and int(msg.athlete_id or 0) == int(viewer_athlete_id)
    )
    read_list = read_by or []
    return {
        "id": msg.id,
        "team_id": msg.team_id,
        "sender_kind": msg.sender_kind.value if hasattr(msg.sender_kind, "value") else str(msg.sender_kind),
        # Ползва предварително изчисленото име ако е подадено (batch), иначе fallback.
        "sender_label": sender_label if sender_label is not None else _sender_label(db, msg),
        "body": msg.body,
        "created_at": msg.created_at,
        "is_mine": is_mine,
        "read_count": len(read_list),
        "roster_count": roster_count if msg.sender_kind == TeamChatSenderKind.coach else 0,
        "read_by": read_list,
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
    coach_names, athlete_names = _sender_labels_for_messages(db, rows)
    return [
        message_to_dict(db, m, athlete.id, sender_label=_label_from_maps(m, coach_names, athlete_names))
        for m in rows
    ]


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
    roster = _active_roster(db, team_id)
    roster_count = len(roster)
    coach_ids = [m.id for m in rows if m.sender_kind == TeamChatSenderKind.coach]
    reads_map = _reads_by_message_ids(db, coach_ids)
    roster_ids = {aid for aid, _ in roster}
    coach_names, athlete_names = _sender_labels_for_messages(db, rows)

    result = []
    for m in rows:
        read_by = reads_map.get(m.id, [])
        if m.sender_kind == TeamChatSenderKind.coach:
            read_by = [r for r in read_by if r["athlete_id"] in roster_ids]
        result.append(
            message_to_dict(
                db,
                m,
                None,
                roster_count=roster_count,
                read_by=read_by if m.sender_kind == TeamChatSenderKind.coach else [],
                sender_label=_label_from_maps(m, coach_names, athlete_names),
            )
        )
    return result


def get_message_read_detail(db: Session, team_id: int, message_id: int) -> dict | None:
    msg = (
        db.query(TeamChatMessage)
        .filter(TeamChatMessage.id == int(message_id), TeamChatMessage.team_id == int(team_id))
        .first()
    )
    if not msg or msg.sender_kind != TeamChatSenderKind.coach:
        return None
    roster = _active_roster(db, team_id)
    roster_count = len(roster)
    read_by = _reads_by_message_ids(db, [msg.id]).get(msg.id, [])
    read_ids = {r["athlete_id"] for r in read_by}
    unread = [{"athlete_id": aid, "athlete_name": name} for aid, name in roster if aid not in read_ids]
    return {
        "message_id": msg.id,
        "read_by": read_by,
        "unread": unread,
        "read_count": len(read_by),
        "roster_count": roster_count,
    }


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
