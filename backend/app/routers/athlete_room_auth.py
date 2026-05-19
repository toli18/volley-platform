from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_athlete_room_access_token
from app.database import get_db
from app.schemas.parent_portal import ParentLoginCandidate, ParentLoginRequest, ParentLoginResponse
from app.services.athlete_login import find_athletes_for_login, team_names_for_athlete

router = APIRouter()

_LOGIN_FAIL_MSG = "Невалиден телефон или година на раждане."


@router.post("/athlete-room-auth/login", response_model=ParentLoginResponse)
def athlete_room_login(payload: ParentLoginRequest, db: Session = Depends(get_db)):
    matched = find_athletes_for_login(db, payload.parent_phone, payload.birth_year)
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_LOGIN_FAIL_MSG)

    if len(matched) == 1:
        return ParentLoginResponse(access_token=create_athlete_room_access_token(matched[0].id))

    if payload.athlete_id is not None:
        athlete = next((a for a in matched if a.id == int(payload.athlete_id)), None)
        if not athlete:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_LOGIN_FAIL_MSG)
        return ParentLoginResponse(access_token=create_athlete_room_access_token(athlete.id))

    return ParentLoginResponse(
        needs_selection=True,
        candidates=[
            ParentLoginCandidate(
                athlete_id=a.id,
                athlete_name=a.athlete_name,
                teams=team_names_for_athlete(db, a.id),
                birth_year=a.birth_year,
            )
            for a in matched
        ],
    )
