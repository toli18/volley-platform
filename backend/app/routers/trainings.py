# backend/app/routers/trainings.py
from typing import List, Dict, Set

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.roles import require_role
from ..models import Training, UserRole, User, Drill
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


def _collect_plan_ids(plan: Dict[str, List[int]]) -> Set[int]:
    ids: Set[int] = set()
    if not plan:
        return ids
    for _, arr in plan.items():
        if not arr:
            continue
        for x in arr:
            try:
                ids.add(int(x))
            except Exception:
                pass
    return ids


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
    _ensure_owner(training, current_user)
    return training


@router.get("/{training_id}/details", response_model=TrainingReadDetailed)
def get_training_details(
    training_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    _ensure_owner(training, current_user)

    plan = training.plan or {}
    ids = _collect_plan_ids(plan)

    drills_map = {}
    if ids:
        drills = db.query(Drill).filter(Drill.id.in_(list(ids))).all()
        for d in drills:
            drills_map[int(d.id)] = d

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
