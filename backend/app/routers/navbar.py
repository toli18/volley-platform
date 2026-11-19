"""Агрегиран navbar feed.

Един endpoint, който обединява заявките, които navbar-ът досега правеше поотделно
(forum нотификации, мои задачи, активност по такси/задачи за главен треньор).
Преизползва съществуващите handler функции, за да са идентични формите на отговора
и да няма дублирана логика. Целта е да свали 4 паралелни polling заявки до 1 —
ключово за намаляване на товара върху connection pool-а при много едновременни треньори.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, TypeVar

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import User, UserRole

from app.routers.forum import get_forum_notifications
from app.routers.training_assignments import club_assignment_activity, my_assignments
from app.routers.national_method import coach_my_method_assignments
from app.routers.pilot_requests import list_pilot_requests_for_admin

router = APIRouter()
logger = logging.getLogger(__name__)

T = TypeVar("T")


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _recover_session(db: Session) -> None:
    """Postgres aborts the whole txn after any error; clear it before the next section."""
    try:
        db.rollback()
    except Exception:  # noqa: BLE001
        logger.exception("navbar_feed: session rollback failed")


def _safe_section(db: Session, label: str, fn: Callable[[], T], fallback: T) -> T:
    try:
        return fn()
    except Exception:  # noqa: BLE001
        logger.exception("navbar_feed: %s failed", label)
        _recover_session(db)
        return fallback


@router.get("/navbar/feed")
def navbar_feed(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.federation_admin,
            UserRole.platform_admin,
        )
    ),
):
    role = _role_value(current_user)
    is_coach_like = role in (UserRole.coach.value, UserRole.club_head_coach.value)
    is_head = role == UserRole.club_head_coach.value
    is_platform_admin = role == UserRole.platform_admin.value

    # Всяка част е защитена поотделно + rollback: ако някоя SQL гръмне, Postgres
    # абортира транзакцията и без rollback следващите секции падат с
    # InFailedSqlTransaction (дори SELECT-ите).
    forum = _safe_section(
        db,
        "forum notifications",
        lambda: get_forum_notifications(limit=8, db=db, current_user=current_user),
        {"items": [], "unread_count": 0},
    )

    tasks_training: list[Any] = []
    tasks_method: list[Any] = []
    if is_coach_like:
        tasks_training = _safe_section(
            db,
            "my training assignments",
            lambda: my_assignments(db=db, current_user=current_user),
            [],
        )
        tasks_method = _safe_section(
            db,
            "my method assignments",
            lambda: coach_my_method_assignments(db=db, user=current_user),
            [],
        )

    fee_activity: dict[str, Any] = {"items": [], "unread_hint": 0}
    task_reports: dict[str, Any] = {"items": []}
    if is_head:
        def _fee() -> dict[str, Any]:
            from app.routers.fees import recent_fee_payment_activity

            return recent_fee_payment_activity(limit=12, db=db, current_user=current_user)

        fee_activity = _safe_section(db, "fee activity", _fee, {"items": [], "unread_hint": 0})
        task_reports = _safe_section(
            db,
            "club assignment activity",
            lambda: club_assignment_activity(
                limit=24,
                assigned_to=None,
                updated_from=None,
                updated_to=None,
                db=db,
                current_user=current_user,
            ),
            {"items": []},
        )

    sek_tasks: dict[str, Any] = {"items": []}
    if is_coach_like:
        def _sek() -> dict[str, Any]:
            from app.services.sek_athlete_readiness import list_sek_tasks_for_coach

            return {"items": list_sek_tasks_for_coach(db, current_user.id, limit=24)}

        sek_tasks = _safe_section(db, "sek tasks", _sek, {"items": []})

    enrollments: dict[str, Any] = {"items": []}
    if is_coach_like and getattr(current_user, "club_id", None):
        def _enrollments() -> dict[str, Any]:
            from app.models import ClubEnrollmentRequest, ClubEnrollmentStatus

            rows = (
                db.query(ClubEnrollmentRequest)
                .filter(
                    ClubEnrollmentRequest.club_id == int(current_user.club_id),
                    ClubEnrollmentRequest.status.in_(
                        [
                            ClubEnrollmentStatus.new.value,
                            ClubEnrollmentStatus.trial_scheduled.value,
                        ]
                    ),
                )
                .order_by(ClubEnrollmentRequest.created_at.desc())
                .limit(12)
                .all()
            )
            return {
                "items": [
                    {
                        "id": int(r.id),
                        "child_name": " ".join(
                            p for p in [r.child_first_name, r.child_last_name or ""] if p
                        ).strip(),
                        "parent_name": r.parent_name,
                        "parent_phone": r.parent_phone,
                        "status": r.status,
                        "trial_date": r.trial_date,
                        "trial_time": r.trial_time,
                        "created_at": r.created_at.isoformat() if r.created_at else None,
                    }
                    for r in rows
                ]
            }

        enrollments = _safe_section(db, "enrollments", _enrollments, {"items": []})

    carding_requests: dict[str, Any] = {"items": [], "ready_count": 0}
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val in ("club_head_coach", "platform_admin", "federation_admin") and getattr(current_user, "club_id", None):
        def _carding() -> dict[str, Any]:
            from app.services.bvf_season_carding import list_ready_for_head

            items = list_ready_for_head(db, int(current_user.club_id), limit=24)
            return {"items": items, "ready_count": len(items)}

        carding_requests = _safe_section(
            db,
            "carding requests",
            _carding,
            {"items": [], "ready_count": 0},
        )

    pilot_requests: dict[str, Any] = {"items": [], "unread_count": 0}
    if is_platform_admin:
        pilot_requests = _safe_section(
            db,
            "pilot requests",
            lambda: list_pilot_requests_for_admin(db, limit=12),
            {"items": [], "unread_count": 0},
        )

    return {
        "forum": forum,
        "tasks_training": tasks_training,
        "tasks_method": tasks_method,
        "fee_activity": fee_activity,
        "task_reports": task_reports,
        "sek_tasks": sek_tasks,
        "enrollments": enrollments,
        "carding_requests": carding_requests,
        "pilot_requests": pilot_requests,
    }
