"""API за треньорския AI помощник (чат + статус + контекст)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import User, UserRole
from app.services.coach_assistant import build_reply
from app.services.coach_assistant_context import build_coach_assistant_context
from app.services.gemini_client import gemini_available, gemini_config

router = APIRouter(prefix="/api/ai/coach-assistant", tags=["Coach Assistant"])

_COACH_ROLES = (
    UserRole.coach,
    UserRole.club_head_coach,
    UserRole.platform_admin,
    UserRole.federation_admin,
)


class ChatTurn(BaseModel):
    role: str = "user"
    content: str = ""


class ChatContext(BaseModel):
    teamId: Optional[int] = None
    teamName: Optional[str] = None
    date: Optional[str] = None
    daysUntilMatch: Optional[int] = None
    programTheme: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    ageBand: Optional[str] = None
    context: ChatContext = Field(default_factory=ChatContext)
    history: List[ChatTurn] = Field(default_factory=list)


@router.get("/status")
def assistant_status(
    user: User = Depends(require_role(*_COACH_ROLES)),
):
    _ = user
    _key, model = gemini_config()
    return {
        "geminiAvailable": gemini_available(),
        "model": model if gemini_available() else None,
        "mode": "gemini+local" if gemini_available() else "local_only",
    }


@router.get("/context")
def assistant_context(
    team_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*_COACH_ROLES)),
) -> Dict[str, Any]:
    """Отбори + програмна седмица + следващ мач за UI и Gemini."""
    return build_coach_assistant_context(db, user, team_id=team_id)


@router.post("/chat")
def assistant_chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*_COACH_ROLES)),
) -> Dict[str, Any]:
    team_id = payload.context.teamId
    platform_ctx = build_coach_assistant_context(db, user, team_id=team_id)
    history = [{"role": t.role, "content": t.content} for t in payload.history]
    age_band = payload.ageBand or (platform_ctx.get("activeTeam") or {}).get("ageBand")
    result = build_reply(
        payload.message,
        age_band=age_band,
        context=payload.context.model_dump(),
        history=history,
        platform_context=platform_ctx,
    )
    return result
