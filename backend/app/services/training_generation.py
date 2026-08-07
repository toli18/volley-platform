# backend/app/services/training_generation.py
"""Обща логика за генериране на тренировка.

Изнесена от routers/ai_training.py, за да може да се преизползва и от
assessment_generator_bridge.py (диагноза → предписание), без дублиране на
pipeline-а. Не записва нищо в базата — само генерира.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

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


def persist_generated_training(
    db: Session,
    user: User,
    generation: Dict[str, Any],
    *,
    title: Optional[str] = None,
    team_id: Optional[int] = None,
    session_date: Optional[str] = None,
    status: str = "запазена",
    notes: Optional[str] = None,
    extra_request_fields: Optional[Dict[str, Any]] = None,
) -> Training:
    """Записва вече генерирана тренировка в `trainings` (отбор+дата по желание)."""
    from ..models import TrainingSource, TrainingStatus
    from .bulgarian_training_generator import BLOCK_TO_PLAN_KEY

    generated = generation["result"]
    request_data = dict(generation.get("request_data") or {})
    if extra_request_fields:
        request_data.update(extra_request_fields)

    session = generated.get("session") or {}
    blocks = session.get("blocks") or []
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
    period = request_data.get("periodPhase") or "inseason"
    resolved_title = (title or "").strip() or f"AI Training ({period})"

    status_input = (status or "чернова").strip().lower()
    training_status = TrainingStatus.saved if status_input in {"saved", "запазена"} else TrainingStatus.draft

    request_data["sessionReview"] = generated.get("sessionReview")
    request_data["trainingPlanText"] = generated.get("trainingPlanText")

    training = Training(
        title=resolved_title,
        coach_id=user.id,
        club_id=user.club_id,
        team_id=team_id,
        session_date=(session_date or "").strip() or None,
        source=TrainingSource.generator,
        status=training_status,
        plan=plan,
        notes=notes or "Generated by hybrid-v1",
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
    return training

