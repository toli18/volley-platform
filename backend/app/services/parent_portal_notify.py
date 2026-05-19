from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Athlete, ParentPortalChangeMarker, Team, TeamMember
from app.services.parent_push import format_date_bg, notify_athlete

logger = logging.getLogger(__name__)

CHANGE_TRAINING_CANCELLED = "training_cancelled"
CHANGE_TRAINING_ADDED = "training_added"
CHANGE_TRAINING_CHANGED = "training_changed"
CHANGE_TRAINING_RESTORED = "training_restored"
CHANGE_COMPETITION_ADDED = "competition_added"
CHANGE_COMPETITION_CHANGED = "competition_changed"
CHANGE_COMPETITION_CANCELLED = "competition_cancelled"
CHANGE_COMPETITION_REMOVED = "competition_removed"
CHANGE_FEE_PAID = "fee_paid"


def _message_for(change_type: str, team_label: str, date_iso: str, extra: str | None = None) -> tuple[str, str]:
    date_label = format_date_bg(date_iso)
    base = f"{team_label} — {date_label}"
    if extra:
        base = f"{base} · {extra}"
    titles = {
        CHANGE_TRAINING_CANCELLED: "Отменена тренировка",
        CHANGE_TRAINING_ADDED: "Нова тренировка",
        CHANGE_TRAINING_CHANGED: "Променена тренировка",
        CHANGE_TRAINING_RESTORED: "Възстановена тренировка",
        CHANGE_COMPETITION_ADDED: "Ново състезание",
        CHANGE_COMPETITION_CHANGED: "Променено състезание",
        CHANGE_COMPETITION_CANCELLED: "Отменено състезание",
        CHANGE_COMPETITION_REMOVED: "Премахнато състезание",
        CHANGE_FEE_PAID: "Платена такса",
    }
    title = titles.get(change_type, "Обновен график")
    if change_type == CHANGE_FEE_PAID:
        return title, extra or "Месечната такса е отбелязана като платена."
    if change_type == CHANGE_TRAINING_CHANGED:
        return title, f"{base}. Проверете час или зала."
    return title, base


def add_marker(db: Session, athlete_id: int, change_type: str, date_iso: str, marker_key: str) -> None:
    row = (
        db.query(ParentPortalChangeMarker)
        .filter(
            ParentPortalChangeMarker.athlete_id == int(athlete_id),
            ParentPortalChangeMarker.marker_key == marker_key,
        )
        .first()
    )
    if row:
        row.change_type = change_type
        row.date_iso = date_iso
    else:
        db.add(
            ParentPortalChangeMarker(
                athlete_id=int(athlete_id),
                change_type=change_type,
                date_iso=date_iso,
                marker_key=marker_key,
            )
        )


def get_pending_highlights(db: Session, athlete_id: int) -> tuple[list[str], bool]:
    _, schedule_dates, fee_highlight = get_pending_marker_state(db, athlete_id)
    return schedule_dates, fee_highlight


def get_pending_marker_state(db: Session, athlete_id: int) -> tuple[set[str], list[str], bool]:
    rows = (
        db.query(ParentPortalChangeMarker)
        .filter(ParentPortalChangeMarker.athlete_id == int(athlete_id))
        .all()
    )
    marker_keys = {str(r.marker_key) for r in rows if r.marker_key}
    schedule_dates = sorted({r.date_iso for r in rows if r.change_type != CHANGE_FEE_PAID and r.date_iso})
    fee_highlight = any(r.change_type == CHANGE_FEE_PAID for r in rows)
    return marker_keys, schedule_dates, fee_highlight


def clear_markers_for_athlete(db: Session, athlete_id: int) -> None:
    db.query(ParentPortalChangeMarker).filter(ParentPortalChangeMarker.athlete_id == int(athlete_id)).delete(
        synchronize_session=False
    )
    db.commit()


def clear_fee_markers_for_athlete(db: Session, athlete_id: int) -> None:
    db.query(ParentPortalChangeMarker).filter(
        ParentPortalChangeMarker.athlete_id == int(athlete_id),
        ParentPortalChangeMarker.change_type == CHANGE_FEE_PAID,
    ).delete(synchronize_session=False)
    db.commit()


def clear_marker_for_athlete(db: Session, athlete_id: int, marker_key: str) -> None:
    db.query(ParentPortalChangeMarker).filter(
        ParentPortalChangeMarker.athlete_id == int(athlete_id),
        ParentPortalChangeMarker.marker_key == marker_key,
    ).delete(synchronize_session=False)
    db.commit()


def clear_schedule_markers_for_date(db: Session, athlete_id: int, date_iso: str) -> None:
    db.query(ParentPortalChangeMarker).filter(
        ParentPortalChangeMarker.athlete_id == int(athlete_id),
        ParentPortalChangeMarker.date_iso == date_iso,
        ParentPortalChangeMarker.change_type != CHANGE_FEE_PAID,
    ).delete(synchronize_session=False)
    db.commit()


def _athlete_ids_for_team(db: Session, team_id: int) -> list[int]:
    rows = (
        db.query(TeamMember.athlete_id)
        .filter(TeamMember.team_id == int(team_id), TeamMember.is_active.is_(True))
        .all()
    )
    return [int(r[0]) for r in rows]


def emit_team_change(
    db: Session,
    *,
    team_id: int,
    date_iso: str,
    change_type: str,
    marker_key: str,
    team_name: str | None = None,
    extra: str | None = None,
) -> None:
    if not team_name:
        team_name = db.query(Team.name).filter(Team.id == int(team_id)).scalar()
    team_label = team_name or "отбор"
    title, body = _message_for(change_type, team_label, date_iso, extra)
    athlete_ids = _athlete_ids_for_team(db, team_id)
    for aid in athlete_ids:
        athlete = db.query(Athlete).filter(Athlete.id == aid, Athlete.is_active.is_(True)).first()
        if not athlete:
            continue
        add_marker(db, aid, change_type, date_iso, marker_key)
        notify_athlete(db, aid, title, body)
    db.commit()
    logger.info("Parent notify team=%s date=%s type=%s athletes=%s", team_id, date_iso, change_type, len(athlete_ids))


def emit_athlete_change(
    db: Session,
    *,
    athlete_id: int,
    date_iso: str,
    change_type: str,
    marker_key: str,
    extra: str | None = None,
) -> None:
    athlete = db.query(Athlete).filter(Athlete.id == int(athlete_id), Athlete.is_active.is_(True)).first()
    if not athlete:
        return
    team_label = athlete.athlete_name or "състезател"
    title, body = _message_for(change_type, team_label, date_iso, extra)
    add_marker(db, athlete_id, change_type, date_iso, marker_key)
    notify_athlete(db, athlete_id, title, body)
    db.commit()


def queue_team_change(team_id: int, date_iso: str, change_type: str, marker_key: str, extra: str | None = None) -> None:
    db = SessionLocal()
    try:
        emit_team_change(
            db,
            team_id=team_id,
            date_iso=date_iso,
            change_type=change_type,
            marker_key=marker_key,
            extra=extra,
        )
    except Exception as exc:
        logger.exception("Parent portal team notify failed: %s", exc)
    finally:
        db.close()


def queue_athlete_change(athlete_id: int, date_iso: str, change_type: str, marker_key: str, extra: str | None = None) -> None:
    db = SessionLocal()
    try:
        emit_athlete_change(
            db,
            athlete_id=athlete_id,
            date_iso=date_iso,
            change_type=change_type,
            marker_key=marker_key,
            extra=extra,
        )
    except Exception as exc:
        logger.exception("Parent portal athlete notify failed: %s", exc)
    finally:
        db.close()


def queue_team_feed_post(team_id: int, preview: str) -> None:
    db = SessionLocal()
    try:
        athlete_ids = _athlete_ids_for_team(db, team_id)
        title = "Нова новина от отбора"
        body = (preview or "Има ново съобщение в отборната стая.").strip()[:240]
        for aid in athlete_ids:
            notify_athlete(db, aid, title, body)
        db.commit()
        logger.info("Team feed notify team=%s athletes=%s", team_id, len(athlete_ids))
    except Exception as exc:
        logger.exception("Team feed notify failed: %s", exc)
    finally:
        db.close()


def queue_fee_paid(athlete_id: int, month_key: str, amount: float) -> None:
    today = date.today().isoformat()
    extra = f"Месец {month_key} · {amount:.2f} €"
    queue_athlete_change(
        athlete_id,
        today,
        CHANGE_FEE_PAID,
        f"fee:{athlete_id}:{month_key}",
        extra=extra,
    )
