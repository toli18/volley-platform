from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Athlete, ParentPushSubscription
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


def _send_web_push(sub: ParentPushSubscription, payload: dict) -> tuple[str, str | None]:
    """Returns (status, error_detail) where status is 'ok', 'stale', or 'fail'."""
    if not push_configured():
        return "fail", "VAPID keys not configured on server"
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed")
        return "fail", "pywebpush not installed"

    private_key = (settings.vapid_private_key or "").strip()
    subject = (settings.vapid_subject or "mailto:support@volley-platform.local").strip()
    claims = {"sub": subject}

    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims=claims,
            ttl=86400,
        )
        return "ok", None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        body = ""
        try:
            body = (exc.response.text or "")[:300] if exc.response is not None else ""
        except Exception:
            body = ""
        detail = f"HTTP {status}: {body or str(exc)}".strip()
        if status in (404, 410):
            return "stale", detail
        logger.warning("Web push failed sub=%s %s", sub.id, detail)
        return "fail", detail
    except Exception as exc:
        logger.warning("Web push error sub=%s: %s", sub.id, exc)
        return "fail", str(exc)


def notify_athlete(
    db: Session,
    athlete_id: int,
    title: str,
    body: str,
    url: str | None = None,
) -> dict:
    if not push_configured():
        return {"sent": 0, "subscriptions": 0, "errors": ["VAPID keys not configured on server"]}
    subs = (
        db.query(ParentPushSubscription)
        .filter(ParentPushSubscription.athlete_id == int(athlete_id))
        .all()
    )
    if not subs:
        return {"sent": 0, "subscriptions": 0, "errors": ["No push subscription saved for this athlete"]}
    target_url = url or portal_url_for_athlete(athlete_id)
    payload = {"title": title, "body": body, "url": target_url}
    sent = 0
    stale: list[ParentPushSubscription] = []
    errors: list[str] = []
    for sub in subs:
        result, detail = _send_web_push(sub, payload)
        if result == "ok":
            sent += 1
        elif result == "stale":
            stale.append(sub)
            if detail:
                errors.append(detail)
        elif detail:
            errors.append(detail)
    for sub in stale:
        db.delete(sub)
    if stale:
        db.commit()
    return {"sent": sent, "subscriptions": len(subs), "errors": errors}


def _athlete_ids_for_team(db: Session, team_id: int) -> list[int]:
    rows = (
        db.query(TeamMember.athlete_id)
        .filter(TeamMember.team_id == int(team_id), TeamMember.is_active.is_(True))
        .all()
    )
    return [int(r[0]) for r in rows]


def send_test_notification(db: Session, athlete_id: int) -> dict:
    return notify_athlete(
        db,
        athlete_id,
        "Тестово известие",
        "Ако виждате това, известията работят.",
    )


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
