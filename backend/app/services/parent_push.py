from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Athlete, Club, ParentPushSubscription
from app.settings import settings

logger = logging.getLogger(__name__)

PORTAL_PARENT = "parent"
PORTAL_ATHLETE_ROOM = "athlete_room"

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


def _public_base() -> str:
    return (settings.parent_portal_public_url or "").strip().rstrip("/")


def portal_url_for_portal(portal: str) -> str:
    base = _public_base()
    if portal == PORTAL_ATHLETE_ROOM:
        if base.endswith("/parent/portal"):
            return base.replace("/parent/portal", "/room/portal")
        if base:
            return f"{base}/room/portal"
        return "/room/portal"
    if base:
        return f"{base}/parent/portal" if not base.endswith("/parent/portal") else base
    return "/parent/portal"


def portal_url_for_athlete(athlete_id: int) -> str:
    return portal_url_for_portal(PORTAL_PARENT)


@dataclass(frozen=True)
class _PushSubInfo:
    id: int
    endpoint: str
    p256dh: str
    auth: str
    portal: str


def _push_sub_info(sub: ParentPushSubscription) -> _PushSubInfo:
    portal = (sub.portal or PORTAL_PARENT).strip() or PORTAL_PARENT
    return _PushSubInfo(
        id=int(sub.id),
        endpoint=sub.endpoint,
        p256dh=sub.p256dh,
        auth=sub.auth,
        portal=portal,
    )


def _send_web_push(sub: _PushSubInfo, payload: dict) -> tuple[str, str | None]:
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
            # Без timeout една мъртва/бавна push услуга може да блокира нишката
            # (и нейната DB връзка) за неопределено време.
            timeout=10,
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


def _api_base() -> str:
    """Публичен адрес на този backend (за абсолютни /static линкове)."""
    raw = (settings.api_public_url or "").strip().rstrip("/")
    if not raw:
        return ""
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    # Railway подава само домейна (без схема).
    return f"https://{raw}"


def club_icon_url_for_athlete(db: Session, athlete_id: int) -> str | None:
    """Абсолютен URL на логото на клуба, от който идва известието.

    Поддържа както абсолютни (http/https) лога, така и относителни
    /static/... пътища, сервирани от backend-а. Връща None само ако клубът
    няма лого (или не може да се построи абсолютен URL) — тогава service
    worker-ът показва логото на федерацията (fallback).
    """
    club_id = db.query(Athlete.club_id).filter(Athlete.id == int(athlete_id)).scalar()
    if not club_id:
        return None
    logo = db.query(Club.logo_url).filter(Club.id == int(club_id)).scalar()
    logo = (logo or "").strip()
    if not logo:
        return None
    if logo.startswith("http://") or logo.startswith("https://"):
        return logo
    base = _api_base()
    if not base:
        return None
    path = logo if logo.startswith("/") else f"/{logo}"
    return f"{base}{path}"


def notify_athlete(
    db: Session,
    athlete_id: int,
    title: str,
    body: str,
    url: str | None = None,
    *,
    portals: list[str] | None = None,
) -> dict:
    """Send push to subscriptions for this athlete.

    portals=None → parent + athlete_room (график, такси, новини).
    portals=["athlete_room"] → само отборната стая (чат).
    """
    if not push_configured():
        return {"sent": 0, "subscriptions": 0, "errors": ["Известията не са конфигурирани на сървъра (липсват VAPID ключове)."]}
    q = db.query(ParentPushSubscription).filter(ParentPushSubscription.athlete_id == int(athlete_id))
    if portals:
        wanted = {(p or "").strip() for p in portals if (p or "").strip()}
        if wanted:
            q = q.filter(ParentPushSubscription.portal.in_(list(wanted)))
    subs = q.all()
    if not subs:
        return {"sent": 0, "subscriptions": 0, "errors": ["Няма запазен абонамент за известия на това устройство."]}
    sent = 0
    stale: list[ParentPushSubscription] = []
    errors: list[str] = []
    icon_url = club_icon_url_for_athlete(db, athlete_id)
    for sub in subs:
        portal = (sub.portal or PORTAL_PARENT).strip() or PORTAL_PARENT
        target_url = url or portal_url_for_portal(portal)
        payload = {"title": title, "body": body, "url": target_url}
        if icon_url:
            payload["icon"] = icon_url
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


def send_test_notification(db: Session, athlete_id: int, portal: str = PORTAL_PARENT) -> dict:
    if not push_configured():
        return {
            "sent": 0,
            "subscriptions": 0,
            "errors": ["Известията не са конфигурирани на сървъра (липсват VAPID ключове)."],
        }
    subs = (
        db.query(ParentPushSubscription)
        .filter(
            ParentPushSubscription.athlete_id == int(athlete_id),
            ParentPushSubscription.portal == portal,
        )
        .all()
    )
    if not subs:
        return {
            "sent": 0,
            "subscriptions": 0,
            "errors": ["Няма запазен абонамент. Натиснете „Включи известия“, после опитайте теста."],
        }
    subs_info = [_push_sub_info(s) for s in subs]
    target_url = portal_url_for_portal(portal)
    icon_url = club_icon_url_for_athlete(db, athlete_id)
    payload = {
        "title": "Тестово известие",
        "body": "Ако виждате това, известията работят.",
        "url": target_url,
    }
    if icon_url:
        payload["icon"] = icon_url
    sent = 0
    stale_ids: list[int] = []
    errors: list[str] = []
    for sub in subs_info:
        result, detail = _send_web_push(sub, payload)
        if result == "ok":
            sent += 1
        elif result == "stale":
            stale_ids.append(sub.id)
            if detail:
                errors.append(detail)
        elif detail:
            errors.append(detail)
    if stale_ids:
        db.query(ParentPushSubscription).filter(ParentPushSubscription.id.in_(stale_ids)).delete(
            synchronize_session=False
        )
        db.commit()
    return {"sent": sent, "subscriptions": len(subs_info), "errors": errors}


def push_status_for_portal(db: Session, athlete_id: int, portal: str) -> int:
    return (
        db.query(ParentPushSubscription)
        .filter(
            ParentPushSubscription.athlete_id == int(athlete_id),
            ParentPushSubscription.portal == portal,
        )
        .count()
    )


def upsert_subscription(
    db: Session,
    athlete_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
    portal: str = PORTAL_PARENT,
) -> ParentPushSubscription:
    row = db.query(ParentPushSubscription).filter(ParentPushSubscription.endpoint == endpoint).first()
    if row:
        row.athlete_id = int(athlete_id)
        row.p256dh = p256dh
        row.auth = auth
        row.user_agent = user_agent
        row.portal = portal
    else:
        row = ParentPushSubscription(
            athlete_id=int(athlete_id),
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
            portal=portal,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_subscription_for_athlete(
    db: Session,
    athlete_id: int,
    endpoint: str | None = None,
    portal: str | None = None,
) -> int:
    q = db.query(ParentPushSubscription).filter(ParentPushSubscription.athlete_id == int(athlete_id))
    if endpoint:
        q = q.filter(ParentPushSubscription.endpoint == endpoint)
    if portal:
        q = q.filter(ParentPushSubscription.portal == portal)
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return count
