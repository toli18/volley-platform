from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import decode_jwt_token
from app.database import get_db
from app.models import Athlete

_parent_bearer = HTTPBearer(auto_error=False)


def _athlete_id_from_parent_payload(payload: dict) -> int:
    typ = str(payload.get("typ") or payload.get("type") or "")
    sub = str(payload.get("sub") or "")
    if typ != "parent" and not sub.startswith("parent:"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid parent session")
    if sub.startswith("parent:"):
        try:
            return int(sub.split(":", 1)[1])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid parent session") from exc
    try:
        return int(payload.get("athlete_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid parent session") from exc


def get_current_parent_athlete(
    credentials: HTTPAuthorizationCredentials | None = Depends(_parent_bearer),
    db: Session = Depends(get_db),
) -> Athlete:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Parent login required")
    payload = decode_jwt_token(credentials.credentials)
    athlete_id = _athlete_id_from_parent_payload(payload)
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id, Athlete.is_active.is_(True)).first()
    if not athlete:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Parent session invalid")
    return athlete
