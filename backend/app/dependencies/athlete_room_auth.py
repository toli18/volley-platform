from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import decode_jwt_token
from app.database import get_db
from app.models import Athlete

_athlete_room_bearer = HTTPBearer(auto_error=False)


def _athlete_id_from_room_payload(payload: dict) -> int:
    typ = str(payload.get("typ") or payload.get("type") or "")
    sub = str(payload.get("sub") or "")
    if typ != "athlete_room" and not sub.startswith("athlete_room:"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid athlete room session")
    if sub.startswith("athlete_room:"):
        try:
            return int(sub.split(":", 1)[1])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid athlete room session") from exc
    try:
        return int(payload.get("athlete_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid athlete room session") from exc


def get_current_athlete_room_athlete(
    credentials: HTTPAuthorizationCredentials | None = Depends(_athlete_room_bearer),
    db: Session = Depends(get_db),
) -> Athlete:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Athlete room login required")
    payload = decode_jwt_token(credentials.credentials)
    athlete_id = _athlete_id_from_room_payload(payload)
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id, Athlete.is_active.is_(True)).first()
    if not athlete:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Athlete room session invalid")
    return athlete
