"""Public Form 0-3 parent-2 signature via invite link (no login).

Adds only the second parent canvas to an existing signed form — does not
deactivate or overwrite parent1 / athlete signatures.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import decode_jwt_token
from app.database import get_db
from app.models import Athlete, AthleteCardingForm, Club
from app.services.carding_form import (
    attach_parent2_canvas_signature,
    form_needs_parent2_canvas,
    open_carding_season_year,
    season_label,
)

router = APIRouter(prefix="/api/public/carding-form-parent2", tags=["Public Form 03 Parent2"])


class PublicParent2SignIn(BaseModel):
    signature_parent2_image: str = Field(..., min_length=32)
    signature_parent2: Optional[str] = Field(None, max_length=255)


def _payload_from_token(token: str) -> dict:
    try:
        payload = decode_jwt_token(token)
    except HTTPException as exc:
        raise HTTPException(status_code=401, detail="Линкът е невалиден или изтекъл") from exc
    if payload.get("typ") != "carding_parent2":
        raise HTTPException(status_code=401, detail="Линкът е невалиден")
    return payload


def _form_from_payload(db: Session, payload: dict) -> tuple[Athlete, Club, AthleteCardingForm]:
    athlete_id = int(payload.get("athlete_id") or 0)
    form_id = int(payload.get("form_id") or 0)
    season_year = int(payload.get("season_year") or 0)
    club_id = int(payload.get("club_id") or 0)
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete or not athlete.club_id or int(athlete.club_id) != club_id:
        raise HTTPException(status_code=404, detail="Състезателят не е намерен")
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    open_year = open_carding_season_year(db, club.id)
    if not open_year or int(open_year) != season_year:
        raise HTTPException(status_code=409, detail="Сезонът вече не е отворен за Форма 03")
    form = (
        db.query(AthleteCardingForm)
        .filter(
            AthleteCardingForm.id == form_id,
            AthleteCardingForm.athlete_id == athlete_id,
            AthleteCardingForm.is_active.is_(True),
            AthleteCardingForm.season_year == season_year,
        )
        .first()
    )
    if not form:
        raise HTTPException(status_code=404, detail="Форма 03 не е намерена")
    return athlete, club, form


@router.get("/{token}")
def public_carding_parent2_meta(token: str, db: Session = Depends(get_db)):
    payload = _payload_from_token(token)
    athlete, club, form = _form_from_payload(db, payload)
    needs = form_needs_parent2_canvas(form)
    return {
        "needs_sign": needs,
        "already_signed": not needs,
        "form_id": form.id,
        "form_kind": form.form_kind,
        "season_year": form.season_year,
        "season_label": season_label(form.season_year),
        "club_name": club.name or "",
        "athlete_name": athlete.athlete_name,
        "parent1_full_name": (form.parent1_full_name or "").strip() or None,
        "parent2_full_name": (form.parent2_full_name or "").strip() or None,
    }


@router.post("/{token}")
def public_carding_parent2_sign(token: str, body: PublicParent2SignIn, db: Session = Depends(get_db)):
    payload = _payload_from_token(token)
    athlete, club, form = _form_from_payload(db, payload)
    if not form_needs_parent2_canvas(form):
        raise HTTPException(status_code=409, detail="Подписът на родител 2 вече е записан")
    try:
        form = attach_parent2_canvas_signature(
            db,
            form,
            signature_image_data_url=body.signature_parent2_image,
            signature_parent2_text=body.signature_parent2,
            club=club,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "ok": True,
        "form_id": form.id,
        "season_year": form.season_year,
        "athlete_name": athlete.athlete_name,
        "needs_parent2_sign": False,
    }
