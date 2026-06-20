# backend/app/services/training_generation.py
"""Обща логика за генериране на тренировка.

Изнесена от routers/ai_training.py, за да може да се преизползва и от
assessment_generator_bridge.py (диагноза → предписание), без дублиране на
pipeline-а. Не записва нищо в базата — само генерира.
"""
from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..models import Training, User
from ..national_method.bvf_ai_knowledge import (
    attach_text_drills,
    build_training_plan_text,
    enrich_request,
)
from ..national_method.content_policy import query_drills_for_ai
from .bulgarian_training_generator import generate_training_session


def recent_drill_ids_for_user(db: Session, user: User, limit_sessions: int = 3) -> List[List[int]]:
    """Последно ползваните drill id-та по сесии за треньора (за разнообразие)."""
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


def run_generation(payload: Dict[str, Any], user: User, db: Session) -> Dict[str, Any]:
    """Изпълнява пълния pipeline за генериране на тренировка.

    Връща `{"result": <генерираната сесия + текст/преглед>, "request_data": <обогатената заявка>}`.
    `result` е същата структура, която връща `POST /api/ai/training/generate`.
    """
    request_data = enrich_request(payload, db)
    recent_by_session = recent_drill_ids_for_user(db, user, limit_sessions=3)
    request_data["recentDrillIdsBySession"] = recent_by_session
    request_data["recentDrillIds"] = [did for bucket in recent_by_session for did in bucket]
    drills = query_drills_for_ai(db)
    result = generate_training_session(drills, request_data)
    session = result.get("session") or {}
    attach_text_drills(session, request_data)
    result["trainingPlanText"] = build_training_plan_text(session, request_data)
    result["bvfMethod"] = request_data.get("bvfKnowledge")
    result["sessionReview"] = (request_data.get("bvfKnowledge") or {}).get("sessionReview")
    return {"result": result, "request_data": request_data}
