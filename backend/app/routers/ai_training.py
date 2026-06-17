from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Drill, Training, TrainingSource, TrainingStatus, User, UserRole
from ..services.bulgarian_training_generator import BLOCK_TO_PLAN_KEY, generate_training_session
from ..national_method.bvf_ai_knowledge import (
    attach_text_drills,
    build_training_plan_text,
    enrich_request,
)
from ..national_method.content_policy import query_drills_for_ai


router = APIRouter(prefix="/api/ai/training", tags=["AI Training"])


class GenerateConstraints(BaseModel):
    excludeDrillIds: List[int] = Field(default_factory=list)
    mustIncludeDomains: List[str] = Field(default_factory=list)
    maxHighIntensityInRow: int = 2
    avoidRepeatSameCategory: bool = True


class GenerateRequest(BaseModel):
    age: Union[int, str]
    level: str
    mainFocus: Optional[str] = None
    secondaryFocus: Optional[str] = None
    periodPhase: Literal["prep", "inseason", "taper", "offseason"] = "inseason"
    durationTotalMin: int = 90
    playersCount: int = 12
    equipmentAvailable: List[str] = Field(default_factory=list)
    focusSkills: List[str] = Field(default_factory=list)
    focusDomains: List[str] = Field(default_factory=list)
    focusGamePhases: List[str] = Field(default_factory=list)
    intensityTarget: Literal["low", "medium", "high"] = "medium"
    constraints: GenerateConstraints = Field(default_factory=GenerateConstraints)
    randomSeed: Optional[int] = None
    ageBand: Optional[str] = None
    cycleId: Optional[int] = None
    cycleWeek: Optional[int] = None
    cycleDay: Optional[int] = None
    textbookSlug: Optional[str] = None
    sessionCode: Optional[str] = None


class GenerateAndSaveRequest(GenerateRequest):
    trainingTitle: Optional[str] = None
    trainingStatus: Optional[str] = "чернова"
    editedBlocks: Optional[List[Dict[str, Any]]] = None


def _recent_drill_ids_for_user(db: Session, user: User, limit_sessions: int = 3) -> List[List[int]]:
    recent_trainings = (
        db.query(Training)
        .filter(Training.coach_id == user.id)
        .order_by(Training.created_at.desc(), Training.id.desc())
        .limit(limit_sessions)
        .all()
    )
    grouped: List[List[int]] = []
    for training in recent_trainings:
        ids: List[int] = []
        selected = training.selected_drill_ids or []
        if isinstance(selected, list):
            for raw in selected:
                try:
                    ids.append(int(raw))
                except Exception:
                    continue
        grouped.append(ids)
    return grouped


@router.post("/generate")
def generate_ai_training(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    request_data = enrich_request(payload.model_dump(), db)
    recent_by_session = _recent_drill_ids_for_user(db, user, limit_sessions=3)
    request_data["recentDrillIdsBySession"] = recent_by_session
    request_data["recentDrillIds"] = [did for bucket in recent_by_session for did in bucket]
    drills = query_drills_for_ai(db)
    result = generate_training_session(drills, request_data)
    session = result.get("session") or {}
    attach_text_drills(session, request_data)
    result["trainingPlanText"] = build_training_plan_text(session, request_data)
    result["bvfMethod"] = request_data.get("bvfKnowledge")
    result["sessionReview"] = (request_data.get("bvfKnowledge") or {}).get("sessionReview")
    return result


@router.post("/generate-and-save")
def generate_and_save_ai_training(
    payload: GenerateAndSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    request_data = enrich_request(payload.model_dump(), db)
    recent_by_session = _recent_drill_ids_for_user(db, user, limit_sessions=3)
    request_data["recentDrillIdsBySession"] = recent_by_session
    request_data["recentDrillIds"] = [did for bucket in recent_by_session for did in bucket]
    drills = query_drills_for_ai(db)
    generated = generate_training_session(drills, request_data)

    session = generated["session"]
    attach_text_drills(session, request_data)
    generated["trainingPlanText"] = build_training_plan_text(session, request_data)
    generated["bvfMethod"] = request_data.get("bvfKnowledge")
    generated["sessionReview"] = (request_data.get("bvfKnowledge") or {}).get("sessionReview")
    if payload.editedBlocks:
        edited_blocks = payload.editedBlocks
        session["blocks"] = edited_blocks
        session["totalMinutes"] = int(sum(int(b.get("targetMinutes", 0) or 0) for b in edited_blocks))
    blocks = session.get("blocks", [])
    plan: Dict[str, list] = {}
    selected_drill_ids: List[int] = []
    weighted_score_sum = 0.0
    weighted_score_count = 0

    def _append_entry(section_key: str, drill: dict) -> None:
        did = int(drill["drillId"])
        mins = max(3, int(drill.get("minutes") or 10))
        plan.setdefault(section_key, []).append({"drillId": did, "minutes": mins, "coachNote": ""})
        selected_drill_ids.append(did)

    for block in blocks:
        block_type = block.get("blockType")
        drills_in_block = block.get("drills") or []
        if block_type in {"Tactics", "Интеграция"}:
            for idx, d in enumerate(drills_in_block):
                key = "serve_receive" if idx % 2 == 0 else "attack_block"
                _append_entry(key, d)
        else:
            plan_key = BLOCK_TO_PLAN_KEY.get(block_type, str(block_type or "main").lower())
            for d in drills_in_block:
                _append_entry(plan_key, d)
        for d in drills_in_block:
            weighted_score_sum += float(d.get("score", 0))
            weighted_score_count += 1

    avg_score = weighted_score_sum / weighted_score_count if weighted_score_count else 0.0
    title = (payload.trainingTitle or "").strip() or f"AI Training ({payload.periodPhase})"

    status_input = (payload.trainingStatus or "чернова").strip().lower()
    training_status = TrainingStatus.saved if status_input in {"saved", "запазена"} else TrainingStatus.draft

    request_data["sessionReview"] = generated.get("sessionReview")
    request_data["trainingPlanText"] = generated.get("trainingPlanText")

    training = Training(
        title=title,
        coach_id=user.id,
        club_id=user.club_id,
        source=TrainingSource.generator,
        status=training_status,
        plan=plan,
        notes="Generated by hybrid-v1",
        generation_request=request_data,
        model_version="hybrid-v1",
        score_summary={
            "average_score": round(avg_score, 4),
            "minutesOk": bool(session.get("checks", {}).get("minutesOk")),
            "intensityProgressionOk": bool(session.get("checks", {}).get("intensityProgressionOk")),
        },
        selected_drill_ids=selected_drill_ids,
    )
    db.add(training)
    db.commit()
    db.refresh(training)

    return {
        "training": {
            "id": training.id,
            "title": training.title,
            "source": training.source.value if hasattr(training.source, "value") else training.source,
            "status": training.status.value if hasattr(training.status, "value") else training.status,
            "plan": training.plan,
            "model_version": training.model_version,
        },
        "session": session,
    }

