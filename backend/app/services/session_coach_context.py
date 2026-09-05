"""Контекст за live AI помощник върху конкретна записана тренировка."""

from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Drill, Training, User, UserRole


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


def _clip(text: Any, n: int = 280) -> str:
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(s) <= n:
        return s
    return s[: n - 1].rstrip() + "…"


def _collect_plan_drill_ids(
    plan: dict[str, Any] | None, gen_req: dict[str, Any] | None
) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()

    def add(raw: Any) -> None:
        try:
            did = int(raw)
        except (TypeError, ValueError):
            return
        if did in seen:
            return
        seen.add(did)
        ids.append(did)

    gen_req = gen_req or {}
    blocks = gen_req.get("sessionBlocks") or []
    if isinstance(blocks, list):
        for b in blocks:
            if not isinstance(b, dict):
                continue
            for d in b.get("drills") or []:
                if isinstance(d, dict):
                    add(d.get("drillId") or d.get("id"))
                else:
                    add(d)

    plan = plan or {}
    for items in plan.values():
        if not isinstance(items, list):
            continue
        for it in items:
            if isinstance(it, dict):
                add(it.get("drillId") or it.get("id"))
            else:
                add(it)
    return ids[:40]


def _drill_card(d: Drill) -> dict[str, Any]:
    return {
        "id": d.id,
        "title": d.title,
        "description": _clip(d.description, 320),
        "instructions": _clip(d.instructions or d.setup, 240),
        "coachingPoints": _clip(d.coaching_points, 240),
        "commonMistakes": _clip(d.common_mistakes, 200),
        "progressions": _clip(d.progressions, 200),
        "category": d.category,
        "skillFocus": d.skill_focus or d.goal,
    }


def _summarize_plan(
    plan: dict[str, Any] | None,
    gen_req: dict[str, Any] | None,
    drill_by_id: dict[int, dict[str, Any]],
) -> list[str]:
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
            for d in drills[:6]:
                if isinstance(d, dict):
                    did = d.get("drillId") or d.get("id")
                    try:
                        card = drill_by_id.get(int(did)) if did is not None else None
                    except (TypeError, ValueError):
                        card = None
                    names.append(
                        str(
                            d.get("name")
                            or d.get("title")
                            or (card or {}).get("title")
                            or f"#{did}"
                        )
                    )
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
        for it in items[:6]:
            if isinstance(it, dict):
                did = it.get("drillId") or it.get("id")
                try:
                    card = drill_by_id.get(int(did)) if did is not None else None
                except (TypeError, ValueError):
                    card = None
                bits.append(
                    str(
                        it.get("name")
                        or it.get("title")
                        or (card or {}).get("title")
                        or f"drill#{did}"
                    )
                )
            else:
                try:
                    card = drill_by_id.get(int(it))
                    bits.append(str((card or {}).get("title") or f"drill#{it}"))
                except (TypeError, ValueError):
                    bits.append(str(it))
        if bits:
            lines.append(f"{key}: " + "; ".join(bits))
    return lines


# Tokens that must never drive drill title search alone
_DRILL_MATCH_STOP = {
    "какво",
    "какъв",
    "направе",
    "направи",
    "подобр",
    "силата",
    "сила",
    "дадам",
    "кажи",
    "трябва",
    "могат",
    "играчи",
    "терен",
    "сега",
    "това",
    "упражнение",
    "упражнения",
    "разбират",
    "разбирам",
    "стъпка",
    "стъпки",
    "заход",
    "разбег",
    "атака",
    "удар",
    "удара",
    "четири",
    "три",
    "две",
    "една",
    "колко",
    "откъде",
    "трябва",
    "може",
    "взема",
    "детето",
    "кажа",
    "точно",
    "подаване",
    "поле",
    "полето",
    "смяна",
    "степен",
    "блок",
    "зони",
    "зона",
}


def _normalize_chat_blob(text: str) -> str:
    blob = str(text or "").lower()
    return re.sub(r"[^\wа-яА-ЯёЁ\s\-]+", " ", blob, flags=re.UNICODE)


def is_technique_priority_message(message: str) -> bool:
    """Технически въпрос — не го замествай с произволно упражнение от базата."""
    low = _normalize_chat_blob(message)
    if any(
        k in low
        for k in (
            "заход",
            "разбег",
            "стъпк",
            "approach",
            "обратн",
            "от къде",
            "откъде",
            "взема сила",
            "сила на удар",
            "силата на удар",
            "сила удара",
            "мощност",
            "как да кажа",
            "какво да кажа",
            "какво точно да кажа",
            "на детето",
            "cue",
            "кацане",
            "ротац",
            "тайминг",
        )
    ):
        return True
    # „сила“ без ясно име на упражнение
    if "сил" in low and not any(k in low for k in ("пеперуд", "тръбн", "pipe", "упражнен")):
        return True
    return False


def match_drills_for_message(
    db: Session,
    message: str,
    *,
    history: Optional[list[dict[str, str]]] = None,
    prefer_ids: Optional[list[int]] = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Намира упражнения само при СИЛНО съвпадение с име (не по общи думи)."""
    current = _normalize_chat_blob(message)
    if not current.strip():
        return []

    # Технически въпрос без ясно име → без drill hijack
    if is_technique_priority_message(message):
        # Разреши match само ако цяло заглавие е в текущото съобщение
        prefer = [int(x) for x in (prefer_ids or []) if x is not None]
        pool: list[Drill] = []
        if prefer:
            pool = db.query(Drill).filter(Drill.id.in_(prefer)).all()
        strong = []
        for d in pool:
            title = str(d.title or "").lower().strip()
            if title and len(title) >= 6 and title in current:
                strong.append(_drill_card(d))
        if strong:
            return strong[:limit]
        # Глобално: само пълно заглавие в съобщението (редки случаи)
        rows = db.query(Drill).filter(Drill.title.ilike(f"%{current.strip()[:40]}%")).limit(5).all()
        out = []
        for d in rows:
            title = str(d.title or "").lower().strip()
            if title and title in current:
                out.append(_drill_card(d))
        return out[:limit]

    # История: само ако текущото е follow-up („не разбират“, „опрости“)
    followup = any(
        k in current
        for k in ("разбира", "опрости", "не върви", "не се получ", "това упражнен", "него")
    )
    hist_parts = []
    if followup:
        for turn in (history or [])[-4:]:
            if str(turn.get("role") or "") == "user":
                hist_parts.append(str(turn.get("content") or ""))
    search_blob = _normalize_chat_blob(" ".join([message] + hist_parts))
    tokens = [
        t
        for t in re.split(r"\s+", search_blob)
        if len(t) >= 5 and t not in _DRILL_MATCH_STOP
    ]
    if not tokens and len(current.strip()) < 5:
        return []

    prefer = set(int(x) for x in (prefer_ids or []) if x is not None)
    pool: list[Drill] = []
    if prefer:
        pool = db.query(Drill).filter(Drill.id.in_(list(prefer))).all()

    scored: list[tuple[int, Drill]] = []

    def score_drill(d: Drill, blob: str) -> int:
        title = str(d.title or "").lower().strip()
        if not title:
            return 0
        score = 0
        if title in blob:
            score += 100
        title_tokens = [
            t
            for t in re.split(r"\s+", title)
            if len(t) >= 5 and t not in _DRILL_MATCH_STOP
        ]
        if not title_tokens and title in blob:
            return score
        hits = sum(1 for t in title_tokens if t in blob)
        if hits and title_tokens and hits == len(title_tokens):
            score += 80
        elif hits >= 2:
            score += 50
        elif hits == 1 and len(title_tokens) == 1 and len(title_tokens[0]) >= 6:
            score += 45
        return score

    for d in pool:
        sc = score_drill(d, search_blob)
        if sc >= 45:
            scored.append((sc, d))

    # Глобално търсене само с отличителни токени (≥6) и висок праг
    distinctive = [t for t in tokens if len(t) >= 6][:3]
    looks_like_name = (
        len(current.split()) <= 5
        or any(k in current for k in ("упражнен", "разбира", "опрости", "какво е", "как се прави"))
    )
    if distinctive and looks_like_name:
        for tok in distinctive:
            rows = (
                db.query(Drill)
                .filter(Drill.title.ilike(f"%{tok}%"))
                .limit(6)
                .all()
            )
            for d in rows:
                sc = score_drill(d, search_blob)
                # single-token global needs the token to be a major part of title
                title = str(d.title or "").lower()
                if tok in title and sc < 45:
                    sc = 45 if len(tok) >= 7 else 0
                if sc >= 45:
                    scored.append((sc, d))

    best: dict[int, tuple[int, Drill]] = {}
    for score, d in scored:
        prev = best.get(d.id)
        if not prev or score > prev[0]:
            best[d.id] = (score, d)

    ranked = sorted(best.values(), key=lambda x: (-x[0], x[1].id))
    return [_drill_card(d) for score, d in ranked[:limit] if score >= 45]


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
    drill_ids = _collect_plan_drill_ids(plan, gen_req)
    drill_by_id: dict[int, dict[str, Any]] = {}
    if drill_ids:
        for d in db.query(Drill).filter(Drill.id.in_(drill_ids)).all():
            drill_by_id[int(d.id)] = _drill_card(d)

    summary_lines = _summarize_plan(plan, gen_req, drill_by_id)
    focus = gen_req.get("mainFocus") or (gen_req.get("focusSkills") or [None])[0]
    secondary = gen_req.get("secondaryFocus")
    text_drills = gen_req.get("savedTextDrills") or []
    drills_list = list(drill_by_id.values())

    prompt_lines = [
        "=== LIVE РЕЖИМ: ТРЕНЬОРЪТ Е НА ТРЕНИРОВКА / ПРЕГЛЕЖДА КОНКРЕТЕН ПЛАН ===",
        f"Тренировка #{training.id}: {training.title}",
        f"Дата: {training.session_date or '—'} | група/team_id: {training.team_id or '—'}",
        f"Фокус: {focus or '—'} | вторичен: {secondary or '—'}",
        "План (кратко):",
    ]
    prompt_lines.extend(f"- {ln}" for ln in (summary_lines or ["(празен план)"]))
    if drills_list:
        prompt_lines.append("Упражнения в плана (за cues):")
        for card in drills_list[:12]:
            bits = [f"#{card['id']} {card['title']}"]
            if card.get("description"):
                bits.append(card["description"])
            if card.get("coachingPoints"):
                bits.append(f"Cues: {card['coachingPoints']}")
            if card.get("commonMistakes"):
                bits.append(f"Грешки: {card['commonMistakes']}")
            prompt_lines.append("- " + " | ".join(bits))
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
            "- Ако треньорът каже име на упражнение — дай cues/опростяване за НЕГО веднага.",
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
        "drills": drills_list,
        "drillIds": drill_ids,
        "promptText": "\n".join(prompt_lines),
        "mode": "session_live",
    }
