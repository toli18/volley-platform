from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Drill, Team, Training, TrainingSource, TrainingStatus, User, UserRole
from ..services.bulgarian_training_generator import BLOCK_TO_PLAN_KEY
from ..services.training_generation import run_generation


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
    teamId: Optional[int] = None
    sessionDate: Optional[str] = None  # YYYY-MM-DD


@router.get("/for-day")
def training_for_day(
    team_id: int = Query(..., description="Отбор"),
    date: str = Query(..., description="Дата YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    """Връща последната генерирана тренировка за отбор+ден (или null)."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Отборът не е намерен")
    is_admin = user.role in (UserRole.platform_admin, UserRole.federation_admin)
    is_owner = team.coach_id == user.id
    is_same_club = bool(user.club_id) and team.club_id == user.club_id
    if not (is_admin or is_owner or is_same_club):
        raise HTTPException(status_code=403, detail="Нямате достъп до този отбор")

    row = (
        db.query(Training)
        .filter(Training.team_id == team_id, Training.session_date == date)
        .order_by(Training.id.desc())
        .first()
    )
    if not row:
        return {"training": None}
    status_val = row.status.value if hasattr(row.status, "value") else row.status
    return {"training": {"id": row.id, "title": row.title, "status": status_val}}


@router.post("/generate")
def generate_ai_training(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    return run_generation(payload.model_dump(), user=user, db=db)["result"]


@router.post("/generate-and-save")
def generate_and_save_ai_training(
    payload: GenerateAndSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    generation = run_generation(payload.model_dump(), user=user, db=db)
    generated = generation["result"]
    request_data = generation["request_data"]

    session = generated["session"]
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

    # Програмна връзка: ако е подаден отбор, проверяваме достъпа и закачаме тренировката към отбор + ден.
    team_id: Optional[int] = None
    if payload.teamId is not None:
        team = db.query(Team).filter(Team.id == payload.teamId).first()
        if not team:
            raise HTTPException(status_code=404, detail="Отборът не е намерен")
        is_admin = user.role in (UserRole.platform_admin, UserRole.federation_admin)
        is_owner = team.coach_id == user.id
        is_same_club = bool(user.club_id) and team.club_id == user.club_id
        if not (is_admin or is_owner or is_same_club):
            raise HTTPException(status_code=403, detail="Нямате достъп до този отбор")
        team_id = team.id

    request_data["sessionReview"] = generated.get("sessionReview")
    request_data["trainingPlanText"] = generated.get("trainingPlanText")

    training = Training(
        title=title,
        coach_id=user.id,
        club_id=user.club_id,
        team_id=team_id,
        session_date=(payload.sessionDate or "").strip() or None,
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
            "team_id": training.team_id,
            "session_date": training.session_date,
        },
        "session": session,
    }

