from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Drill, Training, TrainingAssignment, User, UserRole

router = APIRouter()

ASSIGNMENT_STATUSES = {"new", "in_progress", "done"}


def _ensure_head(user: User):
    if user.role != UserRole.club_head_coach:
        raise HTTPException(status_code=403, detail="Only club head coach can assign trainings")
    if not user.club_id:
        raise HTTPException(status_code=422, detail="Head coach is not assigned to a club")


def _collect_plan_ids(plan: dict) -> set[int]:
    ids: set[int] = set()
    if not isinstance(plan, dict):
        return ids
    for arr in plan.values():
        if not arr:
            continue
        for x in arr:
            try:
                ids.add(int(x))
            except Exception:
                pass
    return ids


@router.post("/club/training-assignments")
def assign_training(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(current_user)
    training_id = int(payload.get("training_id") or 0)
    assignees = payload.get("assignee_ids") or []
    if not training_id:
        raise HTTPException(status_code=422, detail="training_id is required")
    if not isinstance(assignees, list) or not assignees:
        raise HTTPException(status_code=422, detail="assignee_ids is required")

    training = (
        db.query(Training)
        .filter(Training.id == training_id, Training.club_id == current_user.club_id)
        .first()
    )
    if not training:
        raise HTTPException(status_code=404, detail="Training not found in your club")

    assignee_ids = sorted(set(int(x) for x in assignees if x))
    coaches = (
        db.query(User)
        .filter(
            User.id.in_(assignee_ids),
            User.club_id == current_user.club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .all()
    )
    if len(coaches) != len(assignee_ids):
        raise HTTPException(status_code=422, detail="One or more assignees are invalid")

    note = (payload.get("note") or "").strip() or None
    due_date = (payload.get("due_date") or "").strip() or None
    created = 0
    for coach_id in assignee_ids:
        item = (
            db.query(TrainingAssignment)
            .filter(TrainingAssignment.training_id == training.id, TrainingAssignment.assigned_to == coach_id)
            .first()
        )
        if item:
            item.note = note
            item.due_date = due_date
            item.status = "new"
        else:
            db.add(
                TrainingAssignment(
                    training_id=training.id,
                    assigned_by=current_user.id,
                    assigned_to=coach_id,
                    status="new",
                    note=note,
                    due_date=due_date,
                )
            )
            created += 1
    db.commit()
    return {"ok": True, "created": created}


@router.get("/club/training-assignments")
def list_club_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(current_user)
    rows = (
        db.query(TrainingAssignment, Training.title, User.name)
        .join(Training, Training.id == TrainingAssignment.training_id)
        .join(User, User.id == TrainingAssignment.assigned_to)
        .filter(Training.club_id == current_user.club_id)
        .order_by(TrainingAssignment.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "training_id": a.training_id,
            "training_title": title,
            "assigned_to": a.assigned_to,
            "assigned_to_name": assignee_name,
            "assigned_by": a.assigned_by,
            "status": a.status,
            "note": a.note,
            "due_date": a.due_date,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a, title, assignee_name in rows
    ]


@router.get("/trainings/assignments/my")
def my_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    rows = (
        db.query(TrainingAssignment, Training.title, User.name)
        .join(Training, Training.id == TrainingAssignment.training_id)
        .join(User, User.id == TrainingAssignment.assigned_by)
        .filter(TrainingAssignment.assigned_to == current_user.id)
        .order_by(TrainingAssignment.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "training_id": a.training_id,
            "training_title": title,
            "assigned_by": a.assigned_by,
            "assigned_by_name": assigner_name,
            "status": a.status,
            "note": a.note,
            "due_date": a.due_date,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a, title, assigner_name in rows
    ]


@router.patch("/trainings/assignments/{assignment_id}")
def update_assignment_status(
    assignment_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    item = (
        db.query(TrainingAssignment)
        .filter(TrainingAssignment.id == assignment_id, TrainingAssignment.assigned_to == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Assignment not found")
    status = str(payload.get("status") or "").strip().lower()
    if status not in ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid assignment status")
    item.status = status
    db.commit()
    db.refresh(item)
    return item


@router.get("/trainings/assignments/{assignment_id}/details")
def assigned_training_details(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    assignment = (
        db.query(TrainingAssignment)
        .filter(TrainingAssignment.id == assignment_id, TrainingAssignment.assigned_to == current_user.id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    training = db.query(Training).filter(Training.id == assignment.training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    plan = training.plan or {}
    drill_ids = _collect_plan_ids(plan)
    drills_map = {}
    if drill_ids:
        drills = db.query(Drill).filter(Drill.id.in_(list(drill_ids))).all()
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
        "assignment_id": assignment.id,
        "assignment_status": assignment.status,
        "assignment_due_date": assignment.due_date,
    }
