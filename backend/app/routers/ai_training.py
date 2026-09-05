from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Team, Training, User, UserRole
from ..services.training_generation import persist_generated_training, run_generation


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
    # От AI помощника: не презаписвай фокуса с дневния конспект на БФВ.
    assistantOverride: bool = False
    lockFocusFromAssistant: bool = False
    proposedExercises: List[Dict[str, Any]] = Field(default_factory=list)


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
    user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    return run_generation(payload.model_dump(), user=user, db=db)["result"]


@router.post("/generate-and-save")
def generate_and_save_ai_training(
    payload: GenerateAndSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    payload_data = payload.model_dump()
    edited_blocks = payload_data.pop("editedBlocks", None)
    training_title = payload_data.pop("trainingTitle", None)
    training_status = payload_data.pop("trainingStatus", "чернова")
    team_id_in = payload_data.pop("teamId", None)
    session_date = payload_data.pop("sessionDate", None)

    generation = run_generation(payload_data, user=user, db=db)
    if edited_blocks:
        session = generation["result"].setdefault("session", {})
        session["blocks"] = edited_blocks
        session["totalMinutes"] = int(sum(int(b.get("targetMinutes", 0) or 0) for b in edited_blocks))

    team_id: Optional[int] = None
    if team_id_in is not None:
        team = db.query(Team).filter(Team.id == team_id_in).first()
        if not team:
            raise HTTPException(status_code=404, detail="Отборът не е намерен")
        is_admin = user.role in (UserRole.platform_admin, UserRole.federation_admin)
        is_owner = team.coach_id == user.id
        is_same_club = bool(user.club_id) and team.club_id == user.club_id
        if not (is_admin or is_owner or is_same_club):
            raise HTTPException(status_code=403, detail="Нямате достъп до този отбор")
        team_id = team.id

    training = persist_generated_training(
        db,
        user,
        generation,
        title=training_title,
        team_id=team_id,
        session_date=session_date,
        status=training_status or "чернова",
    )

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
        "session": generation["result"].get("session"),
    }
