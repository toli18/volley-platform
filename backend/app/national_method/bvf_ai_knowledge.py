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


def coach_principles_for_plan(principles: list[str] | None, age_band: str) -> list[str]:
    """Кратки методически акценти за плана — без статии и дълги откъслеци."""
    skip_fragments = (
        "volley comment",
        "sorry",
        "javascript",
        "http",
        "науката и спорта-",
        "published on",
        "primary navigation",
    )
    out: list[str] = []
    for raw in principles or []:
        s = clean_vc_text(str(raw).strip(), max_len=160)
        if len(s) < 18 or len(s) > 160:
            continue
        low = s.lower()
        if any(f in low for f in skip_fragments):
            continue
        if s not in out:
            out.append(s)
    if out:
        return out[:4]
    return [
        f"Възраст {age_band}: много качествени повторения, ясна цел на всеки блок.",
        "Кратки команди и корекция — не дълги обяснения между сериите.",
        "Натоварването следва седмицата от мезоцикъла.",
    ]


def phase_block_goal(phase_name: str) -> str:
    for p in SESSION_PHASES_BG:
        if p.get("phase") == phase_name:
            return str(p.get("goal", ""))
    return ""


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


_JUNK_LINE_MARKERS = (
    "javascript disabled",
    "outdated browser",
    "primary navigation",
    "begin typing your search",
    "press esc to cancel",
    "published on",
    "by николай иванов",
    "volley comment",
    "sorry, you have",
    "google chrome frame",
)


def _clean_method_text(text: str, max_len: int = 500) -> str:
    if not text:
        return ""
    lines: list[str] = []
    for line in text.replace("\r", "\n").split("\n"):
        chunk = line.strip()
        if not chunk or len(chunk) < 12:
            continue
        low = chunk.lower()
        if any(m in low for m in _JUNK_LINE_MARKERS):
            continue
        if low.startswith("http"):
            continue
        lines.append(chunk)
    cleaned = " ".join(lines)
    return cleaned[:max_len].strip()


_JUNK_LINE_MARKERS = (
    "javascript disabled",
    "outdated browser",
    "google chrome frame",
    "primary navigation",
    "begin typing your search",
    "press esc to cancel",
    "published on ",
    "by николай иванов",
    "sorry, you have",
)


def clean_vc_text(text: str, max_len: int = 500) -> str:
    """Премахва HTML/навигационен шум от Volley Comment извличане."""
    if not text:
        return ""
    lines: list[str] = []
    for line in text.replace("\r", "").split("\n"):
        s = line.strip()
        if not s or len(s) < 12:
            continue
        low = s.lower()
        if any(m in low for m in _JUNK_LINE_MARKERS):
            continue
        if low.startswith("http") or "volley comment" in low and len(s) < 80:
            continue
        lines.append(s)
    joined = " ".join(lines)
    joined = re.sub(r"\s+", " ", joined).strip()
    return joined[:max_len] if joined else ""


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
            cleaned = clean_vc_text(kp, 400)
            if cleaned and len(cleaned) > 30 and cleaned not in buckets[band]["principles"]:
                buckets[band]["principles"].append(cleaned)
        sm = clean_vc_text((art.get("summary_bg") or "").strip(), 500)
        if sm and len(sm) > 40 and sm not in buckets[band]["principles"]:
            buckets[band]["principles"].append(sm)
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
    from app.national_method.cycle_days import (
        enrich_structure,
        find_day,
        find_week,
        merge_week_day_context,
    )

    out = dict(request_data)
    age_band = resolve_age_band(out)
    week = out.get("cycleWeek")
    day = out.get("cycleDay")
    try:
        week = int(week) if week is not None else None
    except (TypeError, ValueError):
        week = None
    try:
        day = int(day) if day is not None else None
    except (TypeError, ValueError):
        day = None

    knowledge = get_age_knowledge(age_band)
    wc = week_context(age_band, week)
    day_ctx = None

    if db and out.get("cycleId"):
        from app.models import MethodCycle

        cycle = db.query(MethodCycle).filter(MethodCycle.id == int(out["cycleId"])).first()
        if cycle and cycle.structure_json:
            s = enrich_structure(
                cycle.structure_json,
                cycle_type=cycle.cycle_type,
                age_band=cycle.age_band,
            )
            wk = find_week(s.get("weeks") or [], week)
            if wk:
                wc = merge_week_day_context(wk, find_day(wk, day))
                day_ctx = find_day(wk, day)

    if not out.get("mainFocus"):
        prio = (day_ctx or wc or {}).get("focus") or []
        if prio:
            out["mainFocus"] = _skill_from_token(prio[0])
            out["secondaryFocus"] = _skill_from_token(prio[1] if len(prio) > 1 else "атака")
        else:
            p, s = suggest_focus_skills(age_band, week)
            out["mainFocus"] = p
            out["secondaryFocus"] = s

    out["ageBand"] = age_band
    out["bvfKnowledge"] = {
        "age_band": age_band,
        "principles": coach_principles_for_plan(knowledge.get("principles"), age_band),
        "week": wc,
        "day": day_ctx,
        "session_structure": knowledge.get("session_structure") or SESSION_PHASES_BG,
        "coach_cues": (knowledge.get("coach_cues") or [])[:4],
    }
    return out


def build_training_plan_text(session: dict[str, Any], request_data: dict[str, Any]) -> str:
    """Текстов тренировъчен план за треньора (структуриран, без повторения)."""
    age_band = resolve_age_band(request_data)
    k = get_age_knowledge(age_band)
    bvf = request_data.get("bvfKnowledge") or {}
    wc = bvf.get("week") or week_context(age_band, request_data.get("cycleWeek"))
    total = int(session.get("totalMinutes") or request_data.get("durationTotalMin") or 90)
    primary = request_data.get("mainFocus") or request_data.get("primaryFocus") or ""
    secondary = request_data.get("secondaryFocus") or ""

    lines = [
        f"# Тренировъчен план — {age_band} · {total} мин",
        "",
        "## 1. Контекст от цикъл",
    ]
    if wc:
        lines.append(f"- **Седмица:** {wc.get('theme', '')} (натоварване: {wc.get('load', 'средна')})")
        if wc.get("session_goals"):
            for g in (wc.get("session_goals") or [])[:2]:
                lines.append(f"- **Цел за седмицата:** {g}")
    day_ctx = bvf.get("day") or (wc if wc and wc.get("day_label") else None)
    if day_ctx and day_ctx.get("day_label"):
        lines.append(f"- **Тренировка:** {day_ctx.get('day_label')}")
        if day_ctx.get("day_theme"):
            lines.append(f"- **Тема:** {day_ctx.get('day_theme')}")
        if day_ctx.get("session_goal"):
            lines.append(f"- **Цел на тази сесия:** {day_ctx.get('session_goal')}")
    if not wc and not day_ctx:
        lines.append("- Обща методика БФВ за избраната възраст.")

    lines.extend(["", "## 2. Фокус на тренировката"])
    if primary or secondary:
        lines.append(f"- **Основен:** {primary or '—'}")
        lines.append(f"- **Вторичен:** {secondary or '—'}")
    else:
        focus = (wc or {}).get("focus") or k.get("focus_priority") or []
        if focus:
            lines.append(f"- **Приоритет:** {', '.join(focus[:3])}")

    principles = bvf.get("principles") or coach_principles_for_plan(k.get("principles"), age_band)
    lines.extend(["", "## 3. Методически акценти в залата"])
    for i, p in enumerate(principles[:4], start=1):
        lines.append(f"{i}. {p}")

    cues = bvf.get("coach_cues") or k.get("coach_cues") or []
    if cues:
        lines.append("")
        lines.append("**В залата:** " + " · ".join(cues[:3]))

    lines.extend(["", "## 4. Структура на сесията"])
    for block in session.get("blocks") or []:
        bt = block.get("blockType") or block.get("име")
        tm = block.get("targetMinutes") or block.get("целевоВреме") or 0
        goal = phase_block_goal(bt)
        lines.append(f"### {bt} ({tm} мин)")
        if goal:
            lines.append(f"**Задача:** {goal}")
        drills = block.get("drills") or []
        if drills:
            lines.append("**Упражнения:**")
            for d in drills:
                name = d.get("name") or d.get("име") or "Упражнение"
                mins = d.get("minutes") or d.get("минути") or 0
                lines.append(f"- {name} — {mins} мин")
        for td in block.get("textDrills") or []:
            lines.append(
                f"- *{td.get('title')}* ({td.get('minutes', 0)} мин) — {td.get('instructions', '')[:100]}"
            )

    lines.extend(
        [
            "",
            "## 5. Какво да следите",
            "- Брой качествени докосвания, не само продължителност.",
            "- Една корекция на играч, после продължаване на ритъма.",
            "- Комуникация при всяка ротация в интеграция и игра.",
            "",
            "---",
            "*План по националната методика БФВ.*",
        ]
    )
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
