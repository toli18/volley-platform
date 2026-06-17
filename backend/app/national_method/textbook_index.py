"""Индекс, търсене и връзки между секциите на учебника БФВ."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import MethodArticle
from app.national_method.textbook_parser import _part_label

JSON_PATH = Path(__file__).resolve().parents[1] / "seed" / "data" / "bvf_textbook_bg.json"

CATEGORY_LABELS = {
    "methodology": "Методика",
    "principles": "Принципи",
    "periodization": "Периодизация",
    "planning": "Планиране",
    "technique": "Техника",
    "tactics": "Тактика",
    "physical": "Физическа подготовка",
    "psychology": "Психология",
    "session_plan": "План-конспект",
}

TIME_BLOCK_RE = re.compile(
    r"^\*?\s*(\d{2}:\d{2})-(\d{2}:\d{2})\s*\|\s*(.+)$",
    re.MULTILINE,
)
TRAINING_DAY_RE = re.compile(
    r"^Тренировка\s+(\d+)\s*\(([^)]+)\)\s*:\s*(.+)$",
    re.MULTILINE | re.IGNORECASE,
)


@lru_cache(maxsize=1)
def load_bundle() -> dict[str, Any]:
    if not JSON_PATH.is_file():
        return {"sections": [], "navigation": [], "section_count": 0}
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def clear_bundle_cache() -> None:
    load_bundle.cache_clear()


def _card(sec: dict[str, Any]) -> dict[str, Any]:
    return {
        "slug": sec["slug"],
        "title_bg": sec["title_bg"],
        "summary_bg": sec.get("summary_bg"),
        "category": sec.get("category"),
        "category_label": CATEGORY_LABELS.get(sec.get("category") or "", sec.get("category")),
        "age_band": sec.get("age_band") or "all",
        "kind": sec.get("kind") or "chapter",
        "part": sec.get("part"),
        "part_label": _part_label(sec.get("part") or "methodology"),
        "session_code": sec.get("session_code"),
        "session_phase": sec.get("session_phase"),
        "sort_order": sec.get("sort_order") or 0,
    }


def _related_slugs(sec: dict[str, Any], all_sections: list[dict[str, Any]]) -> list[str]:
    slug = sec["slug"]
    part = sec.get("part")
    age = sec.get("age_band") or "all"
    kind = sec.get("kind")
    related: list[str] = []

    if kind == "session_plan" and age != "all":
        for s in all_sections:
            if s["slug"] == slug:
                continue
            if s.get("category") == "periodization" or s.get("part") == "periodization":
                if related.count(s["slug"]) == 0:
                    related.append(s["slug"])
                if len(related) >= 2:
                    break

    for s in all_sections:
        if s["slug"] == slug:
            continue
        if s.get("part") == part and len(related) < 5:
            related.append(s["slug"])
        if kind != "session_plan" and s.get("kind") == "session_plan":
            if age != "all" and s.get("age_band") == age and len(related) < 6:
                related.append(s["slug"])

    out: list[str] = []
    for rs in related:
        if rs not in out and rs != slug:
            out.append(rs)
    return out[:8]


def enrich_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(sections, key=lambda s: int(s.get("sort_order") or 0))
    by_slug = {s["slug"]: s for s in ordered}
    enriched = []
    for i, sec in enumerate(ordered):
        row = dict(sec)
        row["prev_slug"] = ordered[i - 1]["slug"] if i > 0 else None
        row["next_slug"] = ordered[i + 1]["slug"] if i + 1 < len(ordered) else None
        row["related_slugs"] = _related_slugs(sec, ordered)
        row["category_label"] = CATEGORY_LABELS.get(sec.get("category") or "", sec.get("category"))
        row["part_label"] = _part_label(sec.get("part") or "methodology")
        enriched.append(row)
    return enriched


def parse_session_blocks(body: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    if not body:
        return blocks
    for line in body.split("\n"):
        s = line.strip()
        if not s:
            continue
        tm = TIME_BLOCK_RE.match(s)
        if tm:
            blocks.append(
                {
                    "type": "time_block",
                    "start": tm.group(1),
                    "end": tm.group(2),
                    "label": tm.group(3).strip(),
                }
            )
            continue
        dm = TRAINING_DAY_RE.match(s)
        if dm:
            blocks.append(
                {
                    "type": "training_day",
                    "day_num": int(dm.group(1)),
                    "weekday": dm.group(2).strip(),
                    "label": dm.group(3).strip(),
                }
            )
    return blocks


def split_body_paragraphs(body: str) -> list[str]:
    if not body:
        return []
    parts = re.split(r"\n\s*\n", body.replace("\r", ""))
    out = []
    for p in parts:
        chunk = p.strip()
        if not chunk:
            continue
        if TIME_BLOCK_RE.match(chunk) or TRAINING_DAY_RE.match(chunk):
            continue
        lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
        if len(lines) == 1:
            out.append(lines[0])
        else:
            out.extend(lines)
    return out


def search_sections(
    q: str = "",
    *,
    age_band: str | None = None,
    part: str | None = None,
    category: str | None = None,
    kind: str | None = None,
) -> list[dict[str, Any]]:
    bundle = load_bundle()
    sections = enrich_sections(bundle.get("sections") or [])
    query = (q or "").strip().lower()
    out = []
    for sec in sections:
        if age_band and age_band != "all" and sec.get("age_band") not in (age_band, "all"):
            continue
        if part and sec.get("part") != part:
            continue
        if category and sec.get("category") != category:
            continue
        if kind and sec.get("kind") != kind:
            continue
        if query:
            blob = " ".join(
                [
                    sec.get("title_bg") or "",
                    sec.get("summary_bg") or "",
                    (sec.get("body_bg") or "")[:2000],
                    sec.get("session_code") or "",
                ]
            ).lower()
            if query not in blob:
                continue
        out.append(_card(sec))
    return out


def get_section(slug: str, db: Session | None = None) -> dict[str, Any] | None:
    bundle = load_bundle()
    sections = enrich_sections(bundle.get("sections") or [])
    sec = next((s for s in sections if s["slug"] == slug), None)
    if not sec:
        return None

    body = sec.get("body_bg") or ""
    if db:
        row = (
            db.query(MethodArticle)
            .filter(MethodArticle.content_origin == "textbook", MethodArticle.series == slug)
            .first()
        )
        if row and row.body_bg:
            body = row.body_bg

    by_slug = {s["slug"]: s for s in sections}
    related = [_card(by_slug[rs]) for rs in sec.get("related_slugs") or [] if rs in by_slug]

    from app.national_method.annual_program import annual_links_for_textbook_slug

    annual_links = annual_links_for_textbook_slug(slug) if sec.get("kind") == "session_plan" else []

    return {
        **_card(sec),
        "body_bg": body,
        "paragraphs": split_body_paragraphs(body),
        "session_blocks": parse_session_blocks(body) if sec.get("kind") == "session_plan" else [],
        "prev_slug": sec.get("prev_slug"),
        "next_slug": sec.get("next_slug"),
        "prev_title": by_slug[sec["prev_slug"]]["title_bg"] if sec.get("prev_slug") in by_slug else None,
        "next_title": by_slug[sec["next_slug"]]["title_bg"] if sec.get("next_slug") in by_slug else None,
        "related": related,
        "annual_links": annual_links,
        "ai_params": {
            "ageBand": sec.get("age_band") if sec.get("age_band") != "all" else "U14",
            "textbookSlug": slug,
            "sessionCode": sec.get("session_code"),
        },
    }


def textbook_navigation() -> dict[str, Any]:
    bundle = load_bundle()
    sections = enrich_sections(bundle.get("sections") or [])
    nav = bundle.get("navigation") or []
    if nav:
        by_slug = {s["slug"]: _card(s) for s in sections}
        enriched_nav = []
        for group in nav:
            enriched_nav.append(
                {
                    "id": group.get("id"),
                    "title": group.get("title"),
                    "sections": [
                        by_slug.get(s["slug"], s)
                        for s in group.get("sections") or []
                        if s.get("slug") in by_slug or s.get("slug")
                    ],
                }
            )
        nav = enriched_nav

    session_plans = [_card(s) for s in sections if s.get("kind") == "session_plan"]
    by_age: dict[str, list] = {}
    for sp in session_plans:
        band = sp.get("age_band") or "all"
        by_age.setdefault(band, []).append(sp)

    return {
        "title": "Учебник БФВ",
        "subtitle": "Официална методика — периодизация, техника, тактика и план-конспекти",
        "source": "bvf-textbook-bg",
        "section_count": len(sections),
        "navigation": nav,
        "session_plans_by_age": by_age,
        "filters": {
            "parts": [{"id": p, "label": _part_label(p)} for p in sorted({s.get("part") for s in sections if s.get("part")})],
            "categories": [{"id": k, "label": v} for k, v in CATEGORY_LABELS.items()],
            "age_bands": ["mini", "U13", "U14", "U15", "U16", "U17", "U18", "all"],
        },
    }


def slug_for_session_code(session_code: str | None) -> str | None:
    """Намира slug на план-конспект по код (напр. MINI-СЪСТ-05)."""
    code = (session_code or "").strip().upper()
    if not code:
        return None
    sections = enrich_sections(load_bundle().get("sections") or [])
    for sec in sections:
        sc = (sec.get("session_code") or "").strip().upper()
        if sc and sc == code:
            return sec["slug"]
    return None


def resolve_textbook_for_ai(
    slug: str | None = None,
    session_code: str | None = None,
    db: Session | None = None,
) -> dict[str, Any] | None:
    """Резолвира учебен контекст по slug и/или session_code (кодът има приоритет)."""
    resolved_slug = (slug or "").strip() or None
    code_slug = slug_for_session_code(session_code)
    if code_slug:
        resolved_slug = code_slug
    if not resolved_slug:
        return None
    return textbook_context_for_ai(resolved_slug, db)


def textbook_context_for_ai(slug: str | None, db: Session | None = None) -> dict[str, Any] | None:
    if not slug:
        return None
    detail = get_section(slug, db)
    if not detail:
        return None
    cues = []
    if detail.get("session_code"):
        cues.append(f"Конспект: {detail['session_code']}")
    for block in (detail.get("session_blocks") or [])[:4]:
        if block.get("type") == "time_block":
            cues.append(f"{block['start']}-{block['end']}: {block['label'][:80]}")
        elif block.get("type") == "training_day":
            cues.append(f"Тр.{block['day_num']} ({block['weekday']}): {block['label'][:80]}")
    summary = detail.get("summary_bg") or ""
    return {
        "slug": slug,
        "title": detail.get("title_bg"),
        "summary": summary[:400],
        "session_code": detail.get("session_code"),
        "kind": detail.get("kind"),
        "category": detail.get("category"),
        "age_band": detail.get("age_band"),
        "session_blocks": detail.get("session_blocks") or [],
        "coach_cues": cues[:6],
    }
