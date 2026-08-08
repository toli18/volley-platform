"""Пътуващ състав (тимов лист) за клубни състезания."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    BvfCardIndexMember,
    ClubCompetitionEvent,
    CompetitionRosterAthlete,
    TeamMember,
)
from app.services.parent_portal_notify import (
    CHANGE_COMPETITION_ADDED,
    queue_athlete_change,
)

ROSTER_MAX = 14
ROSTER_MAX_EDITS = 3
LOCK_HOURS_BEFORE = 24


def candidate_athletes(db: Session, event: ClubCompetitionEvent) -> list[Athlete]:
    """Картотечни членове ако има card_index; иначе активни от тренировъчната група."""
    if event.card_index_id:
        rows = (
            db.query(Athlete)
            .join(BvfCardIndexMember, BvfCardIndexMember.athlete_id == Athlete.id)
            .filter(
                BvfCardIndexMember.card_index_id == int(event.card_index_id),
                Athlete.is_active.is_(True),
            )
            .order_by(Athlete.athlete_name.asc())
            .all()
        )
        return rows
    rows = (
        db.query(Athlete)
        .join(TeamMember, TeamMember.athlete_id == Athlete.id)
        .filter(
            TeamMember.team_id == int(event.team_id),
            TeamMember.is_active.is_(True),
            Athlete.is_active.is_(True),
        )
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    return rows


def roster_athlete_ids(db: Session, competition_id: int) -> set[int]:
    rows = (
        db.query(CompetitionRosterAthlete.athlete_id)
        .filter(CompetitionRosterAthlete.competition_id == int(competition_id))
        .all()
    )
    return {int(r[0]) for r in rows}


def is_roster_time_locked(event: ClubCompetitionEvent, *, now: datetime | None = None) -> bool:
    """Заключва 24 ч преди мача (по дата; без точен timezone)."""
    try:
        match_day = date.fromisoformat(str(event.date))
    except ValueError:
        return False
    now = now or datetime.utcnow()
    lock_at = datetime.combine(match_day, datetime.min.time()) - timedelta(hours=LOCK_HOURS_BEFORE)
    return now >= lock_at


def roster_is_locked(event: ClubCompetitionEvent) -> bool:
    status = (event.roster_status or "pending").strip().lower()
    if status == "locked" or event.roster_locked_at:
        return True
    if int(event.roster_edit_count or 0) >= ROSTER_MAX_EDITS and status == "confirmed":
        return True
    if is_roster_time_locked(event):
        return True
    return False


def set_roster(
    db: Session,
    event: ClubCompetitionEvent,
    athlete_ids: list[int],
    *,
    is_initial: bool = False,
) -> dict[str, Any]:
    """Записва тимов лист. Връща meta + списък за notify."""
    if roster_is_locked(event) and not is_initial:
        raise ValueError("Тимовият лист е заключен (3 корекции или по-малко от 24 ч до мача).")

    uniq: list[int] = []
    seen: set[int] = set()
    for raw in athlete_ids:
        aid = int(raw)
        if aid in seen:
            continue
        seen.add(aid)
        uniq.append(aid)
    if len(uniq) > ROSTER_MAX:
        raise ValueError(f"Максимум {ROSTER_MAX} състезатели в тимовия лист.")
    if not uniq:
        raise ValueError("Избери поне един състезател.")

    candidates = {int(a.id) for a in candidate_athletes(db, event)}
    invalid = [aid for aid in uniq if aid not in candidates]
    if invalid:
        raise ValueError("Има състезатели извън картотеката / групата.")

    previous = roster_athlete_ids(db, event.id)
    db.query(CompetitionRosterAthlete).filter(
        CompetitionRosterAthlete.competition_id == int(event.id)
    ).delete(synchronize_session=False)
    for aid in uniq:
        db.add(CompetitionRosterAthlete(competition_id=int(event.id), athlete_id=aid))

    was_confirmed = (event.roster_status or "").strip().lower() == "confirmed"
    if was_confirmed and not is_initial:
        event.roster_edit_count = int(event.roster_edit_count or 0) + 1
    event.roster_status = "confirmed"
    event.roster_confirmed_at = datetime.utcnow()

    if int(event.roster_edit_count or 0) >= ROSTER_MAX_EDITS or is_roster_time_locked(event):
        event.roster_status = "locked"
        event.roster_locked_at = datetime.utcnow()

    added = set(uniq) - previous
    removed = previous - set(uniq)
    return {
        "athlete_ids": uniq,
        "added": sorted(added),
        "removed": sorted(removed),
        "edit_count": int(event.roster_edit_count or 0),
        "status": event.roster_status,
    }


def try_auto_confirm_roster(db: Session, event: ClubCompetitionEvent) -> bool:
    """Ако кандидатите са ≤14 — автоматичен лист и потвърждение."""
    cands = candidate_athletes(db, event)
    if not cands or len(cands) > ROSTER_MAX:
        return False
    if (event.roster_status or "").strip().lower() in {"confirmed", "locked"}:
        return False
    set_roster(db, event, [int(a.id) for a in cands], is_initial=True)
    return True


def notify_roster_parents(event: ClubCompetitionEvent, meta: dict[str, Any]) -> None:
    """Push към добавени / премахнати (и към всички при първо потвърждение)."""
    date_iso = str(event.date)
    marker = f"comp:{event.id}:roster"
    for aid in meta.get("added") or []:
        queue_athlete_change(
            int(aid),
            date_iso,
            CHANGE_COMPETITION_ADDED,
            marker,
            extra="В състава за мача / пътуване",
        )
    for aid in meta.get("removed") or []:
        queue_athlete_change(
            int(aid),
            date_iso,
            CHANGE_COMPETITION_ADDED,
            f"{marker}:out",
            extra="Вече не си в състава за този мач",
        )


def roster_summary(db: Session, event: ClubCompetitionEvent) -> dict[str, Any]:
    ids = roster_athlete_ids(db, event.id)
    cands = candidate_athletes(db, event)
    locked = roster_is_locked(event)
    status = (event.roster_status or "pending").strip().lower()
    return {
        "status": status,
        "locked": locked,
        "edit_count": int(event.roster_edit_count or 0),
        "edits_remaining": max(0, ROSTER_MAX_EDITS - int(event.roster_edit_count or 0)),
        "max_athletes": ROSTER_MAX,
        "candidate_count": len(cands),
        "selected_count": len(ids),
        "needs_roster": status == "pending" or (len(cands) > ROSTER_MAX and status == "pending"),
        "auto_eligible": 0 < len(cands) <= ROSTER_MAX,
        "athlete_ids": sorted(ids),
        "candidates": [
            {"id": int(a.id), "name": a.athlete_name, "selected": int(a.id) in ids}
            for a in cands
        ],
    }
