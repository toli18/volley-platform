from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Drill, Training, TrainingSource, TrainingStatus, User, UserRole
from ..services.bulgarian_training_generator import BLOCK_TO_PLAN_KEY, generate_training_session


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
    request_data = payload.model_dump()
    recent_by_session = _recent_drill_ids_for_user(db, user, limit_sessions=3)
    request_data["recentDrillIdsBySession"] = recent_by_session
    request_data["recentDrillIds"] = [did for bucket in recent_by_session for did in bucket]
    drills = db.query(Drill).filter(Drill.status == "approved").all()
    return generate_training_session(drills, request_data)


@router.post("/generate-and-save")
def generate_and_save_ai_training(
    payload: GenerateAndSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    request_data = payload.model_dump()
    recent_by_session = _recent_drill_ids_for_user(db, user, limit_sessions=3)
    request_data["recentDrillIdsBySession"] = recent_by_session
    request_data["recentDrillIds"] = [did for bucket in recent_by_session for did in bucket]
    drills = db.query(Drill).filter(Drill.status == "approved").all()
    generated = generate_training_session(drills, request_data)

    session = generated["session"]
    if payload.editedBlocks:
        edited_blocks = payload.editedBlocks
        session["blocks"] = edited_blocks
        session["totalMinutes"] = int(sum(int(b.get("targetMinutes", 0) or 0) for b in edited_blocks))
    blocks = session.get("blocks", [])
    plan: Dict[str, List[int]] = {}
    selected_drill_ids: List[int] = []
    weighted_score_sum = 0.0
    weighted_score_count = 0

    for block in blocks:
        block_type = block.get("blockType")
        ids = [int(d["drillId"]) for d in block.get("drills", [])]
        if block_type in {"Tactics", "Интеграция"}:
            sr = plan.get("serve_receive", [])
            ab = plan.get("attack_block", [])
            for idx, did in enumerate(ids):
                if idx % 2 == 0:
                    if did not in sr:
                        sr.append(did)
                else:
                    if did not in ab:
                        ab.append(did)
            plan["serve_receive"] = sr
            plan["attack_block"] = ab
        else:
            plan_key = BLOCK_TO_PLAN_KEY.get(block_type, str(block_type or "main").lower())
            plan[plan_key] = ids
        selected_drill_ids.extend(ids)
        for d in block.get("drills", []):
            weighted_score_sum += float(d.get("score", 0))
            weighted_score_count += 1

    avg_score = weighted_score_sum / weighted_score_count if weighted_score_count else 0.0
    title = (payload.trainingTitle or "").strip() or f"AI Training ({payload.periodPhase})"

    status_input = (payload.trainingStatus or "чернова").strip().lower()
    training_status = TrainingStatus.saved if status_input in {"saved", "запазена"} else TrainingStatus.draft

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

