"""API за треньорския AI помощник (чат + статус на Gemini)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies.roles import require_role
from app.models import User, UserRole
from app.services.coach_assistant import build_reply
from app.services.gemini_client import gemini_available, gemini_config

router = APIRouter(prefix="/api/ai/coach-assistant", tags=["Coach Assistant"])


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
    user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    _ = user
    _key, model = gemini_config()
    return {
        "geminiAvailable": gemini_available(),
        "model": model if gemini_available() else None,
        "mode": "gemini+local" if gemini_available() else "local_only",
    }


@router.post("/chat")
def assistant_chat(
    payload: ChatRequest,
    user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
) -> Dict[str, Any]:
    _ = user
    history = [{"role": t.role, "content": t.content} for t in payload.history]
    result = build_reply(
        payload.message,
        age_band=payload.ageBand,
        context=payload.context.model_dump(),
        history=history,
    )
    return result
