"""Мезо/микро: тренировки в седмица (days[]) и контекст за AI."""

from __future__ import annotations

from typing import Any

SESSION_LABELS = ("Тренировка 1", "Тренировка 2", "Тренировка 3", "Тренировка 4")

DAY_ROLES_4 = (
    ("Технически акцент I", 0),
    ("Технически акцент II", 1),
    ("Комплекс / свързване", None),
    ("Игра / ситуации", None),
)

DAY_ROLES_3 = (
    ("Технически блок", 0),
    ("Комплекс", None),
    ("Игра", None),
)


def sessions_per_week(cycle_type: str | None, age_band: str | None, week_count: int = 4) -> int:
    if cycle_type == "micro" and week_count <= 1:
        return 3
    if age_band == "mini":
        return 1
    return 4 if cycle_type == "meso" else 3


def build_days_for_week(week: dict[str, Any], n_sessions: int) -> list[dict[str, Any]]:
    """Генерира 3–4 тренировки от седмичния фокус (ако липсват в seed)."""
    if n_sessions <= 0:
        return []
    focus = list(week.get("focus") or ["техника"])
    goals = list(week.get("session_goals") or [])
    theme = (week.get("theme") or "").strip()
    load = week.get("load") or "средна"
    roles = DAY_ROLES_4 if n_sessions >= 4 else DAY_ROLES_3

    days: list[dict[str, Any]] = []
    for i in range(n_sessions):
        label = SESSION_LABELS[i] if i < len(SESSION_LABELS) else f"Тренировка {i + 1}"
        role_title, focus_idx = roles[i] if i < len(roles) else (label, None)
        if focus_idx is not None and focus_idx < len(focus):
            day_focus = [focus[focus_idx]]
        else:
            day_focus = focus[:2] if focus else ["игра"]
        day_goal = goals[i] if i < len(goals) else (goals[-1] if goals else f"Развитие по тема: {theme}")
        sub_theme = f"{theme} — {role_title}" if theme else role_title
        intensity = load
        if i == n_sessions - 1 and "висок" in load.lower():
            intensity = "средна"
        if "тапер" in load.lower() or "ниска" in load.lower():
            intensity = "ниска-средна" if i >= n_sessions - 2 else load

        days.append(
            {
                "day": i + 1,
                "label": label,
                "theme": sub_theme,
                "focus": day_focus,
                "session_goal": day_goal,
                "intensity": intensity,
            }
        )
    return days


def enrich_week(week: dict[str, Any], n_sessions: int) -> dict[str, Any]:
    w = dict(week)
    existing = w.get("days")
    if isinstance(existing, list) and len(existing) >= 1:
        return w
    w["days"] = build_days_for_week(w, n_sessions)
    return w


def enrich_structure(
    structure: dict[str, Any] | None,
    *,
    cycle_type: str | None = None,
    age_band: str | None = None,
) -> dict[str, Any]:
    s = dict(structure or {})
    weeks_in = s.get("weeks") or []
    week_count = len(weeks_in) or 4
    n = sessions_per_week(cycle_type, age_band, week_count)
    s["weeks"] = [enrich_week(w, n) for w in weeks_in]
    s["sessions_per_week"] = n
    return s


def find_week(weeks: list[dict], week_num: int | None) -> dict[str, Any] | None:
    if not week_num:
        return None
    for w in weeks:
        if int(w.get("week", 0)) == int(week_num):
            return w
    return None


def find_day(week: dict[str, Any] | None, day_num: int | None) -> dict[str, Any] | None:
    if not week or not day_num:
        return None
    for d in week.get("days") or []:
        if int(d.get("day", 0)) == int(day_num):
            return d
    return None


def merge_week_day_context(
    week: dict[str, Any] | None,
    day: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not week:
        return None
    if not day:
        return dict(week)
    merged = dict(week)
    merged["day"] = day.get("day")
    merged["day_label"] = day.get("label")
    merged["day_theme"] = day.get("theme")
    merged["session_goal"] = day.get("session_goal")
    if day.get("focus"):
        merged["focus"] = day["focus"]
    if day.get("intensity"):
        merged["load"] = day["intensity"]
    return merged


def week_day_from_cycle(
    structure: dict[str, Any] | None,
    week_num: int | None,
    day_num: int | None,
    *,
    cycle_type: str | None = None,
    age_band: str | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    s = enrich_structure(structure, cycle_type=cycle_type, age_band=age_band)
    week = find_week(s.get("weeks") or [], week_num)
    day = find_day(week, day_num)
    return week, day
