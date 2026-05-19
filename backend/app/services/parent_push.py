from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Athlete, ParentPushSubscription, Team, TeamMember
from app.settings import settings

logger = logging.getLogger(__name__)

_WEEKDAYS_BG = ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]


def push_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def format_date_bg(iso_date: str) -> str:
    try:
        d = datetime.strptime(iso_date, "%Y-%m-%d").date()
        wd = _WEEKDAYS_BG[d.weekday()]
        return f"{wd}, {d.day}.{d.month}.{d.year}"
    except ValueError:
        return iso_date


def portal_url_for_athlete(athlete_id: int) -> str:
    base = (settings.parent_portal_public_url or "").strip().rstrip("/")
    if base:
        return f"{base}/parent/portal"
    return "/parent/portal"


def _send_web_push(sub: ParentPushSubscription, payload: dict) -> str:
    """Returns 'ok', 'stale' (remove subscription), or 'fail'."""
    if not push_configured():
        return "fail"
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed")
        return "fail"

    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            return "stale"
        logger.warning("Web push failed for subscription %s: %s", sub.id, exc)
        return "fail"
    except Exception as exc:
        logger.warning("Web push error for subscription %s: %s", sub.id, exc)
        return "fail"


def notify_athlete(db: Session, athlete_id: int, title: str, body: str, url: str | None = None) -> int:
    if not push_configured():
        return 0
    subs = (
        db.query(ParentPushSubscription)
        .filter(ParentPushSubscription.athlete_id == int(athlete_id))
        .all()
    )
    if not subs:
        return 0
    target_url = url or portal_url_for_athlete(athlete_id)
    payload = {"title": title, "body": body, "url": target_url}
    sent = 0
    stale: list[ParentPushSubscription] = []
    for sub in subs:
        result = _send_web_push(sub, payload)
        if result == "ok":
            sent += 1
        elif result == "stale":
            stale.append(sub)
    for sub in stale:
        db.delete(sub)
    if stale:
        db.commit()
    return sent


def _athlete_ids_for_team(db: Session, team_id: int) -> list[int]:
    rows = (
        db.query(TeamMember.athlete_id)
        .filter(TeamMember.team_id == int(team_id), TeamMember.is_active.is_(True))
        .all()
    )
    return [int(r[0]) for r in rows]


def notify_team_schedule_change(
    *,
    team_id: int,
    date_iso: str,
    change_kind: str,
    team_name: str | None = None,
) -> None:
    """change_kind: cancelled | override | restored"""
    db = SessionLocal()
    try:
        if not team_name:
            team_name = db.query(Team.name).filter(Team.id == int(team_id)).scalar()
        team_label = team_name or "отбор"
        date_label = format_date_bg(date_iso)

        if change_kind == "cancelled":
            title = "Отменена тренировка"
            body = f"{team_label} — {date_label}"
        elif change_kind == "override":
            title = "Променена тренировка"
            body = f"{team_label} — {date_label}. Проверете графика."
        else:
            title = "Обновен график"
            body = f"{team_label} — {date_label}"

        athlete_ids = _athlete_ids_for_team(db, team_id)
        for aid in athlete_ids:
            athlete = db.query(Athlete).filter(Athlete.id == aid, Athlete.is_active.is_(True)).first()
            if athlete:
                notify_athlete(db, aid, title, body)
    finally:
        db.close()


def queue_team_schedule_notification(team_id: int, date_iso: str, change_kind: str) -> None:
    """Fire-and-forget helper for route handlers."""
    try:
        notify_team_schedule_change(team_id=team_id, date_iso=date_iso, change_kind=change_kind)
    except Exception as exc:
        logger.exception("Parent push notification failed: %s", exc)


def upsert_subscription(
    db: Session,
    athlete_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
) -> ParentPushSubscription:
    row = db.query(ParentPushSubscription).filter(ParentPushSubscription.endpoint == endpoint).first()
    if row:
        row.athlete_id = int(athlete_id)
        row.p256dh = p256dh
        row.auth = auth
        row.user_agent = user_agent
    else:
        row = ParentPushSubscription(
            athlete_id=int(athlete_id),
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_subscription_for_athlete(db: Session, athlete_id: int, endpoint: str | None = None) -> int:
    q = db.query(ParentPushSubscription).filter(ParentPushSubscription.athlete_id == int(athlete_id))
    if endpoint:
        q = q.filter(ParentPushSubscription.endpoint == endpoint)
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return count
