"""
Структурирана методика БФВ за AI генератора (не за четене от треньори).

Зарежда се от seed/data/bvf_ai_knowledge.json — извлечено от Volley Comment.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.national_method.cycle_article_links import infer_age_band

DATA_PATH = Path(__file__).resolve().parents[1] / "seed" / "data" / "bvf_ai_knowledge.json"

SESSION_PHASES_BG = [
    {"phase": "Активиране", "minutes_pct": 0.12, "goal": "Разгрявка, координация, комуникация"},
    {"phase": "Изграждане", "minutes_pct": 0.32, "goal": "Технически повторения с ясен фокус"},
    {"phase": "Интеграция", "minutes_pct": 0.28, "goal": "Свързване техника → игра в ритъм"},
    {"phase": "Състезателност", "minutes_pct": 0.20, "goal": "Контролирана игра / натиск"},
]

DEFAULT_WEEK_THEMES: dict[str, list[dict]] = {
    "mini": [
        {"week": 1, "theme": "Запознаване и игри", "focus": ["хвърляне", "игра"], "load": "ниска"},
        {"week": 2, "theme": "Подаване", "focus": ["подаване"], "load": "ниска"},
        {"week": 3, "theme": "Прием", "focus": ["прием"], "load": "ниска"},
        {"week": 4, "theme": "Сервис", "focus": ["сервис"], "load": "средна"},
    ],
    "U13": [
        {"week": 1, "theme": "Подаване и прием", "focus": ["подаване", "прием"], "load": "средна"},
        {"week": 2, "theme": "Сервис", "focus": ["сервис"], "load": "средна"},
        {"week": 3, "theme": "Игра 3v3/4v4", "focus": ["игра"], "load": "средна"},
        {"week": 4, "theme": "Мачов ритъм", "focus": ["система"], "load": "средна"},
    ],
    "U14": [
        {"week": 1, "theme": "Техническа база", "focus": ["подаване", "прием"], "load": "средна"},
        {"week": 2, "theme": "Нападение", "focus": ["разпределение", "атака"], "load": "средна-висока"},
        {"week": 3, "theme": "Блок и защита", "focus": ["блок", "защита"], "load": "висока"},
        {"week": 4, "theme": "Интеграция", "focus": ["система", "игра"], "load": "средна"},
    ],
    "U16": [
        {"week": 1, "theme": "Физика и техника", "focus": ["сервис", "прием"], "load": "средна"},
        {"week": 2, "theme": "Комплекс", "focus": ["прием", "атака"], "load": "висока"},
        {"week": 3, "theme": "Тактика", "focus": ["блок", "ротации"], "load": "висока"},
        {"week": 4, "theme": "Мач", "focus": ["игра"], "load": "средна"},
    ],
    "U18": [
        {"week": 1, "theme": "Сервис-прием-атака", "focus": ["сервис", "прием"], "load": "висока"},
        {"week": 2, "theme": "Тактика", "focus": ["тактика"], "load": "висока"},
        {"week": 3, "theme": "Натоварване", "focus": ["физика"], "load": "висока"},
        {"week": 4, "theme": "Тапер", "focus": ["свежест"], "load": "ниска-средна"},
    ],
}

TEXT_EXERCISE_TEMPLATES: dict[str, list[dict]] = {
    "Активиране": [
        {"title": "Динамична разгрявка с топка", "instructions": "8–10 мин: лек джог, динамични разтягвания, пас в двойки на 3–5 м.", "skill": "Координация"},
        {"title": "Координация и комуникация", "instructions": "Игри с извикване на зона; 2–3 мин серии, 3 серии.", "skill": "Игра"},
    ],
    "Изграждане": [
        {"title": "Техническа серия с повторения", "instructions": "Серии 8–12 повторения; кратка обратна връзка; ротация на групи.", "skill": "Техника"},
        {"title": "Фокус по седмична тема", "instructions": "Един елемент на сесията — висок брой качествени докосвания.", "skill": "Техника"},
    ],
    "Интеграция": [
        {"title": "Сервис-прием в ритъм", "instructions": "6 на 6; цел: първа топка стабилна; комуникация при всяка ротация.", "skill": "Прием"},
        {"title": "Комплекс 6 топки", "instructions": "Прием → пас → атака; без прекъсване; след грешка — кратък рестарт.", "skill": "Преход"},
    ],
    "Състезателност": [
        {"title": "Контролирана игра", "instructions": "4v4 или 6v6 с правила (макс. 3 докосвания); отчитане на точки.", "skill": "Игра"},
        {"title": "Симулация на мач", "instructions": "Сет до 25; ротации; таймаути като в мач.", "skill": "Игра"},
    ],
}


@lru_cache(maxsize=1)
def load_knowledge_bundle() -> dict[str, Any]:
    if not DATA_PATH.is_file():
        return {"ages": {}, "version": "0"}
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def resolve_age_band(request: dict[str, Any]) -> str:
    if request.get("ageBand"):
        return str(request["ageBand"])
    age = request.get("age") or request.get("ageRange")
    if isinstance(age, str) and age.upper().startswith("U"):
        return age.upper().replace("U", "U") if age.startswith("U") else age
    try:
        n = int(age)
        if n <= 12:
            return "U13"
        if n <= 13:
            return "U13"
        if n <= 14:
            return "U14"
        if n <= 15:
            return "U15"
        if n <= 16:
            return "U16"
        if n <= 17:
            return "U17"
        return "U18"
    except (TypeError, ValueError):
        pass
    return "U14"


def get_age_knowledge(age_band: str) -> dict[str, Any]:
    bundle = load_knowledge_bundle()
    ages = bundle.get("ages") or {}
    if age_band in ages:
        return ages[age_band]
    if age_band == "U15" and "U14" in ages:
        return ages["U14"]
    if age_band == "U17" and "U16" in ages:
        return ages["U16"]
    return ages.get("U14") or {
        "label": age_band,
        "principles": ["Следвайте националната методика БФВ за възрастта."],
        "focus_priority": ["прием", "подаване", "атака"],
        "session_structure": SESSION_PHASES_BG,
        "meso_weeks": DEFAULT_WEEK_THEMES.get(age_band, DEFAULT_WEEK_THEMES["U14"]),
    }


def week_context(age_band: str, week: int | None) -> dict[str, Any] | None:
    if not week:
        return None
    k = get_age_knowledge(age_band)
    for w in k.get("meso_weeks") or []:
        if int(w.get("week", 0)) == int(week):
            return w
    return None


def suggest_focus_skills(age_band: str, week: int | None = None) -> tuple[str, str]:
    wc = week_context(age_band, week)
    k = get_age_knowledge(age_band)
    prio = (wc or {}).get("focus") or k.get("focus_priority") or ["прием", "подаване"]
    primary = _skill_from_token(prio[0] if prio else "прием")
    secondary = _skill_from_token(prio[1] if len(prio) > 1 else "атака")
    return primary, secondary


def _skill_from_token(token: str) -> str:
    t = (token or "").lower()
    mapping = {
        "прием": "Посрещане",
        "посрещане": "Посрещане",
        "подаване": "Разпределение",
        "разпределение": "Разпределение",
        "сервис": "Сервис",
        "атака": "Атака",
        "блок": "Блок",
        "защита": "Защита",
        "игра": "Игра",
        "система": "Игра",
        "тактика": "Игра",
        "физика": "Координация",
    }
    for key, val in mapping.items():
        if key in t:
            return val
    return "Посрещане"


def build_from_volleycomment_json(vc_path: Path) -> dict[str, Any]:
    """Еднократно изграждане на knowledge bundle от bvf_volleycomment_bg.json."""
    data = json.loads(vc_path.read_text(encoding="utf-8"))
    buckets: dict[str, dict[str, Any]] = {}

    for art in data.get("articles", []):
        band = infer_age_band(art.get("title_bg", ""), art.get("slug", ""))
        if band == "all":
            band = "all"
        if band not in buckets:
            buckets[band] = {"principles": [], "program_notes": [], "titles": []}
        for kp in art.get("key_points") or []:
            if kp and len(kp) > 30 and kp not in buckets[band]["principles"]:
                buckets[band]["principles"].append(kp[:400])
        sm = (art.get("summary_bg") or "").strip()
        if sm and len(sm) > 40 and sm not in buckets[band]["principles"]:
            buckets[band]["principles"].append(sm[:500])
        if "единна програм" in art.get("title_bg", "").lower():
            buckets[band]["program_notes"].append(art.get("title_bg", "")[:200])

    ages: dict[str, Any] = {}
    for band in ("mini", "U13", "U14", "U16", "U18", "all"):
        src = buckets.get(band) or buckets.get("all") or {}
        principles = (src.get("principles") or [])[:15]
        if band == "all":
            continue
        ages[band] = {
            "label": band,
            "principles": principles or [f"Методика БФВ за {band}."],
            "program_highlights": (src.get("program_notes") or [])[:8],
            "focus_priority": _default_focus(band),
            "session_structure": SESSION_PHASES_BG,
            "meso_weeks": DEFAULT_WEEK_THEMES.get(band, DEFAULT_WEEK_THEMES["U14"]),
            "coach_cues": [
                "Кратки команди, много повторения.",
                "Комуникация на всяка ротация.",
                "Натоварването следва седмичния мезо план.",
            ],
        }
    return {"version": "1.0.0", "ages": ages}


def _default_focus(band: str) -> list[str]:
    return {
        "mini": ["игра", "подаване", "прием"],
        "U13": ["прием", "подаване", "сервис"],
        "U14": ["прием", "разпределение", "атака"],
        "U16": ["сервис", "прием", "атака", "блок"],
        "U18": ["сервис", "прием", "тактика"],
    }.get(band, ["прием", "подаване", "атака"])


def enrich_request(request_data: dict[str, Any], db=None) -> dict[str, Any]:
    """Добавя BVF контекст към заявката за генератор."""
    out = dict(request_data)
    age_band = resolve_age_band(out)
    week = out.get("cycleWeek")
    try:
        week = int(week) if week is not None else None
    except (TypeError, ValueError):
        week = None

    knowledge = get_age_knowledge(age_band)
    wc = week_context(age_band, week)

    if db and out.get("cycleId"):
        from app.models import MethodCycle

        cycle = db.query(MethodCycle).filter(MethodCycle.id == int(out["cycleId"])).first()
        if cycle and cycle.structure_json:
            weeks = cycle.structure_json.get("weeks") or []
            if week:
                for w in weeks:
                    if int(w.get("week", 0)) == week:
                        wc = w
                        break

    if not out.get("mainFocus"):
        p, s = suggest_focus_skills(age_band, week)
        out["mainFocus"] = p
        out["secondaryFocus"] = s

    out["ageBand"] = age_band
    out["bvfKnowledge"] = {
        "age_band": age_band,
        "principles": (knowledge.get("principles") or [])[:8],
        "week": wc,
        "session_structure": knowledge.get("session_structure") or SESSION_PHASES_BG,
        "coach_cues": knowledge.get("coach_cues") or [],
    }
    return out


def build_training_plan_text(session: dict[str, Any], request_data: dict[str, Any]) -> str:
    """Текстов тренировъчен план за треньора (не статия)."""
    age_band = resolve_age_band(request_data)
    k = get_age_knowledge(age_band)
    bvf = request_data.get("bvfKnowledge") or {}
    wc = bvf.get("week") or week_context(age_band, request_data.get("cycleWeek"))
    total = int(session.get("totalMinutes") or request_data.get("durationTotalMin") or 90)
    lines = [
        f"# Тренировъчен план — {age_band}",
        f"**Продължителност:** {total} мин",
    ]
    if wc:
        lines.append(f"**Седмица от мезоцикъл:** {wc.get('theme', '')} (натоварване: {wc.get('load', 'средна')})")
    lines.append("")
    lines.append("## Методически акцент (БФВ)")
    for p in (k.get("principles") or [])[:5]:
        lines.append(f"- {p}")
    lines.append("")
    lines.append("## Структура")
    for block in session.get("blocks") or []:
        bt = block.get("blockType") or block.get("име")
        tm = block.get("targetMinutes") or block.get("целевоВреме") or 0
        lines.append(f"### {bt} ({tm} мин)")
        for d in block.get("drills") or []:
            name = d.get("name") or d.get("име") or "Упражнение"
            mins = d.get("minutes") or d.get("минути") or 0
            why = (d.get("why") or [""])[0] if isinstance(d.get("why"), list) else d.get("обосновка", "")
            lines.append(f"- **{name}** ({mins} мин) — {why}")
        for td in block.get("textDrills") or []:
            lines.append(f"- *{td.get('title')}* ({td.get('minutes', 0)} мин) — текстово упражнение: {td.get('instructions', '')[:120]}…")
    lines.append("")
    lines.append("---")
    lines.append("*Генерирано по националната методика БФВ (Наука и спорта).*")
    return "\n".join(lines)


def attach_text_drills(session: dict[str, Any], request_data: dict[str, Any], min_per_block: int = 1) -> None:
    """Добавя текстови упражнения ако блокът е празен или кратък."""
    age_band = resolve_age_band(request_data)
    for block in session.get("blocks") or []:
        bt = block.get("blockType") or "Изграждане"
        drills = block.get("drills") or []
        target = int(block.get("targetMinutes") or 10)
        filled = sum(int(d.get("minutes") or 0) for d in drills)
        text_drills = []
        templates = TEXT_EXERCISE_TEMPLATES.get(bt) or TEXT_EXERCISE_TEMPLATES["Изграждане"]
        if len(drills) < min_per_block or filled < target * 0.5:
            t = templates[0]
            mins = max(8, min(target, 15))
            text_drills.append(
                {
                    "title": t["title"],
                    "instructions": t["instructions"],
                    "minutes": mins,
                    "skill": t["skill"],
                    "source": "bvf_method",
                }
            )
        if text_drills:
            block["textDrills"] = text_drills
