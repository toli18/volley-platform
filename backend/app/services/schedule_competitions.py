from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.competition_kinds import competition_kind_label, is_valid_competition_kind
from app.models import ClubCompetitionEvent, CompetitionRosterAthlete, Team, User
from app.schemas.schedule import ScheduleOccurrence
from app.services.competition_roster import days_until_match, roster_action_for_event


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
    """Само главният треньор редактира самото състезание (дата/място/отбор)."""
    return bool(is_head)


def can_edit_roster(db: Session, user, event: ClubCompetitionEvent, is_head: bool) -> bool:
    """Тимов лист: главен или треньор на отбора."""
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
    carded_team_label: str | None = None,
    roster_count: int = 0,
    today: date | None = None,
) -> ScheduleOccurrence:
    d = date.fromisoformat(event.date)
    kind = str(event.competition_kind)
    status = str(getattr(event, "roster_status", None) or "pending").strip().lower()
    today = today or date.today()
    days = days_until_match(event, today=today)
    action = roster_action_for_event(event, today=today)
    return ScheduleOccurrence(
        date=event.date,
        weekday=d.weekday(),
        event_type="competition",
        rule_id=None,
        exception_id=None,
        competition_id=int(event.id),
        competition_kind=kind,
        competition_kind_label=competition_kind_label(kind),
        card_index_id=int(event.card_index_id) if getattr(event, "card_index_id", None) else None,
        carded_team_label=carded_team_label,
        is_cancelled=bool(event.is_cancelled),
        location=_normalize_location(event.location),
        start_time=event.start_time,
        end_time=event.end_time,
        coach_id=int(event.coach_id),
        coach_name=coach_name,
        team_id=int(event.team_id),
        team_name=team_name,
        roster_status=status,
        needs_roster=status == "pending",
        roster_count=int(roster_count or 0),
        roster_action=action,
        days_until=days,
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
    try:
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
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []
    if not events:
        return []

    team_ids = {int(e.team_id) for e in events}
    coach_ids = {int(e.coach_id) for e in events}
    ci_ids = {int(e.card_index_id) for e in events if getattr(e, "card_index_id", None)}
    team_names = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all()) if team_ids else {}
    coach_names = dict(db.query(User.id, User.name).filter(User.id.in_(coach_ids)).all()) if coach_ids else {}
    carded_labels = {}
    if ci_ids:
        from app.models import BvfCardIndex
        from app.services.bvf_season_carding import card_index_display_label

        for ci in db.query(BvfCardIndex).filter(BvfCardIndex.id.in_(list(ci_ids))).all():
            carded_labels[int(ci.id)] = card_index_display_label(ci)

    event_ids = [int(e.id) for e in events]
    roster_counts: dict[int, int] = {}
    if event_ids:
        for cid, cnt in (
            db.query(CompetitionRosterAthlete.competition_id, func.count())
            .filter(CompetitionRosterAthlete.competition_id.in_(event_ids))
            .group_by(CompetitionRosterAthlete.competition_id)
            .all()
        ):
            roster_counts[int(cid)] = int(cnt)

    today = date.today()
    items = [
        competition_to_occurrence(
            e,
            team_name=team_names.get(int(e.team_id)),
            coach_name=coach_names.get(int(e.coach_id)),
            carded_team_label=carded_labels.get(int(e.card_index_id)) if getattr(e, "card_index_id", None) else None,
            roster_count=roster_counts.get(int(e.id), 0),
            today=today,
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
