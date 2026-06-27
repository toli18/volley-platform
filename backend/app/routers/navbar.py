"""Агрегиран navbar feed.

Един endpoint, който обединява заявките, които navbar-ът досега правеше поотделно
(forum нотификации, мои задачи, активност по такси/задачи за главен треньор).
Преизползва съществуващите handler функции, за да са идентични формите на отговора
и да няма дублирана логика. Целта е да свали 4 паралелни polling заявки до 1 —
ключово за намаляване на товара върху connection pool-а при много едновременни треньори.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import User, UserRole

from app.routers.forum import get_forum_notifications
from app.routers.training_assignments import club_assignment_activity, my_assignments
from app.routers.national_method import coach_my_method_assignments
from app.routers.fees import recent_fee_payment_activity

router = APIRouter()
logger = logging.getLogger(__name__)


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


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

    # Всяка част е защитена поотделно: ако някоя заявка гръмне, връщаме празна
    # стойност вместо да проваляме целия feed (същото поведение като старите
    # отделни polling-и, които при грешка просто оставяха съответната секция празна).
    try:
        forum = get_forum_notifications(limit=8, db=db, current_user=current_user)
    except Exception:  # noqa: BLE001
        logger.exception("navbar_feed: forum notifications failed")
        forum = {"items": [], "unread_count": 0}

    tasks_training: list = []
    tasks_method: list = []
    if is_coach_like:
        try:
            tasks_training = my_assignments(db=db, current_user=current_user)
        except Exception:  # noqa: BLE001
            logger.exception("navbar_feed: my training assignments failed")
            tasks_training = []
        try:
            tasks_method = coach_my_method_assignments(db=db, user=current_user)
        except Exception:  # noqa: BLE001
            logger.exception("navbar_feed: my method assignments failed")
            tasks_method = []

    fee_activity = {"items": [], "unread_hint": 0}
    task_reports = {"items": []}
    if is_head:
        try:
            fee_activity = recent_fee_payment_activity(limit=12, db=db, current_user=current_user)
        except Exception:  # noqa: BLE001
            logger.exception("navbar_feed: fee activity failed")
            fee_activity = {"items": [], "unread_hint": 0}
        try:
            task_reports = club_assignment_activity(
                limit=24,
                assigned_to=None,
                updated_from=None,
                updated_to=None,
                db=db,
                current_user=current_user,
            )
        except Exception:  # noqa: BLE001
            logger.exception("navbar_feed: club assignment activity failed")
            task_reports = {"items": []}

    return {
        "forum": forum,
        "tasks_training": tasks_training,
        "tasks_method": tasks_method,
        "fee_activity": fee_activity,
        "task_reports": task_reports,
    }
