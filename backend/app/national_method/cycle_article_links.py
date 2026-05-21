"""Фаза B: свързване на цикли със статии „Наука и спорта“ по възраст и седмица."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.models import MethodArticle, MethodCycle

WEEK_KEYWORDS: dict[int, list[str]] = {
    1: [
        "техник",
        "подаван",
        "прием",
        "сервис",
        "начален",
        "теорет",
        "морфолог",
        "физиолог",
        "координац",
        "физическ",
        "подготв",
        "основ",
    ],
    2: ["напад", "разпредел", "забиван", "атака", "сервис", "разпред", "функция-разпредел"],
    3: ["блок", "защит", "отбран", "дефанз", "либеро"],
    4: ["игра", "тактик", "систем", "интеграц", "мач", "състез", "мотивац", "ментал", "план"],
}

MINI_WEEK_KEYWORDS: dict[int, list[str]] = {
    1: ["игр", "дете", "мини", "активн"],
    2: ["подаван"],
    3: ["прием"],
    4: ["сервис"],
    5: ["3v3", "4v4", "игра", "ротац"],
    6: ["атака", "напад"],
    7: ["турнир", "мач", "състез"],
}


def infer_age_band(title: str, slug: str = "") -> str:
    blob = f"{title} {slug}".lower().replace("г", "g")
    if re.search(r"10\s*[-–]\s*12", blob):
        return "U13"
    if re.search(r"15\s*[-–]\s*16|13-14,?\s*15-16|13-1415-16", blob):
        return "U16"
    if re.search(r"13\s*[-–]\s*14", blob):
        return "U14"
    if "u18" in blob or "гимназ" in blob or "high-school" in blob:
        return "U18"
    if "mini" in blob or "мини" in blob:
        return "mini"
    return "all"


def _article_blob(article: MethodArticle) -> str:
    return f"{article.title_bg} {article.slug if hasattr(article, 'slug') else ''}".lower()


def _score_article_for_week(article: MethodArticle, week: int, cycle_type: str) -> int:
    blob = _article_blob(article)
    if hasattr(article, "source_url") and article.source_url:
        blob += " " + article.source_url.lower()
    keywords = MINI_WEEK_KEYWORDS if cycle_type == "micro" else WEEK_KEYWORDS
    kws = keywords.get(week, [])
    return sum(1 for kw in kws if kw in blob)


def _article_matches_age(article: MethodArticle, cycle_age: str) -> bool:
    band = article.age_band or "all"
    if band == "all":
        if "единна програм" in article.title_bg.lower():
            return cycle_age in ("U13", "U14", "U16")
        return cycle_age != "mini"
    if cycle_age == "mini":
        return band in ("mini", "U13", "all")
    return band == cycle_age or band == "all"


def _article_to_ref(article: MethodArticle) -> dict[str, Any]:
    return {
        "id": article.id,
        "title_bg": article.title_bg,
        "summary_bg": (article.summary_bg or "")[:280],
        "source_url": article.source_url,
        "category": article.category,
    }


def enrich_cycle_structure(
    cycle: MethodCycle,
    articles: list[MethodArticle],
    max_per_week: int = 3,
) -> dict[str, Any]:
    structure = dict(cycle.structure_json or {})
    weeks = list(structure.get("weeks") or [])
    age = cycle.age_band
    pool = [a for a in articles if _article_matches_age(a, age)]

    program_articles: list[dict] = []
    seen_ids: set[int] = set()

    for a in pool:
        if "единна програм" in a.title_bg.lower() or "единна-program" in (a.source_url or ""):
            if a.id not in seen_ids:
                program_articles.append(_article_to_ref(a))
                seen_ids.add(a.id)

    enriched_weeks = []
    for w in weeks:
        week_num = int(w.get("week", 0))
        focus_blob = " ".join(w.get("focus") or []) + " " + (w.get("theme") or "")
        scored: list[tuple[int, MethodArticle]] = []
        for a in pool:
            if a.id in seen_ids:
                continue
            score = _score_article_for_week(a, week_num, cycle.cycle_type)
            for f in (w.get("focus") or []):
                if f.lower() in _article_blob(a):
                    score += 2
            if any(k in focus_blob.lower() for k in ("подаван", "прием") if k in _article_blob(a)):
                score += 1
            if score > 0:
                scored.append((score, a))
        scored.sort(key=lambda x: (-x[0], x[1].sort_order, x[1].id))
        related = []
        for _, a in scored[:max_per_week]:
            related.append(_article_to_ref(a))
            seen_ids.add(a.id)
        row = dict(w)
        row["related_articles"] = related
        enriched_weeks.append(row)

    structure["weeks"] = enriched_weeks
    structure["program_articles"] = program_articles[:12]
    structure["bvf_series"] = "nauka-i-sporta"
    structure["linked_age_band"] = age
    return structure


def sync_all_cycle_links(db: Session) -> dict[str, int]:
    articles = (
        db.query(MethodArticle)
        .filter(
            MethodArticle.status == "published",
            MethodArticle.content_origin == "volleycomment",
        )
        .all()
    )
    for a in articles:
        slug = ""
        if a.source_url:
            slug = a.source_url.rstrip("/").split("/")[-1]
        inferred = infer_age_band(a.title_bg, slug)
        if inferred != "all" or a.age_band == "all":
            a.age_band = inferred

    cycles = db.query(MethodCycle).filter(MethodCycle.status == "published").all()
    updated = 0
    for cycle in cycles:
        new_structure = enrich_cycle_structure(cycle, articles)
        cycle.structure_json = new_structure
        updated += 1
    db.flush()
    return {"articles_tagged": len(articles), "cycles_updated": updated}


def find_cycles_for_article(db: Session, article_id: int) -> list[dict[str, Any]]:
    article = db.query(MethodArticle).filter(MethodArticle.id == article_id).first()
    if not article:
        return []
    out = []
    cycles = db.query(MethodCycle).filter(MethodCycle.status == "published").all()
    for c in cycles:
        s = c.structure_json or {}
        hit = False
        role = None
        for w in s.get("weeks") or []:
            for ref in w.get("related_articles") or []:
                if ref.get("id") == article_id:
                    hit = True
                    role = f"Седмица {w.get('week')}"
                    break
        if not hit:
            for ref in s.get("program_articles") or []:
                if ref.get("id") == article_id:
                    hit = True
                    role = "Единна програма"
                    break
        if hit and _article_matches_age(article, c.age_band):
            out.append(
                {
                    "cycle_id": c.id,
                    "title_bg": c.title_bg,
                    "age_band": c.age_band,
                    "weeks": c.weeks,
                    "role": role,
                }
            )
    return out
