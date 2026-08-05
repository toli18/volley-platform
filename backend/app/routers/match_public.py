# backend/app/routers/match_public.py
"""Публичен spectator достъп до live мач по share token (без login)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models_matches import Match, MatchStatus
from app.routers.match_live import _state
from app.schemas.matches import MatchPublicLiveRead

router = APIRouter(prefix="/api/public/match-live", tags=["Match Public Live"])


@router.get("/{token}", response_model=MatchPublicLiveRead)
def public_match_live(token: str, phase: str | None = None, db: Session = Depends(get_db)):
    raw = (token or "").strip()
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=404, detail="Линкът не е валиден")

    match = db.query(Match).filter(Match.live_share_token == raw).first()
    if not match:
        # Токенът е изтрит (мачът е приключен) или никога не е съществувал
        return MatchPublicLiveRead(
            opponent_name=None,
            system="5-1",
            format="bo5",
            status="finished",
            expired=True,
        )

    if match.status == MatchStatus.finished:
        # Защита: ако статутът е finished, но токенът още стои — изчисти
        match.live_share_token = None
        db.commit()
        return MatchPublicLiveRead(
            opponent_name=match.opponent_name,
            system=match.system.value if hasattr(match.system, "value") else str(match.system),
            format=(match.format.value if hasattr(getattr(match, "format", None), "value") else str(getattr(match, "format", None) or "bo5")),  # type: ignore[arg-type]
            status="finished",
            expired=True,
        )

    override = phase if phase in ("base", "serve", "receive") else None
    full = _state(db, match, phase_override=override)
    return MatchPublicLiveRead(
        opponent_name=full.opponent_name,
        system=full.system,
        format=full.format,
        status=full.status,
        phase=full.phase,
        set=full.set,
        sets=full.sets,
        sets_won_us=full.sets_won_us,
        sets_won_opp=full.sets_won_opp,
        match_won_by=full.match_won_by,
        court=full.court,
        libero=full.libero,
        recent_events=full.recent_events[:20],
        expired=False,
    )
