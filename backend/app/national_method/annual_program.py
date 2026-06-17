"""Годишна програма БФВ: макро I/II, 11 мезоцикъла, връзка с конспекти от учебника."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.national_method.cycle_days import enrich_structure

TEXTBOOK_JSON = Path(__file__).resolve().parents[1] / "seed" / "data" / "bvf_textbook_bg.json"

PERIOD_LABELS = {
    "prep": "Подготвителен",
    "competitive": "Състезателен",
    "transition": "Преходен",
}

MACRO_LABELS = {
    1: "Макроцикъл I (VIII–XII)",
    2: "Макроцикъл II (I–VII)",
}

ANNUAL_AGE_BANDS = ("mini", "U13", "U14", "U16", "U18")

# U15/U17 map to съседната програма; mini и U13 имат собствена годишна програма
ANNUAL_BAND_ALIASES = {
    "U15": "U16",
    "U17": "U18",
}


def _normalize_plan_band(age_band: str | None) -> str:
    ab = (age_band or "U16").strip()
    if ab.lower() == "mini":
        return "mini"
    return ab.upper()


def resolve_annual_program_band(age_band: str | None) -> str:
    ab = _normalize_plan_band(age_band or "U16")
    if ab in ANNUAL_AGE_BANDS:
        return ab
    return ANNUAL_BAND_ALIASES.get(ab, "U16")

# 11 мезоцикъла — структура по учебника БФВ (периодизация, годишен план)
MESO_DEFINITIONS: list[dict[str, Any]] = [
    {
        "meso_number": 1,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "август–септември",
        "theme": "Обща физическа подготовка и въвеждане",
        "load": "средна",
        "focus": ["физика", "координация", "комуникация"],
    },
    {
        "meso_number": 2,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "септември–октомври",
        "theme": "Техническа база",
        "load": "средна",
        "focus": ["подаване", "прием", "сервис"],
    },
    {
        "meso_number": 3,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "октомври",
        "theme": "Специална подготовка",
        "load": "средна-висока",
        "focus": ["техника", "физика", "система"],
    },
    {
        "meso_number": 4,
        "macro_id": 1,
        "period": "competitive",
        "months_bg": "октомври–ноември",
        "theme": "Старт на състезателния период",
        "load": "висока",
        "focus": ["сервис-прием", "система", "игра"],
    },
    {
        "meso_number": 5,
        "macro_id": 1,
        "period": "competitive",
        "months_bg": "ноември–декември",
        "theme": "Есенни турнири и стабилизация",
        "load": "висока",
        "focus": ["тактика", "блок", "ментална устойчивост"],
    },
    {
        "meso_number": 6,
        "macro_id": 1,
        "period": "transition",
        "months_bg": "декември",
        "theme": "Преход и възстановяване",
        "load": "ниска-средна",
        "focus": ["възстановяване", "техника", "игра"],
    },
    {
        "meso_number": 7,
        "macro_id": 2,
        "period": "prep",
        "months_bg": "януари–февруари",
        "theme": "Зимна подготовка",
        "load": "средна",
        "focus": ["физика", "техника", "координация"],
    },
    {
        "meso_number": 8,
        "macro_id": 2,
        "period": "prep",
        "months_bg": "февруари–март",
        "theme": "Предсезонна подготовка",
        "load": "средна-висока",
        "focus": ["комплекс", "система", "сервис"],
    },
    {
        "meso_number": 9,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "март–май",
        "theme": "Основен състезателен сезон",
        "load": "висока",
        "focus": ["тактика", "атака", "защита"],
    },
    {
        "meso_number": 10,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "май–юни",
        "theme": "Пикова форма и финали",
        "load": "средна-висока",
        "focus": ["тапер", "скаут", "игра под напрежение"],
    },
    {
        "meso_number": 11,
        "macro_id": 2,
        "period": "transition",
        "months_bg": "юли",
        "theme": "Активна почивка и оценка",
        "load": "ниска",
        "focus": ["възстановяване", "игра", "оценка"],
    },
]

# Мини волейбол (8–10 г.) — 8 мезоцикъла, 1 тренировка/седмица (учебник: 10 ПОДГ + 20 СЪСТ)
MINI_MESO_DEFINITIONS: list[dict[str, Any]] = [
    {
        "meso_number": 1,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "септември",
        "theme": "Координация и траектория на топката",
        "load": "ниска",
        "focus": ["игра", "координация", "траектория"],
    },
    {
        "meso_number": 2,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "октомври",
        "theme": "Бързи крака и стабилен стоеж",
        "load": "ниска-средна",
        "focus": ["стоеж", "OFP", "долно подаване"],
    },
    {
        "meso_number": 3,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "ноември",
        "theme": "Баланс и ориентация в пространството",
        "load": "ниска-средна",
        "focus": ["баланс", "горно подаване", "игра"],
    },
    {
        "meso_number": 4,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "декември",
        "theme": "Долен сервис и странично движение",
        "load": "средна",
        "focus": ["сервис", "движение", "точност"],
    },
    {
        "meso_number": 5,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "януари–февруари",
        "theme": "Контрол на първо докосване",
        "load": "средна",
        "focus": ["посрещане", "игра 2v2", "комуникация"],
    },
    {
        "meso_number": 6,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "март–април",
        "theme": "Малки игри 3v3 и 4v4",
        "load": "средна",
        "focus": ["екипна работа", "игрово мислене", "прехвърляне"],
    },
    {
        "meso_number": 7,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "май",
        "theme": "Мини турнири и състезателна игра",
        "load": "средна",
        "focus": ["турнир", "състезание", "игра"],
    },
    {
        "meso_number": 8,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "май",
        "theme": "Турнирна подготовка и полуфинали",
        "load": "средна",
        "focus": ["турнир", "тактика", "комуникация"],
    },
    {
        "meso_number": 9,
        "macro_id": 2,
        "period": "transition",
        "months_bg": "юни",
        "theme": "Финален турнир и сезонна оценка",
        "load": "ниска-средна",
        "focus": ["финал", "оценка", "празник"],
    },
]

# U13 (12–13 г.) — 11 мезоцикъла; универсално обучение, по-леко натоварване от U14
U13_MESO_DEFINITIONS: list[dict[str, Any]] = [
    {
        "meso_number": 1,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "август–септември",
        "theme": "Въвеждане, координация и комуникация",
        "load": "ниска-средна",
        "focus": ["физика", "координация", "комуникация"],
    },
    {
        "meso_number": 2,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "септември–октомври",
        "theme": "Техническа база — подаване и прием",
        "load": "средна",
        "focus": ["подаване", "прием", "приземяване"],
    },
    {
        "meso_number": 3,
        "macro_id": 1,
        "period": "prep",
        "months_bg": "октомври",
        "theme": "Биомеханика на скок и стабилност",
        "load": "средна",
        "focus": ["техника", "скок", "платформа"],
    },
    {
        "meso_number": 4,
        "macro_id": 1,
        "period": "competitive",
        "months_bg": "октомври–ноември",
        "theme": "Сервис, посрещане и универсална игра",
        "load": "средна",
        "focus": ["сервис", "посрещане", "игра 6v6"],
    },
    {
        "meso_number": 5,
        "macro_id": 1,
        "period": "competitive",
        "months_bg": "ноември–декември",
        "theme": "Атака и защита без специализация",
        "load": "средна",
        "focus": ["атака", "блок", "ротация"],
    },
    {
        "meso_number": 6,
        "macro_id": 1,
        "period": "transition",
        "months_bg": "декември",
        "theme": "Преход и възстановяване",
        "load": "ниска-средна",
        "focus": ["възстановяване", "техника", "игра"],
    },
    {
        "meso_number": 7,
        "macro_id": 2,
        "period": "prep",
        "months_bg": "януари–февруари",
        "theme": "Зимна техническа база",
        "load": "средна",
        "focus": ["техника", "физика", "координация"],
    },
    {
        "meso_number": 8,
        "macro_id": 2,
        "period": "prep",
        "months_bg": "февруари–март",
        "theme": "Свързване на елементите",
        "load": "средна",
        "focus": ["комплекс", "система", "сервис"],
    },
    {
        "meso_number": 9,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "март–май",
        "theme": "Състезателен сезон U13",
        "load": "средна-висока",
        "focus": ["тактика", "атака", "защита"],
    },
    {
        "meso_number": 10,
        "macro_id": 2,
        "period": "competitive",
        "months_bg": "май–юни",
        "theme": "Турнири и стабилизация",
        "load": "средна",
        "focus": ["игра", "ментална устойчивост", "оценка"],
    },
    {
        "meso_number": 11,
        "macro_id": 2,
        "period": "transition",
        "months_bg": "юли",
        "theme": "Активна почивка и преход към U14",
        "load": "ниска",
        "focus": ["възстановяване", "игра", "оценка"],
    },
]

MESO_DEFINITIONS_BY_BAND: dict[str, list[dict[str, Any]]] = {
    "mini": MINI_MESO_DEFINITIONS,
    "U13": U13_MESO_DEFINITIONS,
    "U14": MESO_DEFINITIONS,
    "U16": MESO_DEFINITIONS,
    "U18": MESO_DEFINITIONS,
}


def meso_definitions_for(age_band: str) -> list[dict[str, Any]]:
    return MESO_DEFINITIONS_BY_BAND.get(_normalize_plan_band(age_band), MESO_DEFINITIONS)


def meso_count_for_band(age_band: str) -> int:
    return len(meso_definitions_for(age_band))

WEEK_PROGRESS = (
    ("Въвеждане и акцент", "средна"),
    ("Развитие и обем", "средна-висока"),
    ("Интеграция", "висока"),
    ("Контрол и тапер", "средна"),
)


@lru_cache(maxsize=1)
def _textbook_plan_index() -> dict[str, dict[str, list[str]]]:
    """Индекс slug-ове на конспекти по възраст и фаза (ПОДГ/СЪСТ)."""
    if not TEXTBOOK_JSON.is_file():
        return {}
    data = json.loads(TEXTBOOK_JSON.read_text(encoding="utf-8"))
    out: dict[str, dict[str, list[str]]] = {}
    for sec in data.get("sections") or []:
        if sec.get("kind") != "session_plan":
            continue
        band = _normalize_plan_band(sec.get("age_band") or "")
        phase = (sec.get("session_phase") or "").upper()
        slug = sec.get("slug")
        code = sec.get("session_code") or ""
        if not band or not slug or phase not in ("ПОДГ", "СЪСТ"):
            continue
        key = "podg" if phase == "ПОДГ" else "sast"
        bucket = out.setdefault(band, {}).setdefault(key, [])
        if slug not in bucket:
            bucket.append({"slug": slug, "code": code})
    for band in out:
        for key in out[band]:
            out[band][key].sort(key=lambda x: x["code"])
    return out


def plan_slug_for_meso_week(
    age_band: str,
    period: str,
    meso_number: int,
    week: int,
) -> tuple[str | None, str | None]:
    """Връща (textbook_slug, session_code) за седмица в мезо."""
    idx = _textbook_plan_index()
    band = _normalize_plan_band(age_band)
    plans = idx.get(band, {})
    if not plans and band == "U13":
        plans = idx.get("U14", {})

    if band == "mini":
        if period in ("competitive", "transition") and meso_number >= 5:
            pool = plans.get("sast") or []
            if not pool:
                return None, None
            if meso_number >= 9:
                plan_index = 16 + week - 1
            else:
                plan_index = (meso_number - 5) * 4 + week - 1
            plan_index = max(0, min(plan_index, len(pool) - 1))
        else:
            pool = plans.get("podg") or []
            if not pool:
                return None, None
            plan_index = (meso_number - 1) * 4 + week - 1
            plan_index = max(0, min(plan_index, len(pool) - 1))
        entry = pool[plan_index]
        return entry["slug"], entry.get("code")

    if period in ("prep", "transition"):
        pool = plans.get("podg") or []
    elif period == "competitive":
        pool = plans.get("sast") or []
    else:
        pool = []
    if not pool:
        return None, None
    if period == "competitive":
        plan_index = min((meso_number - 4) * 4 + week - 1, len(pool) - 1)
        plan_index = max(0, plan_index)
    elif period == "prep":
        plan_index = min(meso_number + week - 2, len(pool) - 1)
        plan_index = max(0, plan_index)
    else:
        plan_index = min(max(week, 1), len(pool)) - 1
    entry = pool[plan_index]
    return entry["slug"], entry.get("code")


def annual_program_key(age_band: str, kind: str, number: int) -> str:
    ab = _normalize_plan_band(age_band)
    return f"{ab}-{kind}-{number}"


def _weeks_for_meso(defn: dict[str, Any], age_band: str) -> list[dict[str, Any]]:
    weeks: list[dict[str, Any]] = []
    period = defn["period"]
    meso_number = defn["meso_number"]
    base_theme = defn["theme"]
    base_focus = list(defn.get("focus") or ["техника"])
    base_load = defn.get("load") or "средна"

    for w in range(1, 5):
        sub_theme, load_hint = WEEK_PROGRESS[w - 1]
        load = base_load
        if period == "transition" and w >= 3:
            load = "ниска-средна"
        elif "тапер" in sub_theme.lower() or w == 4:
            load = load_hint if period != "transition" else "ниска-средна"

        slug, code = plan_slug_for_meso_week(age_band, period, meso_number, w)
        week: dict[str, Any] = {
            "week": w,
            "theme": f"{base_theme} — {sub_theme}",
            "load": load,
            "focus": base_focus,
            "session_goals": [f"Мезо {meso_number}, седмица {w}: {sub_theme}"],
        }
        if slug:
            week["textbook_slug"] = slug
            week["session_code"] = code
        weeks.append(week)
    return weeks


def build_meso_structure(defn: dict[str, Any], age_band: str) -> dict[str, Any]:
    meso_number = defn["meso_number"]
    period = defn["period"]
    structure = enrich_structure(
        {"weeks": _weeks_for_meso(defn, age_band)},
        cycle_type="meso",
        age_band=age_band,
    )
    slug, code = plan_slug_for_meso_week(age_band, period, meso_number, 1)

    for week in structure.get("weeks") or []:
        w_slug = week.get("textbook_slug") or slug
        w_code = week.get("session_code") or code
        for day in week.get("days") or []:
            if w_slug and not day.get("textbook_slug"):
                day["textbook_slug"] = w_slug
            if w_code and not day.get("session_code"):
                day["session_code"] = w_code

    structure.update(
        {
            "annual_program_key": annual_program_key(age_band, "meso", meso_number),
            "meso_number": meso_number,
            "macro_id": defn["macro_id"],
            "period": period,
            "period_label": PERIOD_LABELS.get(period, period),
            "months_bg": defn.get("months_bg"),
            "primary_textbook_slug": slug,
            "primary_session_code": code,
            "textbook_reference": "periodizatsiya-na-trenirovachniya-protses",
        }
    )
    return structure


def build_macro_structure(macro_id: int, age_band: str) -> dict[str, Any]:
    defs = meso_definitions_for(age_band)
    meso_nums = [d["meso_number"] for d in defs if d["macro_id"] == macro_id]
    periods: list[dict[str, Any]] = []
    seen: set[str] = set()
    for defn in defs:
        if defn["macro_id"] != macro_id:
            continue
        p = defn["period"]
        if p in seen:
            continue
        seen.add(p)
        nums = [d["meso_number"] for d in defs if d["macro_id"] == macro_id and d["period"] == p]
        periods.append(
            {
                "period": p,
                "label": PERIOD_LABELS.get(p, p),
                "meso_numbers": nums,
            }
        )

    macro_labels = MACRO_LABELS
    if _normalize_plan_band(age_band) == "mini":
        macro_labels = {
            1: "Макро I — Запознаване и подготовка (IX–I)",
            2: "Макро II — Турнири и финал (II–VI)",
        }

    return {
        "annual_program_key": annual_program_key(age_band, "macro", macro_id),
        "macro_id": macro_id,
        "macro_label": macro_labels.get(macro_id, f"Макро {macro_id}"),
        "periods": periods,
        "meso_numbers": meso_nums,
        "textbook_reference": (
            "vazrastova-grupa-mini-volenbol-8-10-godini"
            if _normalize_plan_band(age_band) == "mini"
            else (
                "vazrastova-grupa-under-13-under-14-u13-u14"
                if _normalize_plan_band(age_band) == "U13"
                else "periodizatsiya-na-trenirovachniya-protses"
            )
        ),
        "weeks": [],
    }


def meso_cycle_spec(defn: dict[str, Any], age_band: str) -> dict[str, Any]:
    n = defn["meso_number"]
    period_label = PERIOD_LABELS.get(defn["period"], defn["period"])
    macro_label = MACRO_LABELS.get(defn["macro_id"], "")
    return {
        "title_bg": f"Мезо {n} — {defn['theme']} ({age_band})",
        "summary_bg": f"{macro_label} · {period_label} · {defn.get('months_bg', '')}",
        "cycle_type": "meso",
        "weeks": 4,
        "age_band": _normalize_plan_band(age_band),
        "structure_json": build_meso_structure(defn, age_band),
        "sort_order": 100 + n,
    }


def macro_cycle_spec(macro_id: int, age_band: str) -> dict[str, Any]:
    defs = meso_definitions_for(age_band)
    label = build_macro_structure(macro_id, age_band).get("macro_label") or MACRO_LABELS.get(macro_id, f"Макро {macro_id}")
    meso_nums = [d["meso_number"] for d in defs if d["macro_id"] == macro_id]
    return {
        "title_bg": f"{label} — {_normalize_plan_band(age_band)}",
        "summary_bg": f"Мезоцикли {meso_nums[0]}–{meso_nums[-1]} · учебник БФВ",
        "cycle_type": "macro",
        "weeks": 0,
        "age_band": _normalize_plan_band(age_band),
        "structure_json": build_macro_structure(macro_id, age_band),
        "sort_order": 90 + macro_id,
    }


def all_annual_cycle_specs(age_band: str) -> list[dict[str, Any]]:
    band = _normalize_plan_band(age_band)
    specs = [macro_cycle_spec(1, band), macro_cycle_spec(2, band)]
    for defn in meso_definitions_for(band):
        specs.append(meso_cycle_spec(defn, band))
    return specs


def annual_context_from_structure(structure: dict[str, Any] | None) -> dict[str, Any] | None:
    if not structure or not structure.get("annual_program_key"):
        return None
    ctx = {
        "annual_program_key": structure.get("annual_program_key"),
        "meso_number": structure.get("meso_number"),
        "macro_id": structure.get("macro_id"),
        "period": structure.get("period"),
        "period_label": structure.get("period_label"),
        "months_bg": structure.get("months_bg"),
        "macro_label": MACRO_LABELS.get(structure.get("macro_id") or 0),
        "primary_textbook_slug": structure.get("primary_textbook_slug"),
        "primary_session_code": structure.get("primary_session_code"),
        "textbook_reference": structure.get("textbook_reference"),
    }
    if structure.get("macro_label"):
        ctx["macro_label"] = structure["macro_label"]
    return {k: v for k, v in ctx.items() if v is not None}


def textbook_slug_for_day(
    structure: dict[str, Any] | None,
    week: dict[str, Any] | None,
    day: dict[str, Any] | None,
) -> str | None:
    if day and day.get("textbook_slug"):
        return day["textbook_slug"]
    if week and week.get("textbook_slug"):
        return week["textbook_slug"]
    if structure:
        return structure.get("primary_textbook_slug")
    return None


def library_tree(cycles: list[Any], age_band: str) -> dict[str, Any]:
    """Групира годишна програма за UI: макро → мезо."""
    ab = _normalize_plan_band(age_band)
    macros: list[dict[str, Any]] = []
    mesos_by_macro: dict[int, list[dict[str, Any]]] = {1: [], 2: []}

    for c in cycles:
        s = getattr(c, "structure_json", None) or {}
        key = s.get("annual_program_key") or ""
        if not key.startswith(f"{ab}-"):
            continue
        row = {
            "id": c.id,
            "title_bg": c.title_bg,
            "summary_bg": c.summary_bg,
            "cycle_type": c.cycle_type,
            "weeks": c.weeks,
            "age_band": c.age_band,
            "sort_order": c.sort_order,
            "meso_number": s.get("meso_number"),
            "macro_id": s.get("macro_id"),
            "period": s.get("period"),
            "period_label": s.get("period_label") or PERIOD_LABELS.get(s.get("period") or ""),
            "annual_program_key": key,
        }
        if c.cycle_type == "macro":
            macros.append(row)
        elif c.cycle_type == "meso":
            mid = s.get("macro_id") or 1
            mesos_by_macro.setdefault(mid, []).append(row)

    macros.sort(key=lambda x: x.get("sort_order", 0))
    for mid in mesos_by_macro:
        mesos_by_macro[mid].sort(key=lambda x: x.get("meso_number") or 0)

    return {
        "age_band": ab,
        "macros": macros,
        "mesos_by_macro": mesos_by_macro,
        "meso_count": meso_count_for_band(ab),
        "textbook_slug": "periodizatsiya-na-trenirovachniya-protses",
        "available_age_bands": list(ANNUAL_AGE_BANDS),
    }


def ensure_annual_program_seeded(db) -> dict[str, Any]:
    """Idempotent: seed годишна програма ако липсва в БД."""
    from app.models import MethodCycle

    from app.national_method.content_policy import is_annual_program_cycle

    existing = sum(
        1 for c in db.query(MethodCycle).filter(MethodCycle.status == "published").all()
        if is_annual_program_cycle(c)
    )
    expected = sum(2 + meso_count_for_band(b) for b in ANNUAL_AGE_BANDS)
    if existing >= expected:
        return {"skipped": True, "existing": existing}
    from app.scripts.seed_annual_program import seed_annual_program

    return seed_annual_program(db, replace=False)
