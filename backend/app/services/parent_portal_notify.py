from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Athlete, ParentPortalChangeMarker, Team, TeamMember
from app.services.parent_push import PORTAL_ATHLETE_ROOM, format_date_bg, notify_athlete

logger = logging.getLogger(__name__)

# Ограничен thread pool за фоновите известия. Всяка задача отваря DB сесия и
# прави няколко синхронни web-push заявки, докато трае. Без таван при пик от
# известия (много отбори/съобщения едновременно) бихме породили десетки нишки,
# които изчерпват connection pool-а и гладуват реалните HTTP заявки. Пулът пази
# едновременността ниска; излишните задачи просто чакат на опашка.
_NOTIFY_MAX_WORKERS = max(1, int(os.getenv("NOTIFY_MAX_WORKERS", "3")))
_notify_executor = ThreadPoolExecutor(
    max_workers=_NOTIFY_MAX_WORKERS,
    thread_name_prefix="parent-notify",
)


def _run_in_background(fn, *args, **kwargs) -> None:
    try:
        _notify_executor.submit(fn, *args, **kwargs)
    except RuntimeError:
        # Пулът е спрян (напр. при рестарт) — еднократен фолбек, за да не губим известието.
        threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True).start()


CHANGE_TRAINING_CANCELLED = "training_cancelled"
CHANGE_TRAINING_ADDED = "training_added"
CHANGE_TRAINING_CHANGED = "training_changed"
CHANGE_TRAINING_RESTORED = "training_restored"
CHANGE_COMPETITION_ADDED = "competition_added"
CHANGE_COMPETITION_CHANGED = "competition_changed"
CHANGE_COMPETITION_CANCELLED = "competition_cancelled"
CHANGE_COMPETITION_REMOVED = "competition_removed"
CHANGE_FEE_PAID = "fee_paid"
CHANGE_FEED_POST = "feed_post"
CHANGE_CHAT_MESSAGE = "chat_message"
CHANGE_SCHEDULE_DIGEST = "schedule_digest"
SCHEDULE_DIGEST_MARKER = "schedule_digest"

_SCHEDULE_CHANGE_TYPES = {
    CHANGE_TRAINING_CANCELLED,
    CHANGE_TRAINING_ADDED,
    CHANGE_TRAINING_CHANGED,
    CHANGE_TRAINING_RESTORED,
    CHANGE_COMPETITION_ADDED,
    CHANGE_COMPETITION_CHANGED,
    CHANGE_COMPETITION_CANCELLED,
    CHANGE_COMPETITION_REMOVED,
}


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
        CHANGE_FEED_POST: "Нова новина от треньора",
        CHANGE_CHAT_MESSAGE: "Ново съобщение в чата",
    }
    title = titles.get(change_type, "Обновен график")
    if change_type == CHANGE_FEE_PAID:
        return title, extra or "Месечната такса е отбелязана като платена."
    if change_type == CHANGE_FEED_POST:
        return title, extra or "Има ново съобщение в отборната стая."
    if change_type == CHANGE_CHAT_MESSAGE:
        if extra:
            return title, f"{extra} · Отворете чата."
        return title, "Отворете чата, за да прочетете съобщението."
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
    schedule_dates = sorted(
        {r.date_iso for r in rows if r.change_type in _SCHEDULE_CHANGE_TYPES and r.date_iso}
    )
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


def clear_schedule_markers_for_athlete(db: Session, athlete_id: int) -> None:
    db.query(ParentPortalChangeMarker).filter(
        ParentPortalChangeMarker.athlete_id == int(athlete_id),
        ParentPortalChangeMarker.change_type.in_(_SCHEDULE_CHANGE_TYPES),
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
    notify_ids: list[int] = []
    for aid in athlete_ids:
        athlete = db.query(Athlete).filter(Athlete.id == aid, Athlete.is_active.is_(True)).first()
        if not athlete:
            continue
        add_marker(db, aid, change_type, date_iso, marker_key)
        notify_ids.append(aid)
    db.commit()
    for aid in notify_ids:
        notify_athlete(db, aid, title, body)
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


def _queue_team_change_sync(
    team_id: int,
    date_iso: str,
    change_type: str,
    marker_key: str,
    extra: str | None = None,
) -> None:
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


def queue_team_change(team_id: int, date_iso: str, change_type: str, marker_key: str, extra: str | None = None) -> None:
    _run_in_background(_queue_team_change_sync, team_id, date_iso, change_type, marker_key, extra=extra)


def _queue_athlete_change_sync(
    athlete_id: int,
    date_iso: str,
    change_type: str,
    marker_key: str,
    extra: str | None = None,
) -> None:
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


def queue_athlete_change(athlete_id: int, date_iso: str, change_type: str, marker_key: str, extra: str | None = None) -> None:
    _run_in_background(_queue_athlete_change_sync, athlete_id, date_iso, change_type, marker_key, extra=extra)


def _team_id_from_marker(marker_key: str) -> int | None:
    parts = (marker_key or "").split(":")
    if len(parts) >= 2 and parts[0] in ("feed", "chat") and parts[1].isdigit():
        return int(parts[1])
    return None


def _target_tab_for_change(change_type: str) -> str:
    if change_type == CHANGE_FEE_PAID:
        return "home"
    if change_type == CHANGE_FEED_POST:
        return "home"
    if change_type == CHANGE_CHAT_MESSAGE:
        return "messages"
    if change_type in _SCHEDULE_CHANGE_TYPES or change_type == CHANGE_SCHEDULE_DIGEST:
        return "schedule"
    return "schedule"


_SCHEDULE_DIGEST_LABELS = (
    (CHANGE_TRAINING_ADDED, "нова тренировка", "нови тренировки"),
    (CHANGE_TRAINING_CHANGED, "променена тренировка", "променени тренировки"),
    (CHANGE_TRAINING_CANCELLED, "отменена тренировка", "отменени тренировки"),
    (CHANGE_TRAINING_RESTORED, "възстановена тренировка", "възстановени тренировки"),
    (CHANGE_COMPETITION_ADDED, "ново състезание", "нови състезания"),
    (CHANGE_COMPETITION_CHANGED, "променено състезание", "променени състезания"),
    (CHANGE_COMPETITION_CANCELLED, "отменено състезание", "отменени състезания"),
    (CHANGE_COMPETITION_REMOVED, "премахнато състезание", "премахнати състезания"),
)


def _bg_count_phrase(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _schedule_digest_notification(rows: list) -> dict:
    from collections import Counter

    counts = Counter(str(r.change_type) for r in rows)
    bits = []
    for ctype, one, many in _SCHEDULE_DIGEST_LABELS:
        n = counts.get(ctype, 0)
        if n:
            bits.append(_bg_count_phrase(n, one, many))
    dates = sorted({r.date_iso for r in rows if r.date_iso})
    date_hint = ""
    if dates:
        start = format_date_bg(dates[0])
        end = format_date_bg(dates[-1])
        date_hint = f" ({start}" + (f" – {end}" if start != end else "") + ")"
    summary = " · ".join(bits) if bits else _bg_count_phrase(len(rows), "промяна", "промени")
    return {
        "marker_key": SCHEDULE_DIGEST_MARKER,
        "change_type": CHANGE_SCHEDULE_DIGEST,
        "title": "Графикът е обновен",
        "body": f"{summary}{date_hint}. Отвори графика.",
        "target_tab": "schedule",
        "date_iso": dates[0] if dates else None,
        "team_id": None,
        "count": len(rows),
    }


def _row_to_home_notification(db: Session, row, team_names: dict[int, str]) -> dict:
    team_id = _team_id_from_marker(row.marker_key)
    team_label = ""
    if team_id is not None:
        if team_id not in team_names:
            team_names[team_id] = db.query(Team.name).filter(Team.id == team_id).scalar() or "отбор"
        team_label = team_names[team_id]
    extra = team_label if team_label else None
    title, body = _message_for(row.change_type, team_label or "отбор", row.date_iso, extra)
    return {
        "marker_key": row.marker_key,
        "change_type": row.change_type,
        "title": title,
        "body": body,
        "target_tab": _target_tab_for_change(row.change_type),
        "date_iso": row.date_iso,
        "team_id": team_id,
        "count": None,
    }


def build_home_notifications(db: Session, athlete_id: int) -> list[dict]:
    rows = (
        db.query(ParentPortalChangeMarker)
        .filter(ParentPortalChangeMarker.athlete_id == int(athlete_id))
        .order_by(ParentPortalChangeMarker.created_at.desc())
        .all()
    )
    schedule_rows = [r for r in rows if r.change_type in _SCHEDULE_CHANGE_TYPES]
    other_rows = [r for r in rows if r.change_type not in _SCHEDULE_CHANGE_TYPES]
    team_names: dict[int, str] = {}
    out: list[dict] = []
    if len(schedule_rows) >= 2:
        out.append(_schedule_digest_notification(schedule_rows))
    else:
        for row in schedule_rows:
            out.append(_row_to_home_notification(db, row, team_names))
    for row in other_rows:
        out.append(_row_to_home_notification(db, row, team_names))
    return out


def _queue_team_chat_message_sync(
    team_id: int,
    team_name: str,
    sender_label: str,
    preview: str,
    *,
    exclude_athlete_id: int | None = None,
) -> None:
    db = SessionLocal()
    try:
        athlete_ids = _athlete_ids_for_team(db, team_id)
        title = f"Чат — {team_name}"
        body = f"{sender_label}: {(preview or '').strip()[:200]}"
        today = date.today().isoformat()
        marker_key = f"chat:{int(team_id)}"
        for aid in athlete_ids:
            if exclude_athlete_id is not None and int(aid) == int(exclude_athlete_id):
                continue
            add_marker(db, aid, CHANGE_CHAT_MESSAGE, today, marker_key)
        db.commit()
        for aid in athlete_ids:
            if exclude_athlete_id is not None and int(aid) == int(exclude_athlete_id):
                continue
            # Чатът е в отборната стая — не пращаме push към родителския портал.
            notify_athlete(db, aid, title, body, portals=[PORTAL_ATHLETE_ROOM])
        logger.info("Team chat notify team=%s athletes=%s", team_id, len(athlete_ids))
    except Exception as exc:
        logger.exception("Team chat notify failed: %s", exc)
    finally:
        db.close()


def queue_team_chat_message(
    team_id: int,
    team_name: str,
    sender_label: str,
    preview: str,
    *,
    exclude_athlete_id: int | None = None,
) -> None:
    _run_in_background(
        _queue_team_chat_message_sync,
        team_id,
        team_name,
        sender_label,
        preview,
        exclude_athlete_id=exclude_athlete_id,
    )


def _queue_team_feed_post_sync(team_id: int, preview: str) -> None:
    db = SessionLocal()
    try:
        athlete_ids = _athlete_ids_for_team(db, team_id)
        title = "Нова новина от отбора"
        body = (preview or "Има ново съобщение в отборната стая.").strip()[:240]
        today = date.today().isoformat()
        marker_key = f"feed:{int(team_id)}"
        for aid in athlete_ids:
            add_marker(db, aid, CHANGE_FEED_POST, today, marker_key)
        db.commit()
        for aid in athlete_ids:
            notify_athlete(db, aid, title, body)
        logger.info("Team feed notify team=%s athletes=%s", team_id, len(athlete_ids))
    except Exception as exc:
        logger.exception("Team feed notify failed: %s", exc)
    finally:
        db.close()


def queue_team_feed_post(team_id: int, preview: str) -> None:
    _run_in_background(_queue_team_feed_post_sync, team_id, preview)


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
