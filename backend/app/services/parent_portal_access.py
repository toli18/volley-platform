"""Magic-link access to the parent portal (club application + Form 03)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteParentAccessToken, User
from app.settings import settings

INCOMING_TRANSFER_IMPORT_MARKER = "[Входящ трансфер · Volley Coach]"

DEFAULT_LINK_TTL_DAYS = 90


def athlete_from_incoming_transfer_import(athlete: Athlete) -> bool:
    notes = (athlete.notes or "").strip()
    if INCOMING_TRANSFER_IMPORT_MARKER in notes:
        return True
    # По-стари импорти преди маркера
    return "Импортиран от Volley Coach преди приключване" in notes and "в ход" in notes


def append_incoming_transfer_import_note(athlete: Athlete, detail: str) -> None:
    line = f"{INCOMING_TRANSFER_IMPORT_MARKER} {detail.strip()}".strip()
    prev = (athlete.notes or "").strip()
    if line in prev:
        return
    athlete.notes = f"{line}\n{prev}".strip() if prev else line


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parent_portal_public_base() -> str:
    base = (settings.parent_portal_public_url or "").rstrip("/")
    if not base or "vercel.app" in base.lower():
        base = "https://volley-platform-production.up.railway.app"
    return base


def _active_parent_token(db: Session, athlete_id: int) -> Optional[AthleteParentAccessToken]:
    now = datetime.utcnow()
    row = (
        db.query(AthleteParentAccessToken)
        .filter(
            AthleteParentAccessToken.athlete_id == int(athlete_id),
            AthleteParentAccessToken.is_active.is_(True),
        )
        .order_by(AthleteParentAccessToken.created_at.desc())
        .first()
    )
    if not row:
        return None
    if row.expires_at and row.expires_at < now:
        row.is_active = False
        db.commit()
        return None
    return row


def parent_portal_link_status(db: Session, athlete: Athlete) -> dict:
    row = _active_parent_token(db, athlete.id)
    if not row:
        return {
            "has_active_token": False,
            "token_preview": None,
            "parent_url": None,
            "expires_at": None,
            "last_used_at": None,
        }
    return {
        "has_active_token": True,
        "token_preview": row.token_prefix,
        "parent_url": None,
        "expires_at": row.expires_at,
        "last_used_at": row.last_used_at,
    }


def create_parent_portal_link(
    db: Session,
    athlete: Athlete,
    *,
    created_by: Optional[User] = None,
    ttl_days: int = DEFAULT_LINK_TTL_DAYS,
) -> dict:
    now = datetime.utcnow()
    for old in (
        db.query(AthleteParentAccessToken)
        .filter(
            AthleteParentAccessToken.athlete_id == int(athlete.id),
            AthleteParentAccessToken.is_active.is_(True),
        )
        .all()
    ):
        old.is_active = False
        old.expires_at = now

    raw = secrets.token_urlsafe(32)
    prefix = raw[:8]
    expires = now + timedelta(days=max(1, int(ttl_days)))
    row = AthleteParentAccessToken(
        athlete_id=int(athlete.id),
        token_hash=_token_hash(raw),
        token_prefix=prefix,
        created_by_user_id=int(created_by.id) if created_by else None,
        is_active=True,
        expires_at=expires,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    path = f"/parent/{raw}"
    url = f"{parent_portal_public_base()}{path}"
    return {
        "parent_url": url,
        "path": path,
        "token_preview": prefix,
        "expires_at": expires,
        "expires_days": ttl_days,
        "athlete_name": athlete.athlete_name,
    }
