"""Методически hub за треньори — структурирани секции."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import MethodGuideline
from app.seed.bvf_coaching_guidelines_bg import SKILL_LABELS
from app.seed.bvf_method_sections_bg import GROUPS, SECTIONS


def _section_index() -> dict[str, dict]:
    return {s["slug"]: s for s in SECTIONS}


def list_coach_hub(age_band: str = "U14") -> dict[str, Any]:
    groups_sorted = sorted(GROUPS, key=lambda g: g["sort"])
    sections_sorted = sorted(SECTIONS, key=lambda s: s["sort_order"])
    nav: list[dict] = []
    for g in groups_sorted:
        children = [
            {
                "slug": s["slug"],
                "title_bg": s["title_bg"],
                "subtitle_bg": s.get("subtitle_bg"),
            }
            for s in sections_sorted
            if s["group_id"] == g["id"]
        ]
        if children:
            nav.append({"id": g["id"], "title": g["title"], "sections": children})
    return {
        "title": "Методически насоки",
        "subtitle": "Професионални ресурси за волейболни треньори — по възраст и тема",
        "age_band": age_band,
        "groups": nav,
        "default_slug": "common-mistakes",
    }


def _guidelines_by_skill(db: Session, age_band: str) -> list[dict]:
    rows = (
        db.query(MethodGuideline)
        .filter(MethodGuideline.status == "published")
        .order_by(MethodGuideline.sort_order.asc())
        .all()
    )
    by_skill: dict[str, list] = {}
    for r in rows:
        if r.age_band not in (age_band, "all"):
            continue
        key = r.skill_element
        by_skill.setdefault(key, []).append(
            {"error": r.error_bg, "correction": r.correction_bg}
        )
    skills = []
    for skill, pairs in sorted(by_skill.items(), key=lambda x: (SKILL_LABELS.get(x[0], x[0]))):
        skills.append(
            {
                "name": SKILL_LABELS.get(skill, skill),
                "skill_key": skill,
                "pairs": pairs,
            }
        )
    return skills


def get_coach_section(db: Session, slug: str, age_band: str = "U14") -> dict[str, Any] | None:
    spec = _section_index().get(slug)
    if not spec:
        return None
    out: dict[str, Any] = {
        "slug": slug,
        "title_bg": spec["title_bg"],
        "subtitle_bg": spec.get("subtitle_bg"),
        "group_id": spec["group_id"],
        "layout": spec.get("layout", "bullet_sections"),
        "age_band": age_band,
    }
    if spec.get("intro"):
        out["intro"] = spec["intro"]
    if spec.get("layout") == "skill_errors" or spec.get("dynamic_guidelines"):
        out["skills"] = _guidelines_by_skill(db, age_band)
    if spec.get("blocks"):
        blocks = spec["blocks"]
        if spec.get("age_filter"):
            match = [b for b in blocks if b.get("age_key") == age_band]
            if not match:
                match = [b for b in blocks if b.get("age_key") == "U14"]
            out["blocks"] = match
        else:
            out["blocks"] = blocks
    if spec.get("numbered_steps"):
        out["numbered_steps"] = spec["numbered_steps"]
    if spec.get("layout") == "cta_cycles":
        out["cta_path"] = "/national-library"
        out["cta_label"] = "Отвори цикли БФВ и AI генератор"
    return out
