from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_parent_access_token
from app.database import get_db
from app.models import Athlete, Team, TeamMember
from app.schemas.parent_portal import ParentLoginCandidate, ParentLoginRequest, ParentLoginResponse
from app.services.parent_phone import normalize_phone_digits, phones_match

router = APIRouter()

_LOGIN_FAIL_MSG = "Невалиден телефон или година на раждане."


def _team_names_for_athlete(db: Session, athlete_id: int) -> list[str]:
    rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete_id, TeamMember.is_active.is_(True))
        .all()
    )
    return [r[0] for r in rows if r[0]]


def _find_athletes_for_login(db: Session, parent_phone: str, birth_year: int) -> list[Athlete]:
    digits = normalize_phone_digits(parent_phone)
    if len(digits) < 9:
        return []
    candidates = (
        db.query(Athlete)
        .filter(
            Athlete.is_active.is_(True),
            Athlete.birth_year == int(birth_year),
            Athlete.parent_phone.isnot(None),
        )
        .all()
    )
    return [a for a in candidates if phones_match(a.parent_phone, digits)]


@router.post("/parent-auth/login", response_model=ParentLoginResponse)
def parent_login(payload: ParentLoginRequest, db: Session = Depends(get_db)):
    matched = _find_athletes_for_login(db, payload.parent_phone, payload.birth_year)
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_LOGIN_FAIL_MSG)

    if len(matched) == 1:
        athlete = matched[0]
        return ParentLoginResponse(access_token=create_parent_access_token(athlete.id))

    if payload.athlete_id is not None:
        athlete = next((a for a in matched if a.id == int(payload.athlete_id)), None)
        if not athlete:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_LOGIN_FAIL_MSG)
        return ParentLoginResponse(access_token=create_parent_access_token(athlete.id))

    return ParentLoginResponse(
        needs_selection=True,
        candidates=[
            ParentLoginCandidate(
                athlete_id=a.id,
                athlete_name=a.athlete_name,
                teams=_team_names_for_athlete(db, a.id),
                birth_year=a.birth_year,
            )
            for a in matched
        ],
    )
