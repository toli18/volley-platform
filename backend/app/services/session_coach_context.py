"""Контекст за live AI помощник върху конкретна записана тренировка."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Training, User, UserRole


def _role_value(user: User) -> str:
    role = getattr(user, "role", None)
    return role.value if hasattr(role, "value") else str(role or "")


def _can_access_training(user: User, training: Training) -> bool:
    role = _role_value(user)
    if role in {UserRole.platform_admin.value, UserRole.federation_admin.value}:
        return True
    if training.coach_id and int(training.coach_id) == int(user.id):
        return True
    if user.club_id and training.club_id and int(user.club_id) == int(training.club_id):
        if role in {UserRole.club_head_coach.value, UserRole.coach.value}:
            return True
    return False


def _summarize_plan(plan: dict[str, Any] | None, gen_req: dict[str, Any] | None) -> list[str]:
    lines: list[str] = []
    gen_req = gen_req or {}
    blocks = gen_req.get("sessionBlocks") or []
    if isinstance(blocks, list) and blocks:
        for b in blocks[:8]:
            if not isinstance(b, dict):
                continue
            btype = b.get("blockType") or "?"
            drills = b.get("drills") or []
            texts = b.get("textDrills") or []
            names = []
            for d in drills[:4]:
                if isinstance(d, dict):
                    names.append(str(d.get("name") or d.get("title") or f"#{d.get('drillId')}"))
            for td in texts[:3]:
                if isinstance(td, dict):
                    names.append(str(td.get("title") or "текстово упр."))
            if names:
                lines.append(f"{btype}: " + "; ".join(names))
            else:
                lines.append(f"{btype}: (без изброени упражнения)")
        return lines

    plan = plan or {}
    for key, items in plan.items():
        if not isinstance(items, list) or not items:
            continue
        bits = []
        for it in items[:4]:
            if isinstance(it, dict):
                bits.append(str(it.get("name") or it.get("title") or f"drill#{it.get('drillId')}"))
        if bits:
            lines.append(f"{key}: " + "; ".join(bits))
    return lines


def load_training_session_pack(
    db: Session, user: User, training_id: int
) -> Optional[dict[str, Any]]:
    """Зарежда кратък пакет за live чат върху тренировка #id."""
    training = db.query(Training).filter(Training.id == int(training_id)).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")
    if not _can_access_training(user, training):
        raise HTTPException(status_code=403, detail="No access to this training")

    gen_req = training.generation_request if isinstance(training.generation_request, dict) else {}
    plan = training.plan if isinstance(training.plan, dict) else {}
    summary_lines = _summarize_plan(plan, gen_req)
    focus = gen_req.get("mainFocus") or (gen_req.get("focusSkills") or [None])[0]
    secondary = gen_req.get("secondaryFocus")
    text_drills = gen_req.get("savedTextDrills") or []

    prompt_lines = [
        "=== LIVE РЕЖИМ: ТРЕНЬОРЪТ Е НА ТРЕНИРОВКА / ПРЕГЛЕЖДА КОНКРЕТЕН ПЛАН ===",
        f"Тренировка #{training.id}: {training.title}",
        f"Дата: {training.session_date or '—'} | група/team_id: {training.team_id or '—'}",
        f"Фокус: {focus or '—'} | вторичен: {secondary or '—'}",
        "План (кратко):",
    ]
    prompt_lines.extend(f"- {ln}" for ln in (summary_lines or ["(празен план)"]))
    if text_drills:
        prompt_lines.append("Текстови/помощник упражнения:")
        for td in text_drills[:8]:
            if not isinstance(td, dict):
                continue
            prompt_lines.append(
                f"- [{td.get('blockType') or '?'}] {td.get('title')}: {td.get('instructions') or ''}"
            )
    prompt_lines.extend(
        [
            "ПРАВИЛА ЗА ТОЗИ РЕЖИМ:",
            "- Отговаряй конкретно за ТОЗИ план (упражнения, cues, адаптации, организация).",
            "- При трудност: опростяване, прогресия, алтернатива, какво да каже треньорът на терена.",
            "- НЕ генерирай цяла нова тренировка, освен ако изрично поиска „нова тренировка“.",
            "- Не пиши „Действие: генерирай_тренировка“, освен при изрична молба за нов план.",
            "=== КРАЙ LIVE ПЛАН ===",
        ]
    )

    return {
        "trainingId": training.id,
        "title": training.title,
        "teamId": training.team_id,
        "sessionDate": training.session_date,
        "mainFocus": focus,
        "secondaryFocus": secondary,
        "planSummary": summary_lines,
        "promptText": "\n".join(prompt_lines),
        "mode": "session_live",
    }
