"""
Извличане на структурирано съдържание от live Volley Coach SPA bundle.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

BASE = "https://volley-coach.netlify.app"

SLUG_TO_COMP = {
    "teaching-methods": "RP",
    "setter-training": "JP",
    "age-specific": "DP",
    "position-specific": "HP",
    "psychological": "MP",
    "injury-prevention": "VP",
    "training-periodization": "GP",
    "tactical-schemes": "OP",
    "tactical-analysis": "KP",
    "talent-selection": "WP",
    "scientific-physical": "XP",
}

# Volley Coach slug -> платформа БФВ (bvf_method_sections_bg)
SLUG_PLATFORM = {
    "proper-technique": "correct-technique",
    "age-specific": "age-specifics",
    "position-specific": "position-specifics",
    "psychological": "psychology",
    "training-periodization": "periodization",
}


def _strip_emoji(text: str) -> str:
    return re.sub(r"[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]+", "", text).strip()


def _jsx_text(fragment: str) -> str:
    """Текст след JSX children marker (поддръжка на ' и \")."""
    s = fragment.strip()
    if s.startswith(","):
        s = s[1:].strip()
    if s.startswith('"'):
        m = re.match(r'"((?:[^"\\]|\\.)*)"\s*,?', s)
        if m:
            return m.group(1).replace('\\"', '"').strip()
    if s.startswith("'"):
        m = re.match(r"'((?:[^'\\]|\\.)*)'\s*,?", s)
        if m:
            return m.group(1).replace("\\'", "'").strip()
    return s.strip('",\'').strip()


def fetch_bundle() -> str:
    html = httpx.get(f"{BASE}/guidelines", timeout=60).text
    m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    if not m:
        raise RuntimeError("Cannot find JS bundle")
    return httpx.get(BASE + m.group(1), timeout=120).text


def _function_body(js: str, name: str) -> str:
    m = re.search(rf"function {name}\(\)", js)
    if not m:
        return ""
    nxt = re.search(r"function [A-Z][A-Za-z0-9_$]*\(\)", js[m.end() :])
    end = m.end() + nxt.start() if nxt else m.end() + 100000
    return js[m.start() : end]


def parse_mistakes(jp: str) -> list[dict]:
    skills = []
    item_re = re.compile(
        r'mistake-item",children:\[a\.jsx\("strong",\{children:"Грешка:"\}\),'
        r"(.*?),a\.jsxs\(\"div\",\{className:\"correction\",children:\[a\.jsx\(\"strong\","
        r'\{children:"Корекция:"\}\),(.*?)\]\}\)\]\}\)',
        re.DOTALL,
    )
    for part in jp.split('className:"mistake-card"')[1:]:
        hm = re.search(r'h3",\{children:"([^"]+)"\}', part)
        title = _strip_emoji(hm.group(1)) if hm else "Общо"
        pairs = []
        for err_frag, corr_frag in item_re.findall(part):
            pairs.append(
                {
                    "error": _jsx_text(err_frag),
                    "correction": _jsx_text(corr_frag),
                }
            )
        if pairs:
            skills.append({"name": title, "pairs": pairs})
    return skills


def parse_technique(body: str) -> list[dict]:
    blocks = []
    step_re = re.compile(
        r'a\.jsx\("strong",\{children:"([^"]+)"\}\),\s*"((?:[^"\\]|\\.)*)"',
    )
    for part in body.split('className:"technique-card"')[1:]:
        hm = re.search(r'h3",\{children:"([^"]+)"\}', part)
        title = _strip_emoji(hm.group(1)) if hm else ""
        steps = []
        for label, text in step_re.findall(part):
            steps.append(f"{label.rstrip(':')}: {text.replace(chr(92)+chr(34), chr(34)).strip()}")
        if title and steps:
            blocks.append({"title": title, "steps": steps})
    return blocks


def parse_principles(body: str) -> tuple[list[dict], list[str]]:
    blocks = []
    for part in body.split('className:"principle-item"')[1:]:
        h4 = re.search(r'h4",\{children:"([^"]+)"\}', part)
        p = re.search(r'p",\{children:"((?:[^"\\]|\\.)*)"\}', part)
        if h4 and p:
            blocks.append(
                {
                    "title": _strip_emoji(h4.group(1)),
                    "body": p.group(1).replace('\\"', '"').strip(),
                }
            )
    numbered = []
    for part in body.split('className:"timeline-step"')[1:]:
        h4 = re.search(r'h4",\{children:"([^"]+)"\}', part)
        p = re.search(r'p",\{children:"((?:[^"\\]|\\.)*)"\}', part)
        if h4 and p:
            numbered.append(f"{h4.group(1).strip()} — {p.group(1).replace(chr(92)+chr(34), chr(34)).strip()}")
    return blocks, numbered


def parse_age_bands(body: str) -> list[dict]:
    blocks = []
    for part in body.split('className:"age-group"')[1:]:
        hm = re.search(r'h3",\{children:"([^"]+)"\}', part)
        if not hm:
            continue
        label = hm.group(1).strip()
        focus, method = [], []
        segments = re.split(r'h4",\{children:"([^"]+)"\}', part)
        for i in range(1, len(segments) - 1, 2):
            h4 = segments[i]
            lis = [
                x.replace('\\"', '"').strip()
                for x in re.findall(r'li",\{children:"((?:[^"\\]|\\.)*)"', segments[i + 1])
            ]
            if "Метод" in h4 or "Указания" in h4:
                method.extend(lis)
            else:
                focus.extend(lis)
        blocks.append({"label": label, "focus": focus, "method": method})
    return blocks


def parse_position_cards(body: str) -> list[dict]:
    blocks = []
    for part in body.split('className:"position-card"')[1:]:
        hm = re.search(r'h3",\{children:"([^"]+)"\}', part)
        if not hm:
            continue
        title = _strip_emoji(hm.group(1))
        if "(" in title:
            title = title.split("(")[0].strip()
        tasks, skills, tips = [], [], []
        sections = re.split(r'h4",\{children:"([^"]+)"\}', part)[1:]
        for i in range(0, len(sections) - 1, 2):
            h4 = sections[i]
            chunk = sections[i + 1]
            items = []
            for strong, text in re.findall(
                r'li",\{children:\[a\.jsx\("strong",\{children:"([^"]+)"\}\)," ((?:[^"\\]|\\.)*)"\]',
                chunk,
            ):
                items.append(f"{strong.rstrip(':')}: {text.replace(chr(92)+chr(34), chr(34)).strip()}")
            for plain in re.findall(r'li",\{children:"((?:[^"\\]|\\.)*)"\}', chunk):
                if plain not in items:
                    items.append(plain.strip())
            if "Задачи" in h4:
                tasks = items
            elif "Умения" in h4:
                skills = items
            elif "Препоръки" in h4 or "Метод" in h4:
                tips = items
        blocks.append({"title": title, "tasks": tasks, "skills": skills, "tips": tips})
    return blocks


def parse_generic_cards(body: str, card_class: str) -> list[dict]:
    blocks = []
    for part in body.split(f'className:"{card_class}"')[1:]:
        hm = re.search(r'h3",\{children:"([^"]+)"\}|h4",\{children:"([^"]+)"\}', part)
        if not hm:
            continue
        title = _strip_emoji(hm.group(1) or hm.group(2) or "")
        bullets = []
        for strong, text in re.findall(
            r'li",\{children:\[a\.jsx\("strong",\{children:"([^"]+)"\}\)," ((?:[^"\\]|\\.)*)"\]',
            part,
        ):
            bullets.append(f"{strong.rstrip(':')}: {text.replace(chr(92)+chr(34), chr(34)).strip()}")
        for plain in re.findall(r'li",\{children:"((?:[^"\\]|\\.)*)"\}', part):
            if plain not in bullets:
                bullets.append(plain.strip())
        p = re.search(r'p",\{children:"((?:[^"\\]|\\.)*)"\}', part)
        if p and not bullets:
            bullets.append(p.group(1).replace('\\"', '"').strip())
        if title and bullets:
            blocks.append({"title": title, "bullets": bullets[:20]})
    return blocks


def build_import_bundle(js: str | None = None) -> dict:
    js = js or fetch_bundle()
    jp = _function_body(js, "jP")

    sections: list[dict] = [
        {
            "slug": "common-mistakes",
            "platform_slug": "common-mistakes",
            "layout": "skill_errors",
            "skills": parse_mistakes(jp),
        }
    ]

    pp = parse_technique(_function_body(js, "PP"))
    if pp:
        sections.append(
            {
                "slug": "proper-technique",
                "platform_slug": "correct-technique",
                "layout": "step_cards",
                "blocks": pp,
            }
        )

    rp_body = _function_body(js, "RP")
    principles, numbered = parse_principles(rp_body)
    if principles:
        sections.append(
            {
                "slug": "teaching-methods",
                "platform_slug": "teaching-methods",
                "layout": "principle_cards",
                "blocks": principles,
                "numbered_steps": numbered,
            }
        )

    dp = parse_age_bands(_function_body(js, "DP"))
    if dp:
        sections.append(
            {
                "slug": "age-specific",
                "platform_slug": "age-specifics",
                "layout": "age_bands",
                "blocks": dp,
            }
        )

    hp = parse_position_cards(_function_body(js, "HP"))
    if hp:
        sections.append(
            {
                "slug": "position-specific",
                "platform_slug": "position-specifics",
                "layout": "position_cards",
                "blocks": hp,
            }
        )

    card_fallbacks = [
        ("prevention-card", "injury-prevention", "injury-prevention"),
        ("psychology-section", "psychological", "psychology"),
        ("tactical-system", "tactical-schemes", "tactical-schemes"),
        ("responsibility-card", "setter-training", "setter-training"),
        ("principle-card", "scientific-physical", "scientific-physical"),
        ("criterion-card", "talent-selection", "talent-selection"),
        ("period-section", "training-periodization", "periodization"),
        ("analysis-section", "tactical-analysis", "tactical-analysis"),
    ]
    done = {s["slug"] for s in sections}
    for card_cls, vc_slug, plat_slug in card_fallbacks:
        if vc_slug in done:
            continue
        comp = SLUG_TO_COMP.get(vc_slug)
        if not comp:
            continue
        blocks = parse_generic_cards(_function_body(js, comp), card_cls)
        if not blocks:
            blocks = parse_generic_cards(_function_body(js, comp), "method-section")
        if blocks:
            sections.append(
                {
                    "slug": vc_slug,
                    "platform_slug": plat_slug,
                    "layout": "bullet_sections",
                    "blocks": blocks,
                }
            )
            done.add(vc_slug)

    return {"version": "2.1.0", "source": BASE, "sections": sections}


def skill_name_to_key(name: str) -> str:
    n = name.lower()
    if "подав" in n:
        return "подаване"
    if "прием" in n:
        return "прием"
    if "атак" in n:
        return "атака"
    if "блок" in n:
        return "блок"
    if "сервис" in n:
        return "сервис"
    if "разпредел" in n:
        return "разпределение"
    if "защит" in n:
        return "защита"
    return n


def guidelines_from_skills(skills: list[dict]) -> list[dict]:
    out = []
    order = 0
    for sk in skills:
        key = skill_name_to_key(sk["name"])
        for p in sk.get("pairs", []):
            order += 1
            out.append(
                {
                    "skill_element": key,
                    "error_bg": p["error"],
                    "correction_bg": p["correction"],
                    "sort_order": order,
                }
            )
    return out


def write_import_json(path: Path | None = None) -> dict:
    bundle = build_import_bundle()
    path = path or Path(__file__).resolve().parents[2] / "app" / "seed" / "data" / "volley_coach_guidelines_import.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    return bundle


if __name__ == "__main__":
    b = write_import_json()
    for s in b["sections"]:
        print(
            s["slug"],
            "skills",
            len(s.get("skills") or []),
            "blocks",
            len(s.get("blocks") or []),
        )
