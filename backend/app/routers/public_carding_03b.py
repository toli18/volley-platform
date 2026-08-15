"""Public Form 0-3 B signing via invite link (no login)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import decode_jwt_token
from app.database import get_db
from app.models import Athlete, Club
from app.services.carding_form import (
    FORM_KIND_03B,
    athlete_needs_adult_carding_form,
    create_signed_carding_form_03b,
    form_kind_for_athlete,
    open_carding_season_year,
    prefill_carding_form,
    season_label,
)

router = APIRouter(prefix="/api/public/carding-form-03b", tags=["Public Form 03B"])


class Public03bSignIn(BaseModel):
    city: Optional[str] = Field(None, max_length=120)
    rules_accepted: bool = False
    signature_athlete_image: str = Field(..., min_length=32)
    athlete_full_name: Optional[str] = Field(None, max_length=255)
    athlete_egn: Optional[str] = Field(None, max_length=16)


def _payload_from_token(token: str) -> dict:
    try:
        payload = decode_jwt_token(token)
    except HTTPException as exc:
        raise HTTPException(status_code=401, detail="Линкът е невалиден или изтекъл") from exc
    if payload.get("typ") != "carding_03b":
        raise HTTPException(status_code=401, detail="Линкът е невалиден")
    return payload


def _athlete_and_season(db: Session, payload: dict) -> tuple[Athlete, Club, int]:
    athlete_id = int(payload.get("athlete_id") or 0)
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
    if form_kind_for_athlete(athlete, season_year) != FORM_KIND_03B:
        raise HTTPException(status_code=409, detail="Форма 0-3 B не важи за този състезател")
    return athlete, club, season_year


@router.get("/{token}")
def public_carding_03b_meta(token: str, db: Session = Depends(get_db)):
    payload = _payload_from_token(token)
    athlete, club, year = _athlete_and_season(db, payload)
    needs = athlete_needs_adult_carding_form(db, athlete)
    pre = prefill_carding_form(db, athlete, year) if needs else None
    return {
        "needs_sign": needs,
        "form_kind": FORM_KIND_03B,
        "season_year": year,
        "season_label": season_label(year),
        "club_name": club.name or "",
        "athlete_name": athlete.athlete_name,
        "already_signed": not needs,
        "prefill": pre,
    }


@router.post("/{token}")
def public_carding_03b_sign(token: str, body: Public03bSignIn, db: Session = Depends(get_db)):
    if not body.rules_accepted:
        raise HTTPException(status_code=422, detail="Необходимо е приемане на правилата на БФВ")
    payload = _payload_from_token(token)
    athlete, club, year = _athlete_and_season(db, payload)
    if not athlete_needs_adult_carding_form(db, athlete):
        raise HTTPException(status_code=409, detail="Формата вече е подписана")
    pre = prefill_carding_form(db, athlete, year)
    full = (body.athlete_full_name or "").strip() or " ".join(
        p
        for p in [pre.get("athlete_first_name"), pre.get("athlete_middle_name"), pre.get("athlete_last_name")]
        if p
    ).strip()
    egn = (body.athlete_egn or "").strip() or pre.get("athlete_egn") or ""
    try:
        form = create_signed_carding_form_03b(
            db,
            athlete=athlete,
            club=club,
            season_year=year,
            athlete_full_name=full,
            athlete_egn=egn,
            city=body.city or pre.get("city"),
            signature_image_data_url=body.signature_athlete_image,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "ok": True,
        "form_id": form.id,
        "signed_at": form.signed_at,
        "season_year": form.season_year,
        "athlete_name": athlete.athlete_name,
    }
