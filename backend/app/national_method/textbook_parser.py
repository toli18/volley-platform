"""Парсване на учебника БФВ (plain text) → секции за библиотека и AI."""

from __future__ import annotations

import re
from typing import Any

SESSION_CODE_RE = re.compile(
    r"^(MINI|U\d{2})-(ПОДГ|СЪСТ)-(\d{1,2})\s*:?\s*(.*)$",
    re.IGNORECASE,
)
PAGE_MARKER_RE = re.compile(r"^(стр\.|Стр\.)\s*\d+", re.IGNORECASE)
SEPARATOR_RE = re.compile(r"^_{5,}\s*$")

TOP_LEVEL_PARTS = (
    "ОСНОВИ НА ОБУЧЕНИЕТО И ТРЕНИРОВКАТА ПО ВОЛЕЙБОЛ",
    "ПРИНЦИПИ, СРЕДСТВА И МЕТОДИ НА ОБУЧЕНИЕ И ТРЕНИРОВКА",
    "СЪДЪРЖАНИЕ НА УЧЕБНО-ТРЕНИРОВЪЧНИЯ ПРОЦЕС",
    "ПОСТРОЯВАНЕ НА ТРЕНИРОВЪЧНИЯ ПРОЦЕС ПО ВОЛЕЙБОЛ",
)


def slugify(title: str, max_len: int = 80) -> str:
    s = title.strip().lower()
    s = s.replace("–", "-").replace("—", "-")
    tr = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh",
        "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
        "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
        "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sht", "ъ": "a", "ь": "",
        "ю": "yu", "я": "ya",
    }
    out = []
    for ch in s:
        if ch in tr:
            out.append(tr[ch])
        elif ch.isalnum():
            out.append(ch)
        elif ch in "-_":
            out.append("-")
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug[:max_len] or "section"


def _infer_age_band(title: str, code: str | None = None) -> str:
    blob = f"{title} {code or ''}".upper()
    for band in ("U18", "U17", "U16", "U15", "U14", "U13"):
        if band in blob:
            return band
    if "МИНИ" in blob or "8-10" in blob or "8–10" in blob:
        return "mini"
    return "all"


def _infer_category(title: str, kind: str) -> str:
    t = title.upper()
    if kind == "session_plan":
        return "session_plan"
    if any(k in t for k in ("ПЕРИОДИЗАЦ", "МАКРО", "МЕЗО", "МИКРО", "ГОДИШЕН ПЛАН")):
        return "periodization"
    if "ПЛАН-КОНСПЕКТ" in t or "КОНСПЕКТ" in t:
        return "planning"
    if "ТЕХНИЧ" in t:
        return "technique"
    if "ТАКТИЧ" in t:
        return "tactics"
    if "ФИЗИЧ" in t:
        return "physical"
    if "ПСИХОЛ" in t:
        return "psychology"
    if "ПРИНЦИП" in t or "МЕТОД" in t:
        return "principles"
    return "methodology"


def _is_heading(line: str) -> bool:
    s = line.strip()
    if len(s) < 12 or len(s) > 220:
        return False
    if PAGE_MARKER_RE.match(s):
        return False
    if SESSION_CODE_RE.match(s):
        return False
    if SEPARATOR_RE.match(s):
        return False
    if s in TOP_LEVEL_PARTS:
        return True
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 10:
        return False
    upper = sum(1 for c in s if c.isupper())
    if upper / max(len(s.replace(" ", "")), 1) >= 0.65:
        return True
    if s.isupper() and len(s) >= 15:
        return True
    return False


def _part_for_title(title: str) -> str:
    t = title.upper()
    if "ПЕРИОДИЗАЦ" in t or "ПЛАНИРАНЕ" in t or "ПОСТРОЯВАНЕ" in t:
        return "periodization"
    if "ТЕХНИЧ" in t:
        return "technique"
    if "ТАКТИЧ" in t:
        return "tactics"
    if "ФИЗИЧ" in t:
        return "physical"
    if "ПСИХОЛ" in t:
        return "psychology"
    if "ПРИНЦИП" in t or "МЕТОД" in t or "ОСНОВИ" in t:
        return "fundamentals"
    if SESSION_CODE_RE.match(title):
        return "session_plans"
    return "methodology"


def parse_textbook(text: str) -> dict[str, Any]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    sections: list[dict[str, Any]] = []
    current_title: str | None = None
    current_lines: list[str] = []
    current_kind = "chapter"
    current_meta: dict[str, Any] = {}
    part_stack: list[str] = ["fundamentals"]
    sort_order = 0
    used_slugs: set[str] = set()

    def flush() -> None:
        nonlocal sort_order, current_title, current_lines, current_kind, current_meta
        if not current_title:
            current_lines = []
            return
        body = "\n".join(ln for ln in current_lines if ln.strip()).strip()
        if len(body) < 40 and current_kind != "session_plan":
            current_lines = []
            return
        base_slug = slugify(current_meta.get("code") or current_title)
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{n}"
            n += 1
        used_slugs.add(slug)
        sort_order += 1
        age = current_meta.get("age_band") or _infer_age_band(current_title, current_meta.get("code"))
        sections.append(
            {
                "slug": slug,
                "title_bg": current_title.strip(),
                "body_bg": body,
                "category": _infer_category(current_title, current_kind),
                "age_band": age,
                "kind": current_kind,
                "part": part_stack[-1] if part_stack else "methodology",
                "sort_order": sort_order,
                "session_code": current_meta.get("code"),
                "session_phase": current_meta.get("phase"),
                "summary_bg": body[:280].replace("\n", " ") + ("…" if len(body) > 280 else ""),
            }
        )
        current_lines = []
        current_meta = {}

    for raw in lines:
        line = raw.rstrip()
        if SEPARATOR_RE.match(line.strip()):
            continue
        if PAGE_MARKER_RE.match(line.strip()):
            continue

        sess = SESSION_CODE_RE.match(line.strip())
        if sess:
            flush()
            band_raw, phase, num, rest = sess.groups()
            band = band_raw.upper()
            if band == "MINI":
                band = "mini"
            phase_up = phase.upper()
            code = f"{band_raw.upper()}-{phase_up}-{num.zfill(2)}"
            title = rest.strip() or code
            current_title = f"{code}: {title}"
            current_kind = "session_plan"
            current_meta = {"code": code, "phase": phase_up, "age_band": band}
            continue

        if _is_heading(line):
            flush()
            title = line.strip()
            current_title = title
            current_kind = "chapter"
            part = _part_for_title(title)
            if title in TOP_LEVEL_PARTS or title.upper() in TOP_LEVEL_PARTS:
                part_stack = [part]
            elif len(part_stack) == 1:
                part_stack.append(part)
            else:
                part_stack[-1] = part
            continue

        if current_title:
            current_lines.append(line)

    flush()

    nav: list[dict[str, Any]] = []
    parts_seen: dict[str, dict] = {}
    for s in sections:
        pid = s["part"]
        if pid not in parts_seen:
            parts_seen[pid] = {
                "id": pid,
                "title": _part_label(pid),
                "sections": [],
            }
            nav.append(parts_seen[pid])
        parts_seen[pid]["sections"].append(
            {
                "slug": s["slug"],
                "title_bg": s["title_bg"],
                "category": s["category"],
                "age_band": s["age_band"],
                "kind": s["kind"],
            }
        )

    return {
        "version": "1.0.0",
        "source": "bvf-textbook-bg",
        "section_count": len(sections),
        "sections": sections,
        "navigation": nav,
    }


def _part_label(part_id: str) -> str:
    return {
        "fundamentals": "Основи и принципи",
        "methodology": "Методика",
        "physical": "Физическа подготовка",
        "technique": "Техническа подготовка",
        "tactics": "Тактическа подготовка",
        "psychology": "Психологическа подготовка",
        "periodization": "Периодизация и планиране",
        "session_plans": "План-конспекти",
    }.get(part_id, part_id)
