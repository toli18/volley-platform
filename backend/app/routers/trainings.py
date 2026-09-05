# backend/app/routers/trainings.py
from typing import List, Dict, Set

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Training, TrainingAssignment, UserRole, User, Drill
from ..national_method.bvf_ai_knowledge import method_context_from_stored_request
from ..schemas.training import (
    TrainingCreate,
    TrainingRead,
    TrainingUpdate,
    TrainingReadDetailed,
)

router = APIRouter(tags=["Trainings"])


def _ensure_owner(training: Training, current_user: User):
    if not training or training.coach_id != current_user.id:
        raise HTTPException(status_code=404, detail="Training not found")


def _ensure_view_access(db: Session, training: Training, current_user: User):
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    # Owner always has access.
    if training.coach_id == current_user.id:
        return

    # Coaches from the same club can preview club trainings.
    if training.club_id and current_user.club_id and training.club_id == current_user.club_id:
        return

    # Assigned coach can preview details of the training task.
    assigned = (
        db.query(TrainingAssignment)
        .filter(
            TrainingAssignment.training_id == training.id,
            TrainingAssignment.assigned_to == current_user.id,
        )
        .first()
    )
    if assigned:
        return

    raise HTTPException(status_code=404, detail="Training not found")


from ..training_plan_utils import normalize_plan, plan_drill_ids


def _collect_plan_ids(plan) -> Set[int]:
    return plan_drill_ids(plan)


@router.post("/", response_model=TrainingRead, status_code=status.HTTP_201_CREATED)
def create_training(
    training: TrainingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    club_id = training.club_id if training.club_id is not None else current_user.club_id

    db_training = Training(
        title=training.title.strip(),
        coach_id=current_user.id,
        club_id=club_id,
        source=training.source,
        status=training.status,
        plan=training.plan or {},
        notes=training.notes,
    )

    db.add(db_training)
    db.commit()
    db.refresh(db_training)
    return db_training


@router.get("/my", response_model=List[TrainingRead])
def get_my_trainings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    trainings = (
        db.query(Training)
        .filter(Training.coach_id == current_user.id)
        .order_by(Training.created_at.desc())
        .all()
    )
    return trainings


@router.get("/{training_id}", response_model=TrainingRead)
def get_training(
    training_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")
    return training


@router.get("/{training_id}/details", response_model=TrainingReadDetailed)
def get_training_details(
    training_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    plan = normalize_plan(training.plan or {})
    ids = _collect_plan_ids(plan)

    drills_map = {}
    if ids:
        drills = db.query(Drill).filter(Drill.id.in_(list(ids))).all()
        for d in drills:
            drills_map[int(d.id)] = d

    method_ctx = method_context_from_stored_request(training.generation_request, db)
    gen_req = training.generation_request if isinstance(training.generation_request, dict) else {}

    return {
        "id": training.id,
        "title": training.title,
        "club_id": training.club_id,
        "source": training.source,
        "status": training.status,
        "plan": plan,
        "notes": training.notes,
        "coach_id": training.coach_id,
        "created_at": training.created_at,
        "updated_at": training.updated_at,
        "drills": drills_map,
        "sessionReview": method_ctx.get("sessionReview"),
        "trainingPlanText": method_ctx.get("trainingPlanText"),
        "savedTextDrills": gen_req.get("savedTextDrills") or [],
        "team_id": training.team_id,
        "session_date": training.session_date,
    }


@router.patch("/{training_id}", response_model=TrainingRead)
def update_training(
    training_id: int,
    payload: TrainingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    _ensure_owner(training, current_user)

    data = payload.model_dump(exclude_unset=True)

    if "title" in data and (data["title"] is None or not str(data["title"]).strip()):
        raise HTTPException(status_code=422, detail="Title is required")

    for k, v in data.items():
        setattr(training, k, v)

    db.commit()
    db.refresh(training)
    return training


@router.delete("/{training_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_training(
    training_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    _ensure_owner(training, current_user)

    db.delete(training)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
