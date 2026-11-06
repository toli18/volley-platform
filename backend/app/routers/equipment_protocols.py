"""Приемо-предавателни протоколи за екипировка (от профила на състезателя)."""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import AthleteEquipmentProtocol, Club, User, UserRole
from app.routers.teams import _get_athlete_for_team_context
from app.services.carding_form import _decode_png_data_url, _signature_png_has_ink
from app.services.club_office_docs import club_city, club_display_name
from app.services.equipment_protocol import (
    STATUS_ISSUED,
    STATUS_RETURNED,
    athlete_display_name,
    build_equipment_protocol_pdf,
    current_sport_season,
    next_protocol_number,
    normalize_items,
    protocol_to_dict,
)

router = APIRouter(prefix="/api/teams/athletes", tags=["Equipment Protocols"])

_COACH_ROLES = (
    UserRole.coach,
    UserRole.club_head_coach,
    UserRole.federation_admin,
    UserRole.platform_admin,
)


class ProtocolItemIn(BaseModel):
    key: Optional[str] = Field(None, max_length=32)
    label: str = Field(..., min_length=1, max_length=120)
    qty: int = Field(1, ge=1, le=99)
    unit: str = Field("бр.", max_length=16)
    note: Optional[str] = Field(None, max_length=120)


class ProtocolCreateIn(BaseModel):
    season: Optional[str] = Field(None, max_length=16)
    issued_at: Optional[date] = None
    city: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None, max_length=2000)
    items: list[ProtocolItemIn] = Field(default_factory=list)
    recipient_signer_role: Literal["athlete", "parent"] = "athlete"
    recipient_signer_name: Optional[str] = Field(None, max_length=255)
    signature_recipient_image: str = Field(..., min_length=32)
    signature_coach_image: str = Field(..., min_length=32)


class ProtocolReturnIn(BaseModel):
    returned_at: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)
    signature_recipient_image: str = Field(..., min_length=32)
    signature_coach_image: str = Field(..., min_length=32)


def _decode_sig(data_url: str, label: str) -> bytes:
    try:
        blob = _decode_png_data_url(data_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{label}: {exc}") from exc
    if not _signature_png_has_ink(blob):
        raise HTTPException(status_code=422, detail=f"{label}: подписът изглежда празен.")
    return blob


def _get_protocol_for_athlete(
    db: Session, athlete_id: int, protocol_id: int, user: User
) -> tuple[AthleteEquipmentProtocol, object]:
    athlete = _get_athlete_for_team_context(db, athlete_id, user)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    q = db.query(AthleteEquipmentProtocol).filter(
        AthleteEquipmentProtocol.id == int(protocol_id),
        AthleteEquipmentProtocol.athlete_id == int(athlete_id),
    )
    if athlete.club_id:
        q = q.filter(AthleteEquipmentProtocol.club_id == int(athlete.club_id))
    row = q.first()
    if not row:
        raise HTTPException(status_code=404, detail="Протоколът не е намерен.")
    return row, athlete


@router.get("/{athlete_id}/equipment-protocols")
def list_protocols(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    athlete = _get_athlete_for_team_context(db, athlete_id, current_user)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    rows = (
        db.query(AthleteEquipmentProtocol)
        .filter(AthleteEquipmentProtocol.athlete_id == int(athlete_id))
        .order_by(AthleteEquipmentProtocol.issued_at.desc(), AthleteEquipmentProtocol.id.desc())
        .all()
    )
    return {
        "season_default": current_sport_season(),
        "protocols": [protocol_to_dict(r) for r in rows],
    }


@router.post("/{athlete_id}/equipment-protocols")
def create_protocol(
    athlete_id: int,
    payload: ProtocolCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    athlete = _get_athlete_for_team_context(db, athlete_id, current_user)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма клуб.")

    items = normalize_items([i.model_dump() for i in payload.items])
    if not items:
        raise HTTPException(status_code=422, detail="Добавете поне една позиция в описа.")

    season = (payload.season or "").strip() or current_sport_season()
    issued_at = payload.issued_at or date.today()
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()

    recipient_blob = _decode_sig(payload.signature_recipient_image, "Подпис на получателя")
    coach_blob = _decode_sig(payload.signature_coach_image, "Подпис на треньора")

    signer_name = (payload.recipient_signer_name or "").strip()
    if not signer_name:
        if payload.recipient_signer_role == "parent":
            signer_name = (athlete.parent_name or "").strip() or "Родител"
        else:
            signer_name = athlete_display_name(athlete)

    row = AthleteEquipmentProtocol(
        club_id=int(athlete.club_id),
        athlete_id=int(athlete.id),
        coach_user_id=int(current_user.id),
        number=next_protocol_number(db, int(athlete.club_id), issued_at.year),
        season=season[:16],
        status=STATUS_ISSUED,
        issued_at=issued_at,
        city=(payload.city or club_city(club) or "").strip()[:120] or None,
        notes=(payload.notes or "").strip() or None,
        items=items,
        athlete_name_snapshot=athlete_display_name(athlete)[:255],
        club_name_snapshot=club_display_name(club)[:255],
        coach_name_snapshot=(current_user.name or "").strip()[:255] or None,
        recipient_signer_role=payload.recipient_signer_role,
        recipient_signer_name=signer_name[:255],
        signature_recipient_data=recipient_blob,
        signature_coach_data=coach_blob,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return protocol_to_dict(row)


@router.post("/{athlete_id}/equipment-protocols/{protocol_id}/return")
def return_protocol(
    athlete_id: int,
    protocol_id: int,
    payload: ProtocolReturnIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    row, _athlete = _get_protocol_for_athlete(db, athlete_id, protocol_id, current_user)
    if row.status == STATUS_RETURNED:
        raise HTTPException(status_code=409, detail="Екипировката вече е върната по този протокол.")

    recipient_blob = _decode_sig(payload.signature_recipient_image, "Подпис при връщане")
    coach_blob = _decode_sig(payload.signature_coach_image, "Подпис на треньора при връщане")

    row.status = STATUS_RETURNED
    row.returned_at = payload.returned_at or date.today()
    row.return_coach_user_id = int(current_user.id)
    row.return_coach_name_snapshot = (current_user.name or "").strip()[:255] or None
    row.signature_return_recipient_data = recipient_blob
    row.signature_return_coach_data = coach_blob
    if (payload.notes or "").strip():
        prev = (row.notes or "").strip()
        extra = payload.notes.strip()
        row.notes = f"{prev}\n{extra}".strip() if prev else extra
    db.commit()
    db.refresh(row)
    return protocol_to_dict(row)


@router.get("/{athlete_id}/equipment-protocols/{protocol_id}/pdf")
def protocol_pdf(
    athlete_id: int,
    protocol_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    row, athlete = _get_protocol_for_athlete(db, athlete_id, protocol_id, current_user)
    club = db.query(Club).filter(Club.id == int(row.club_id)).first() if row.club_id else None
    pdf = build_equipment_protocol_pdf(row, club=club)
    filename = f"protocol_equipment_{row.number or row.id}.pdf".replace("/", "-")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
