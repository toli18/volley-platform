"""
Прилага volley_coach_guidelines_import.json към seed модулите (без regex patch).

  python -m app.scripts.apply_volley_coach_import
  python -m app.scripts.apply_volley_coach_import --fetch
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

IMPORT_JSON = BACKEND / "app" / "seed" / "data" / "volley_coach_guidelines_import.json"
GUIDELINES_PY = BACKEND / "app" / "seed" / "bvf_coaching_guidelines_bg.py"
SECTIONS_PY = BACKEND / "app" / "seed" / "bvf_method_sections_bg.py"

ICON_BY_TITLE = {
    "основно": "set",
    "долно": "pass",
    "атакуващ": "attack",
    "блок": "block",
}


def _py_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _age_key(label: str) -> str:
    if "8-12" in label or "8–12" in label:
        return "U13"
    if "13-16" in label or "13–16" in label:
        return "U14"
    if "17+" in label:
        return "U18"
    return "U14"


def _icon_for_title(title: str) -> str | None:
    t = title.lower()
    for k, v in ICON_BY_TITLE.items():
        if k in t:
            return v
    return None


def _render_guidelines(guidelines: list[dict]) -> str:
    lines = ["GUIDELINES: list[dict] = ["]
    for g in guidelines:
        lines.append("    {")
        lines.append(f'        "skill_element": {_py_str(g["skill_element"])},')
        lines.append(f'        "error_bg": {_py_str(g["error_bg"])},')
        lines.append(f'        "correction_bg": {_py_str(g["correction_bg"])},')
        lines.append(f'        "sort_order": {g["sort_order"]},')
        lines.append("    },")
    lines.append("]")
    return "\n".join(lines)


def _render_block(block: dict, indent: int = 12) -> list[str]:
    sp = " " * indent
    lines = [f"{sp}{{"]
    order = [
        "title",
        "icon",
        "label",
        "age_key",
        "body",
        "steps",
        "focus",
        "method",
        "tasks",
        "skills",
        "tips",
        "bullets",
    ]
    keys = [k for k in order if k in block] + [k for k in block if k not in order]
    for key in keys:
        val = block[key]
        if isinstance(val, str):
            lines.append(f'{sp}    "{key}": {_py_str(val)},')
        elif isinstance(val, list):
            if not val:
                lines.append(f'{sp}    "{key}": [],')
            else:
                lines.append(f'{sp}    "{key}": [')
                for item in val:
                    lines.append(f"{sp}        {_py_str(item)},")
                lines.append(f"{sp}    ],")
    lines.append(f"{sp}}},")
    return lines


def _render_section(sec: dict) -> list[str]:
    lines = ["    {"]
    field_order = [
        "slug",
        "title_bg",
        "subtitle_bg",
        "group_id",
        "sort_order",
        "layout",
        "dynamic_guidelines",
        "age_filter",
        "intro",
        "blocks",
        "numbered_steps",
    ]
    for key in field_order:
        if key not in sec:
            continue
        val = sec[key]
        if key == "blocks" and val:
            lines.append('        "blocks": [')
            layout = sec.get("layout", "")
            for block in val:
                lines.extend(_render_block(block, 12))
            lines.append("        ],")
        elif key == "numbered_steps" and val:
            lines.append('        "numbered_steps": [')
            for step in val:
                lines.append(f"            {_py_str(step)},")
            lines.append("        ],")
        elif isinstance(val, str):
            lines.append(f'        "{key}": {_py_str(val)},')
        elif isinstance(val, bool):
            lines.append(f'        "{key}": {"True" if val else "False"},')
        elif isinstance(val, int):
            lines.append(f'        "{key}": {val},')
    lines.append("    },")
    return lines


def _merge_import_into_sections(sections: list[dict], bundle: dict) -> list[dict]:
    plat = {s.get("platform_slug", s["slug"]): s for s in bundle["sections"]}
    out = []
    for sec in sections:
        slug = sec["slug"]
        imp = plat.get(slug)
        if not imp or not imp.get("blocks") and not imp.get("numbered_steps"):
            out.append(sec)
            continue
        if sec.get("layout") == "cta_cycles":
            out.append(sec)
            continue
        merged = dict(sec)
        if imp.get("blocks"):
            blocks = []
            for b in imp["blocks"]:
                nb = dict(b)
                if merged.get("layout") == "step_cards":
                    ic = _icon_for_title(nb.get("title", ""))
                    if ic:
                        nb["icon"] = ic
                if merged.get("layout") == "age_bands" and "age_key" not in nb:
                    nb["age_key"] = _age_key(nb.get("label", ""))
                blocks.append(nb)
            merged["blocks"] = blocks
        if imp.get("numbered_steps"):
            merged["numbered_steps"] = imp["numbered_steps"]
        out.append(merged)
    return out


def _write_sections_py(sections: list[dict]) -> None:
    header = '''"""
Структурирани методически секции за треньори (UI hub).
Съдържание на български — за залата, не за четене на статии.
Импорт от Volley Coach live (volley-coach.netlify.app).
"""

from __future__ import annotations

GROUPS = [
    {"id": "technique", "title": "Техника", "sort": 1},
    {"id": "teaching", "title": "Обучение", "sort": 2},
    {"id": "planning", "title": "Планиране и тактика", "sort": 3},
    {"id": "support", "title": "Подкрепа на състезателя", "sort": 4},
]

SECTIONS: list[dict] = [
'''
    body = []
    for sec in sections:
        body.extend(_render_section(sec))
    footer = "]\n"
    SECTIONS_PY.write_text(header + "\n".join(body) + footer, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()

    if args.fetch:
        from app.scripts.volley_coach_extract import write_import_json

        bundle = write_import_json()
    else:
        bundle = json.loads(IMPORT_JSON.read_text(encoding="utf-8"))

    from app.scripts.volley_coach_extract import guidelines_from_skills
    from app.seed import bvf_method_sections_bg as mod

    mistakes = next((s for s in bundle["sections"] if s["slug"] == "common-mistakes"), None)
    if mistakes and mistakes.get("skills"):
        gtext = GUIDELINES_PY.read_text(encoding="utf-8")
        new_g = _render_guidelines(guidelines_from_skills(mistakes["skills"]))
        gtext = re.sub(r"GUIDELINES: list\[dict\] = \[.*?\n\]", new_g, gtext, count=1, flags=re.DOTALL)
        GUIDELINES_PY.write_text(gtext, encoding="utf-8")
        print("Updated GUIDELINES")

    merged = _merge_import_into_sections(mod.SECTIONS, bundle)
    _write_sections_py(merged)
    print("Rewrote bvf_method_sections_bg.py")


if __name__ == "__main__":
    main()
