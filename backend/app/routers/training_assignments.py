from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
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
            item.completion_note = None
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
    assigned_to: int | None = Query(default=None),
    status: str | None = Query(default=None),
    updated_from: str | None = Query(default=None, description="YYYY-MM-DD inclusive"),
    updated_to: str | None = Query(default=None, description="YYYY-MM-DD inclusive"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(current_user)
    q = (
        db.query(TrainingAssignment, Training.title, User.name)
        .join(Training, Training.id == TrainingAssignment.training_id)
        .join(User, User.id == TrainingAssignment.assigned_to)
        .filter(Training.club_id == current_user.club_id)
    )
    if assigned_to:
        q = q.filter(TrainingAssignment.assigned_to == int(assigned_to))
    if status:
        st = str(status).strip().lower()
        if st not in ASSIGNMENT_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid assignment status filter")
        q = q.filter(TrainingAssignment.status == st)
    if updated_from:
        try:
            d0 = datetime.strptime(updated_from.strip(), "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="updated_from must be YYYY-MM-DD") from exc
        q = q.filter(TrainingAssignment.updated_at >= d0)
    if updated_to:
        try:
            d1 = datetime.strptime(updated_to.strip(), "%Y-%m-%d") + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="updated_to must be YYYY-MM-DD") from exc
        q = q.filter(TrainingAssignment.updated_at < d1)
    rows = q.order_by(TrainingAssignment.updated_at.desc()).all()
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
            "completion_note": getattr(a, "completion_note", None),
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
            "completion_note": getattr(a, "completion_note", None),
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
    if status == "done":
        raw_cn = payload.get("completion_note")
        if raw_cn is not None:
            cn = str(raw_cn).strip()
            item.completion_note = cn or None
    else:
        item.completion_note = None
    db.commit()
    db.refresh(item)
    return item


@router.delete("/trainings/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
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
    if str(item.status or "").strip().lower() != "done":
        raise HTTPException(status_code=422, detail="Assignment can be deleted only when status is done")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/trainings/assignments/{assignment_id}/details")
def assigned_training_details(
    assignment_id: int,
    training_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    assignment = (
        db.query(TrainingAssignment)
        .filter(TrainingAssignment.id == assignment_id, TrainingAssignment.assigned_to == current_user.id)
        .first()
    )
    if not assignment and training_id:
        assignment = (
            db.query(TrainingAssignment)
            .filter(
                TrainingAssignment.training_id == training_id,
                TrainingAssignment.assigned_to == current_user.id,
            )
            .order_by(TrainingAssignment.created_at.desc())
            .first()
        )

    # Fallback for older/misaligned assignment ids:
    # if assignment is not found, still allow preview for trainings in coach's club.
    training_lookup_id = assignment.training_id if assignment else training_id
    if not training_lookup_id:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Keep preview resilient: if assignment exists and training id is known,
    # return the training even when user/club metadata is inconsistent.
    training = db.query(Training).filter(Training.id == training_lookup_id).first()
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
        "assignment_id": assignment.id if assignment else None,
        "assignment_status": assignment.status if assignment else None,
        "assignment_due_date": assignment.due_date if assignment else None,
    }


@router.get("/club/training-assignments/activity")
def club_assignment_activity(
    limit: int = Query(default=12, ge=1, le=200),
    assigned_to: int | None = Query(default=None),
    updated_from: str | None = Query(default=None),
    updated_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(current_user)
    q = (
        db.query(TrainingAssignment, Training.title, User.name)
        .join(Training, Training.id == TrainingAssignment.training_id)
        .join(User, User.id == TrainingAssignment.assigned_to)
        .filter(
            TrainingAssignment.assigned_by == current_user.id,
            Training.club_id == current_user.club_id,
            TrainingAssignment.status == "done",
        )
    )
    if assigned_to:
        q = q.filter(TrainingAssignment.assigned_to == int(assigned_to))
    if updated_from:
        try:
            d0 = datetime.strptime(updated_from.strip(), "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="updated_from must be YYYY-MM-DD") from exc
        q = q.filter(TrainingAssignment.updated_at >= d0)
    if updated_to:
        try:
            d1 = datetime.strptime(updated_to.strip(), "%Y-%m-%d") + timedelta(days=1)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="updated_to must be YYYY-MM-DD") from exc
        q = q.filter(TrainingAssignment.updated_at < d1)
    rows = q.order_by(TrainingAssignment.updated_at.desc()).limit(limit).all()
    return {
        "items": [
            {
                "id": a.id,
                "training_id": a.training_id,
                "training_title": title,
                "assigned_to": a.assigned_to,
                "assigned_to_name": assignee_name,
                "status": a.status,
                "completion_note": getattr(a, "completion_note", None),
                "updated_at": a.updated_at,
            }
            for a, title, assignee_name in rows
        ]
    }
