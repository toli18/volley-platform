from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.competition_kinds import competition_kind_label, is_valid_competition_kind
from app.models import ClubCompetitionEvent, Team, User
from app.schemas.schedule import ScheduleOccurrence


def _normalize_location(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def line_coach_team_ids(db: Session, club_id: int, coach_user_id: int) -> list[int]:
    rows = (
        db.query(Team.id)
        .filter(Team.club_id == club_id, Team.coach_id == int(coach_user_id))
        .all()
    )
    return [int(r[0]) for r in rows]


def can_manage_team(db: Session, user, club_id: int, team_id: int, is_head: bool) -> bool:
    if is_head:
        team = db.query(Team).filter(Team.id == int(team_id), Team.club_id == club_id).first()
        return team is not None
    return int(team_id) in line_coach_team_ids(db, club_id, int(user.id))


def can_edit_competition(db: Session, user, event: ClubCompetitionEvent, is_head: bool) -> bool:
    if is_head:
        return True
    if int(event.coach_id) == int(user.id):
        return True
    return int(event.team_id) in line_coach_team_ids(db, int(event.club_id), int(user.id))


def competition_to_occurrence(
    event: ClubCompetitionEvent,
    *,
    team_name: str | None,
    coach_name: str | None,
) -> ScheduleOccurrence:
    d = date.fromisoformat(event.date)
    kind = str(event.competition_kind)
    return ScheduleOccurrence(
        date=event.date,
        weekday=d.weekday(),
        event_type="competition",
        rule_id=None,
        exception_id=None,
        competition_id=int(event.id),
        competition_kind=kind,
        competition_kind_label=competition_kind_label(kind),
        is_cancelled=bool(event.is_cancelled),
        location=_normalize_location(event.location),
        start_time=event.start_time,
        end_time=event.end_time,
        coach_id=int(event.coach_id),
        coach_name=coach_name,
        team_id=int(event.team_id),
        team_name=team_name,
    )


def load_competition_occurrences(
    db: Session,
    *,
    club_id: int,
    d0: date,
    d1: date,
    coach_id: int | None,
    team_id: int | None,
    location: str | None,
    line_coach_user_id: int | None,
) -> list[ScheduleOccurrence]:
    q = db.query(ClubCompetitionEvent).filter(
        ClubCompetitionEvent.club_id == club_id,
        ClubCompetitionEvent.is_cancelled.is_(False),
        ClubCompetitionEvent.date >= d0.isoformat(),
        ClubCompetitionEvent.date <= d1.isoformat(),
    )
    if coach_id:
        q = q.filter(ClubCompetitionEvent.coach_id == int(coach_id))
    if team_id:
        q = q.filter(ClubCompetitionEvent.team_id == int(team_id))
    if location and location.strip():
        q = q.filter(ClubCompetitionEvent.location.ilike(f"%{location.strip()}%"))
    if line_coach_user_id:
        owned = line_coach_team_ids(db, club_id, line_coach_user_id)
        if not owned:
            return []
        q = q.filter(ClubCompetitionEvent.team_id.in_(owned))

    events = q.all()
    if not events:
        return []

    team_ids = {int(e.team_id) for e in events}
    coach_ids = {int(e.coach_id) for e in events}
    team_names = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all()) if team_ids else {}
    coach_names = dict(db.query(User.id, User.name).filter(User.id.in_(coach_ids)).all()) if coach_ids else {}

    items = [
        competition_to_occurrence(
            e,
            team_name=team_names.get(int(e.team_id)),
            coach_name=coach_names.get(int(e.coach_id)),
        )
        for e in events
    ]
    return items


def append_competitions_to_parent_schedule(
    db: Session,
    schedule_items: list,
    *,
    team_ids: list[int],
    from_date: str,
    to_date: str,
    ParentScheduleItem,
) -> list:
    if not team_ids:
        return schedule_items
    events = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.team_id.in_(team_ids),
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.date >= from_date,
            ClubCompetitionEvent.date <= to_date,
        )
        .all()
    )
    team_name_map = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all())
    for e in events:
        kind = str(e.competition_kind)
        schedule_items.append(
            ParentScheduleItem(
                date=e.date,
                start_time=e.start_time or "00:00",
                end_time=e.end_time or "00:00",
                location=(e.location or "").strip(),
                team_name=team_name_map.get(int(e.team_id)),
                event_type="competition",
                competition_kind=kind,
                competition_kind_label=competition_kind_label(kind),
            )
        )
    schedule_items.sort(key=lambda x: (x.date, x.start_time or ""))
    return schedule_items


def validate_competition_kind(kind: str) -> str:
    raw = str(kind or "").strip()
    if not is_valid_competition_kind(raw):
        raise ValueError("invalid competition_kind")
    return raw
