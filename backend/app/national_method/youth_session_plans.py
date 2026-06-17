"""Извличане на вградени MINI/U13 конспекти от chapter body → session_plan секции."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.national_method.textbook_parser import slugify
from app.national_method.mini_sast_plans import all_mini_sast_plans

TEXTBOOK_JSON = Path(__file__).resolve().parents[1] / "seed" / "data" / "bvf_textbook_bg.json"

EMBEDDED_SESSION_RE = re.compile(
    r"^(MINI|U13|U14)-(ПОДГ|СЪСТ)-(\d{1,2})\s*:?\s*(.*)$",
    re.MULTILINE | re.IGNORECASE,
)


def _normalize_band(raw: str) -> str:
    b = (raw or "").strip().upper()
    if b == "MINI":
        return "mini"
    return b


def extract_sessions_from_body(body: str, default_band: str) -> list[dict[str, Any]]:
    """Разделя body на отделни конспекти по редове MINI-ПОДГ-01 / U13-СЪСТ-02 …"""
    if not body or not EMBEDDED_SESSION_RE.search(body):
        return []
    matches = list(EMBEDDED_SESSION_RE.finditer(body))
    out: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        band_raw, phase, num, title_rest = m.groups()
        band = _normalize_band(band_raw or default_band)
        phase_up = phase.upper()
        code = f"{band_raw.upper()}-{phase_up}-{num.zfill(2)}"
        title_suffix = (title_rest or "").strip() or code
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        chunk = body[start:end].strip()
        if chunk.startswith(":"):
            chunk = chunk[1:].strip()
        body_bg = chunk
        if not body_bg:
            body_bg = title_suffix
        out.append(
            {
                "code": code,
                "band": band,
                "phase": phase_up,
                "title_bg": f"{code}: {title_suffix}",
                "body_bg": body_bg,
            }
        )
    return out


def _section_row(item: dict[str, Any], sort_order: int, part: str = "session_plans") -> dict[str, Any]:
    slug = slugify(item["code"])
    body = item["body_bg"]
    return {
        "slug": slug,
        "title_bg": item["title_bg"],
        "body_bg": body,
        "category": "session_plan",
        "age_band": item["band"],
        "kind": "session_plan",
        "part": part,
        "sort_order": sort_order,
        "session_code": item["code"],
        "session_phase": item["phase"],
        "summary_bg": body[:280].replace("\n", " ") + ("…" if len(body) > 280 else ""),
    }


def build_u13_from_u14(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """U13 конспекти — същата структура като U14, по-лек акцент (учебник: U13/U14 глава)."""
    out: list[dict[str, Any]] = []
    for sec in sections:
        if sec.get("kind") != "session_plan" or sec.get("age_band") != "U14":
            continue
        code = str(sec.get("session_code") or "")
        if not code.startswith("U14-"):
            continue
        u13_code = "U13-" + code[4:]
        body = sec.get("body_bg") or ""
        note = (
            "U13 (12–13 г.): универсално обучение без специализация по постове. "
            "По-леко натоварване и акцент върху биомеханика на скок/приземяване.\n\n"
        )
        out.append(
            {
                "code": u13_code,
                "band": "U13",
                "phase": sec.get("session_phase") or "ПОДГ",
                "title_bg": sec.get("title_bg", u13_code).replace("U14-", "U13-", 1),
                "body_bg": note + body,
            }
        )
    return out


def upsert_mini_sast_plans(sections: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Заменя/добавя всички MINI-СЪСТ-01…20 като отделни session_plan секции."""
    plans = all_mini_sast_plans()
    if not plans:
        return sections, 0

    codes = {p["code"] for p in plans}
    sections = [s for s in sections if s.get("session_code") not in codes]
    max_sort = max((s.get("sort_order") or 0 for s in sections), default=0)
    added = 0

    for item in plans:
        max_sort += 1
        sections.append(_section_row(item, max_sort))
        added += 1

    # Премахни placeholder текста от chapter bodies
    for sec in sections:
        if sec.get("slug") in (
            "vazrastova-grupa-mini-volenbol-8-10-godini",
            "mini-sast-01",
        ):
            body = sec.get("body_bg") or ""
            if "...[Следват детайлни планове MINI-СЪСТ" in body:
                sec["body_bg"] = body.split("...[Следват детайлни планове MINI-СЪСТ")[0].strip()

    return sections, added


def merge_youth_session_plans(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    sections: list[dict[str, Any]] = list(data.get("sections") or [])
    existing_codes = {s.get("session_code") for s in sections if s.get("session_code")}
    max_sort = max((s.get("sort_order") or 0 for s in sections), default=0)
    added = 0

    source_slugs = (
        "mini-volenbol-8-10-godini",
        "vazrastova-grupa-mini-volenbol-8-10-godini",
    )
    for slug in source_slugs:
        chapter = next((s for s in sections if s.get("slug") == slug), None)
        if not chapter:
            continue
        for item in extract_sessions_from_body(chapter.get("body_bg") or "", "mini"):
            if item["code"] in existing_codes:
                continue
            max_sort += 1
            sections.append(_section_row(item, max_sort))
            existing_codes.add(item["code"])
            added += 1

    u13_items = build_u13_from_u14(sections)
    for item in u13_items:
        if item["code"] in existing_codes:
            continue
        max_sort += 1
        sections.append(_section_row(item, max_sort))
        existing_codes.add(item["code"])
        added += 1

    # U13/U14 глава → age_band U13 за филтъра
    for sec in sections:
        if sec.get("slug") == "vazrastova-grupa-under-13-under-14-u13-u14":
            sec["age_band"] = "U13"

    sections, sast_added = upsert_mini_sast_plans(sections)
    added += sast_added

    data["sections"] = sections
    data["section_count"] = len(sections)
    stats = {
        "added": added,
        "mini_plans": sum(1 for s in sections if s.get("age_band") == "mini" and s.get("kind") == "session_plan"),
        "mini_sast_plans": sum(
            1
            for s in sections
            if s.get("age_band") == "mini"
            and s.get("kind") == "session_plan"
            and str(s.get("session_code") or "").startswith("MINI-СЪСТ")
        ),
        "u13_plans": sum(1 for s in sections if s.get("age_band") == "U13" and s.get("kind") == "session_plan"),
    }
    return data, stats


def patch_textbook_json(path: Path | None = None) -> dict[str, int]:
    p = path or TEXTBOOK_JSON
    data = json.loads(p.read_text(encoding="utf-8"))
    data, stats = merge_youth_session_plans(data)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return stats
