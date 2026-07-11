"""Публични заявки за пилот + админ inbox."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import PilotRequest, PilotRequestStatus, User, UserRole

router = APIRouter()

BVF_REGIONS = frozenset(
    {"Витоша", "Струма", "Тракия", "Странджа", "Добруджа", "Хемус"}
)


class PilotRequestCreate(BaseModel):
    club_name: str = Field(..., min_length=2, max_length=255)
    city: str | None = Field(None, max_length=120)
    region: str | None = Field(None, max_length=64)
    teams_count: str | None = Field(None, max_length=32)
    coaches_count: str | None = Field(None, max_length=32)
    contact_name: str = Field(..., min_length=2, max_length=255)
    note: str | None = Field(None, max_length=2000)
    website: str | None = Field(None, max_length=200)  # honeypot


class PilotRequestUpdate(BaseModel):
    status: PilotRequestStatus | None = None
    admin_seen: bool | None = None


def _serialize(row: PilotRequest) -> dict:
    return {
        "id": row.id,
        "club_name": row.club_name,
        "city": row.city,
        "region": row.region,
        "teams_count": row.teams_count,
        "coaches_count": row.coaches_count,
        "contact_name": row.contact_name,
        "note": row.note,
        "status": row.status.value if hasattr(row.status, "value") else str(row.status),
        "admin_seen": bool(row.admin_seen),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.post("/public/pilot-requests")
def create_pilot_request(payload: PilotRequestCreate, db: Session = Depends(get_db)):
    if payload.website:
        raise HTTPException(status_code=400, detail="Invalid submission")

    club = payload.club_name.strip()
    contact = payload.contact_name.strip()
    if not club or not contact:
        raise HTTPException(status_code=400, detail="club_name and contact_name are required")

    region = (payload.region or "").strip() or None
    if region and region not in BVF_REGIONS:
        raise HTTPException(status_code=400, detail="Invalid BVF region")

    row = PilotRequest(
        club_name=club,
        city=(payload.city or "").strip() or None,
        region=region,
        teams_count=(payload.teams_count or "").strip() or None,
        coaches_count=(payload.coaches_count or "").strip() or None,
        contact_name=contact,
        note=(payload.note or "").strip() or None,
        status=PilotRequestStatus.new,
        admin_seen=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "message": "Заявката е получена. Ще се свържем до 1 работен ден."}


def list_pilot_requests_for_admin(db: Session, *, limit: int = 24, unseen_only: bool = False) -> dict:
    q = select(PilotRequest).order_by(desc(PilotRequest.created_at))
    if unseen_only:
        q = q.where(PilotRequest.admin_seen.is_(False))
    rows = db.execute(q.limit(limit)).scalars().all()
    unread = db.execute(
        select(PilotRequest).where(PilotRequest.admin_seen.is_(False))
    ).scalars().all()
    return {
        "items": [_serialize(r) for r in rows],
        "unread_count": len(unread),
    }


@router.get("/pilot-requests")
def admin_list_pilot_requests(
    limit: int = 50,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.platform_admin)),
):
    return list_pilot_requests_for_admin(db, limit=min(limit, 100))


@router.patch("/pilot-requests/{request_id}")
def admin_update_pilot_request(
    request_id: int,
    payload: PilotRequestUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.platform_admin)),
):
    row = db.get(PilotRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if payload.status is not None:
        row.status = payload.status
    if payload.admin_seen is not None:
        row.admin_seen = payload.admin_seen
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/pilot-requests/read-all")
def admin_mark_all_pilot_seen(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.platform_admin)),
):
    rows = db.execute(select(PilotRequest).where(PilotRequest.admin_seen.is_(False))).scalars().all()
    for row in rows:
        row.admin_seen = True
    db.commit()
    return {"ok": True, "marked": len(rows)}
