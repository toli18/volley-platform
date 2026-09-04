"""Зарежда клубната методика (BG) за бъдещия AI помощник на треньора.

Данните са преработени принципи — не буквален превод на външни материали.
Годишната програма БФВ остава водеща; този пакет е втори слой.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parents[1] / "seed" / "data" / "coach_assistant_method_bg.json"


@lru_cache(maxsize=1)
def load_coach_assistant_method() -> dict[str, Any]:
    if not DATA_PATH.is_file():
        return {"version": "0", "principles": {}, "glossary": {}}
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def glossary() -> dict[str, str]:
    return dict(load_coach_assistant_method().get("glossary") or {})


def principles_flat(limit: int | None = None) -> list[str]:
    bundle = load_coach_assistant_method()
    out: list[str] = []
    for group in (bundle.get("principles") or {}).values():
        for item in group or []:
            s = str(item).strip()
            if s and s not in out:
                out.append(s)
    if limit is not None:
        return out[:limit]
    return out


def age_emphasis(age_band: str | None) -> list[str]:
    band = (age_band or "U16").strip()
    if band.lower() == "mini":
        key = "mini"
    else:
        key = band.upper()
    ages = load_coach_assistant_method().get("age_emphasis") or {}
    if key in ages:
        return list(ages[key])
    if key in {"U15"}:
        return list(ages.get("U16") or [])
    if key in {"U17"}:
        return list(ages.get("U18") or [])
    return list(ages.get("U14") or [])


def qa_cards() -> list[dict[str, str]]:
    return list(load_coach_assistant_method().get("assistant_qa_cards") or [])


def match_day_overrides() -> list[dict[str, Any]]:
    return list(load_coach_assistant_method().get("match_day_overrides") or [])


def physical_test_mapping() -> list[dict[str, str]]:
    block = load_coach_assistant_method().get("physical_from_tests") or {}
    return list(block.get("mapping") or [])


def assistant_system_context(age_band: str | None = None) -> dict[str, Any]:
    """Компактен контекст за чат/LLM помощник."""
    bundle = load_coach_assistant_method()
    return {
        "glossary": glossary(),
        "style": bundle.get("coach_assistant_style") or {},
        "principles": principles_flat(limit=24),
        "age_emphasis": age_emphasis(age_band),
        "qa_cards": qa_cards(),
        "game_phases": bundle.get("game_phases") or {},
        "integration": bundle.get("integration_hooks") or {},
    }
