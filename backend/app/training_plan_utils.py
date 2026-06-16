"""Нормализация на training.plan — поддържа legacy [id] и enriched [{drillId, minutes}]."""
from __future__ import annotations

from typing import Any


def normalize_plan_item(raw: Any, default_minutes: int = 10) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        did_raw = raw.get("drillId") or raw.get("drill_id") or raw.get("id")
        if isinstance(did_raw, dict):
            did_raw = did_raw.get("drillId") or did_raw.get("drill_id") or did_raw.get("id")
        try:
            did = int(did_raw or 0)
        except (TypeError, ValueError):
            return None
        if did <= 0:
            return None
        try:
            mins = int(raw.get("minutes") or default_minutes)
        except (TypeError, ValueError):
            mins = default_minutes
        return {
            "drillId": did,
            "minutes": max(3, mins),
            "coachNote": str(raw.get("coachNote") or raw.get("coach_note") or ""),
        }
    try:
        did = int(raw)
    except (TypeError, ValueError):
        return None
    if did <= 0:
        return None
    return {"drillId": did, "minutes": max(3, default_minutes), "coachNote": ""}


def normalize_plan(plan: Any, default_minutes: int = 10) -> dict[str, list[dict[str, Any]]]:
    if not plan or not isinstance(plan, dict):
        return {}
    out: dict[str, list[dict[str, Any]]] = {}
    for key, arr in plan.items():
        if not key or arr is None:
            continue
        if not isinstance(arr, list):
            continue
        cleaned: list[dict[str, Any]] = []
        for x in arr:
            item = normalize_plan_item(x, default_minutes=default_minutes)
            if item:
                cleaned.append(item)
        if cleaned:
            out[str(key)] = cleaned
    return out


def plan_drill_ids(plan: Any) -> set[int]:
    ids: set[int] = set()
    for items in normalize_plan(plan).values():
        for item in items:
            ids.add(int(item["drillId"]))
    return ids


def plan_to_legacy_ids(plan: Any) -> dict[str, list[int]]:
    """За backward compat — само ID списъци."""
    return {k: [int(x["drillId"]) for x in v] for k, v in normalize_plan(plan).items()}
