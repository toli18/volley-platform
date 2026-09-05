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
from app.services.session_coach_context import (
    load_training_session_pack,
    match_drills_for_message,
)

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
    trainingId: Optional[int] = None
    mode: Optional[str] = None  # session_live | default


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
    for_date: Optional[str] = Query(
        None, description="YYYY-MM-DD — закачен ден от URL/календар (води за sessionDate)"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*_COACH_ROLES)),
) -> Dict[str, Any]:
    """Отбори + програмна седмица + следващ мач за UI и Gemini."""
    parsed = None
    if for_date:
        try:
            from datetime import date as _date

            parsed = _date.fromisoformat(str(for_date).strip()[:10])
        except ValueError:
            parsed = None
    return build_coach_assistant_context(db, user, team_id=team_id, for_date=parsed)


@router.post("/chat")
def assistant_chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*_COACH_ROLES)),
) -> Dict[str, Any]:
    team_id = payload.context.teamId
    parsed = None
    raw_date = (payload.context.date or "").strip()
    if raw_date:
        try:
            from datetime import date as _date

            parsed = _date.fromisoformat(raw_date[:10])
        except ValueError:
            parsed = None

    session_pack = None
    if payload.context.trainingId:
        session_pack = load_training_session_pack(db, user, int(payload.context.trainingId))
        if session_pack.get("teamId") and not team_id:
            team_id = int(session_pack["teamId"])
        if session_pack.get("sessionDate") and not parsed:
            try:
                from datetime import date as _date

                parsed = _date.fromisoformat(str(session_pack["sessionDate"])[:10])
            except ValueError:
                parsed = None

    platform_ctx = build_coach_assistant_context(
        db, user, team_id=team_id, for_date=parsed
    )
    if session_pack:
        platform_ctx["sessionTraining"] = session_pack
        platform_ctx["promptText"] = (
            (platform_ctx.get("promptText") or "")
            + ("\n\n" if platform_ctx.get("promptText") else "")
            + str(session_pack.get("promptText") or "")
        )

    history = [{"role": t.role, "content": t.content} for t in payload.history]

    # Live: закачи упражнения по име (от плана + глобално търсене), за cues без Gemini
    prefer_ids = list((session_pack or {}).get("drillIds") or [])
    matched = match_drills_for_message(
        db,
        payload.message,
        history=history,
        prefer_ids=prefer_ids,
    )
    if matched:
        platform_ctx["matchedDrills"] = matched
        lines = ["=== УПРАЖНЕНИЕ, ЗА КОЕТО ПИТА ТРЕНЬОРЪТ ==="]
        for card in matched:
            lines.append(
                f"- {card.get('title')}: {card.get('description') or ''}"
            )
            if card.get("coachingPoints"):
                lines.append(f"  Cues: {card['coachingPoints']}")
            if card.get("commonMistakes"):
                lines.append(f"  Чести грешки: {card['commonMistakes']}")
            if card.get("progressions"):
                lines.append(f"  Прогресия: {card['progressions']}")
        lines.append("=== КРАЙ ===")
        platform_ctx["promptText"] = (
            (platform_ctx.get("promptText") or "")
            + ("\n\n" if platform_ctx.get("promptText") else "")
            + "\n".join(lines)
        )

    age_band = payload.ageBand or (platform_ctx.get("activeTeam") or {}).get("ageBand")
    ctx = payload.context.model_dump()
    if session_pack:
        ctx["mode"] = "session_live"
    result = build_reply(
        payload.message,
        age_band=age_band,
        context=ctx,
        history=history,
        platform_context=platform_ctx,
    )
    return result
