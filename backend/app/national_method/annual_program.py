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

ANNUAL_AGE_BANDS = ("U14", "U16", "U18")

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
        band = (sec.get("age_band") or "").upper()
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
    band = age_band.upper()
    plans = idx.get(band, {})
    if period in ("prep", "transition"):
        pool = plans.get("podg") or []
    elif period == "competitive":
        pool = plans.get("sast") or []
    else:
        pool = []
    if not pool:
        return None, None
    plan_index = min(max(week, 1), len(pool)) - 1
    if period == "competitive":
        plan_index = min((meso_number - 4) * 4 + week - 1, len(pool) - 1)
        plan_index = max(0, plan_index)
    elif period == "prep":
        plan_index = min(meso_number + week - 2, len(pool) - 1)
        plan_index = max(0, plan_index)
    entry = pool[plan_index]
    return entry["slug"], entry.get("code")


def annual_program_key(age_band: str, kind: str, number: int) -> str:
    ab = age_band.upper()
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
    meso_nums = [d["meso_number"] for d in MESO_DEFINITIONS if d["macro_id"] == macro_id]
    periods: list[dict[str, Any]] = []
    seen: set[str] = set()
    for defn in MESO_DEFINITIONS:
        if defn["macro_id"] != macro_id:
            continue
        p = defn["period"]
        if p in seen:
            continue
        seen.add(p)
        nums = [d["meso_number"] for d in MESO_DEFINITIONS if d["macro_id"] == macro_id and d["period"] == p]
        periods.append(
            {
                "period": p,
                "label": PERIOD_LABELS.get(p, p),
                "meso_numbers": nums,
            }
        )

    return {
        "annual_program_key": annual_program_key(age_band, "macro", macro_id),
        "macro_id": macro_id,
        "macro_label": MACRO_LABELS.get(macro_id, f"Макро {macro_id}"),
        "periods": periods,
        "meso_numbers": meso_nums,
        "textbook_reference": "periodizatsiya-na-trenirovachniya-protses",
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
        "age_band": age_band,
        "structure_json": build_meso_structure(defn, age_band),
        "sort_order": 100 + n,
    }


def macro_cycle_spec(macro_id: int, age_band: str) -> dict[str, Any]:
    label = MACRO_LABELS.get(macro_id, f"Макро {macro_id}")
    meso_nums = [d["meso_number"] for d in MESO_DEFINITIONS if d["macro_id"] == macro_id]
    return {
        "title_bg": f"{label} — {age_band}",
        "summary_bg": f"Мезоцикли {meso_nums[0]}–{meso_nums[-1]} · учебник БФВ",
        "cycle_type": "macro",
        "weeks": 0,
        "age_band": age_band,
        "structure_json": build_macro_structure(macro_id, age_band),
        "sort_order": 90 + macro_id,
    }


def all_annual_cycle_specs(age_band: str) -> list[dict[str, Any]]:
    specs = [macro_cycle_spec(1, age_band), macro_cycle_spec(2, age_band)]
    for defn in MESO_DEFINITIONS:
        specs.append(meso_cycle_spec(defn, age_band))
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
    """Групира цикли за UI: макро → мезо + legacy шаблони."""
    ab = age_band.upper()
    macros: list[dict[str, Any]] = []
    mesos_by_macro: dict[int, list[dict[str, Any]]] = {1: [], 2: []}
    legacy: list[dict[str, Any]] = []

    for c in cycles:
        s = getattr(c, "structure_json", None) or {}
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
            "annual_program_key": s.get("annual_program_key"),
        }
        key = s.get("annual_program_key") or ""
        if c.cycle_type == "macro" and key.startswith(f"{ab}-macro"):
            macros.append(row)
        elif c.cycle_type == "meso" and key.startswith(f"{ab}-meso"):
            mid = s.get("macro_id") or 1
            mesos_by_macro.setdefault(mid, []).append(row)
        elif not key.startswith(f"{ab}-meso") and not key.startswith(f"{ab}-macro"):
            if c.age_band in (ab, "all"):
                legacy.append(row)

    macros.sort(key=lambda x: x.get("sort_order", 0))
    for mid in mesos_by_macro:
        mesos_by_macro[mid].sort(key=lambda x: x.get("meso_number") or 0)

    return {
        "age_band": ab,
        "macros": macros,
        "mesos_by_macro": mesos_by_macro,
        "legacy_cycles": legacy,
        "meso_count": len(MESO_DEFINITIONS),
        "textbook_slug": "periodizatsiya-na-trenirovachniya-protses",
    }
