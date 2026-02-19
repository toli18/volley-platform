from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any
from datetime import datetime

from ..database import get_db
from ..models import Drill, UserRole
from ..dependencies.roles import require_role

router = APIRouter()


# ========================
# Pydantic Schemas (ПЪЛНИ по drills.csv)
# ========================

class DrillBase(BaseModel):
    # Основни
    title: str
    description: Optional[str] = None
    goal: Optional[str] = None

    # Категоризация
    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    # Етикети/метрики
    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    # Възраст
    age_min: Optional[int] = None
    age_max: Optional[int] = None

    # Организация
    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    # Филтри за генератора (lists)
    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    # Тип / цел
    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    # Методика
    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    # Медия
    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None


class DrillCreate(DrillBase):
    pass


class DrillUpdate(BaseModel):
    # Всичко optional при PATCH
    title: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None

    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    age_min: Optional[int] = None
    age_max: Optional[int] = None

    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None

    status: Optional[str] = Field(default=None, description="draft | pending | approved | rejected")
    rejection_reason: Optional[str] = None


class DrillDecision(BaseModel):
    action: str = Field(..., description="approve или reject")
    rejection_reason: Optional[str] = None


class DrillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int

    title: str
    description: Optional[str] = None
    goal: Optional[str] = None

    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    age_min: Optional[int] = None
    age_max: Optional[int] = None

    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None

    created_by: Optional[int] = None
    status: str
    rejection_reason: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ========================
# Helpers
# ========================

def _list_approved(db: Session):
    return db.query(Drill).filter(Drill.status == "approved").order_by(Drill.id.asc()).all()


def _list_pending(db: Session):
    return db.query(Drill).filter(Drill.status == "pending").order_by(Drill.id.desc()).all()


# ========================
# Public list (approved)
# ========================

@router.get("", response_model=List[DrillOut])
def list_drills(db: Session = Depends(get_db)):
    return _list_approved(db)


# ========================
# Coach submit (pending)
# ========================

@router.post("", response_model=DrillOut)
def coach_submit_drill(
    payload: DrillCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.coach)),
):
    drill = Drill(**payload.model_dump(exclude_unset=True))
    drill.created_by = user.id
    drill.status = "pending"
    drill.created_at = datetime.utcnow()
    drill.updated_at = datetime.utcnow()

    db.add(drill)
    db.commit()
    db.refresh(drill)
    return drill


# ========================
# Coach my drills
# ========================

@router.get("/my", response_model=List[DrillOut])
def coach_my_drills(
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.coach)),
):
    return db.query(Drill).filter(Drill.created_by == user.id).order_by(Drill.id.desc()).all()


# ========================
# Admin pending list
# ========================

@router.get("/admin/pending", response_model=List[DrillOut])
def admin_list_pending(
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    return _list_pending(db)


# ========================
# Admin decision approve/reject
# ========================

@router.post("/admin/{drill_id}/decision", response_model=DrillOut)
def admin_decide(
    drill_id: int,
    decision: DrillDecision,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    action = decision.action.lower().strip()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")

    if action == "approve":
        drill.status = "approved"
        drill.rejection_reason = None
    else:
        drill.status = "rejected"
        drill.rejection_reason = decision.rejection_reason

    drill.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(drill)
    return drill


# ========================
# Admin update / delete
# ========================

@router.patch("/{drill_id}", response_model=DrillOut)
def admin_update_drill(
    drill_id: int,
    payload: DrillUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(drill, k, v)

    drill.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(drill)
    return drill


@router.delete("/{drill_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_drill(
    drill_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    db.delete(drill)
    db.commit()
    return None


# ========================
# Drill details
# ========================

@router.get("/{drill_id}", response_model=DrillOut)
def get_drill(drill_id: int, db: Session = Depends(get_db)):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    return drill
