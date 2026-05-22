"""
Фаза A: Volley Comment „Наука и спорта“ → JSON + импорт в DB.

  python -m app.scripts.ingest_volleycomment --export
  python -m app.scripts.ingest_volleycomment --import
  python -m app.scripts.ingest_volleycomment --export --import
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import MethodArticle, MethodGuideline, MethodSource
from app.settings import settings
from app.national_method.cycle_article_links import infer_age_band
from app.national_method.volley_comment import discover_article_urls, fetch_article
from app.seed.bvf_coaching_guidelines_bg import GUIDELINES

SEED_DATA = BACKEND_ROOT / "app" / "seed" / "data"
EXPORT_PATH = SEED_DATA / "bvf_volleycomment_bg.json"
SERIES = "nauka-i-sporta"
ORIGIN = "volleycomment"


def export_articles() -> dict:
    urls = discover_article_urls(max_pages=10)
    print(f"Открити URL: {len(urls)}", flush=True)
    articles = []
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] {url}", flush=True)
        try:
            art = fetch_article(url)
            if not art:
                print("  skip (празно)", flush=True)
                continue
            articles.append(
                {
                    "slug": art.slug,
                    "title_bg": art.title_bg,
                    "author": art.author,
                    "source_url": art.url,
                    "series": SERIES,
                    "summary_bg": art.summary_bg,
                    "key_points": art.key_points,
                    "body_bg": art.body_bg,
                    "category": art.category,
                    "age_band": infer_age_band(art.title_bg, art.slug),
                    "status": "published",
                    "content_origin": ORIGIN,
                    "sort_order": i,
                }
            )
        except Exception as exc:
            print(f"  error: {exc}", flush=True)
    payload = {
        "version": "1.0.0",
        "series": SERIES,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(articles),
        "articles": articles,
    }
    SEED_DATA.mkdir(parents=True, exist_ok=True)
    EXPORT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Записано: {EXPORT_PATH} ({len(articles)} статии)", flush=True)
    return payload


def _ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    if (settings.database_url or "").startswith("sqlite"):
        with engine.begin() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(method_articles)")).fetchall()}
            for name, ddl in (
                ("source_url", "ALTER TABLE method_articles ADD COLUMN source_url VARCHAR(1024)"),
                ("author", "ALTER TABLE method_articles ADD COLUMN author VARCHAR(256)"),
                ("series", "ALTER TABLE method_articles ADD COLUMN series VARCHAR(64)"),
                ("summary_bg", "ALTER TABLE method_articles ADD COLUMN summary_bg TEXT"),
                ("key_points", "ALTER TABLE method_articles ADD COLUMN key_points JSON"),
                ("content_origin", "ALTER TABLE method_articles ADD COLUMN content_origin VARCHAR(32)"),
            ):
                if name not in cols:
                    conn.execute(text(ddl))


def import_to_db(force: bool = False) -> dict:
    if not EXPORT_PATH.exists():
        raise FileNotFoundError(f"Липсва {EXPORT_PATH} — пуснете --export")
    _ensure_schema()
    data = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        src = db.query(MethodSource).filter(MethodSource.filename == "volleycomment.bg").first()
        if not src:
            src = MethodSource(
                filename="volleycomment.bg",
                original_language="bg",
                content_type="methodology",
                age_band="all",
                rights_note="БФВ — Volley Comment, серия Наука и спорта (официално ОК)",
                ingest_status="published",
                wave=1,
            )
            db.add(src)
            db.flush()

        if force:
            db.query(MethodArticle).filter(MethodArticle.content_origin == ORIGIN).delete()
            db.query(MethodGuideline).delete()
            db.flush()

        added = 0
        now = datetime.utcnow()
        for spec in data.get("articles", []):
            title = spec["title_bg"]
            if db.query(MethodArticle).filter(MethodArticle.title_bg == title).first() and not force:
                continue
            db.add(
                MethodArticle(
                    source_id=src.id,
                    title_bg=title,
                    body_bg=spec["body_bg"],
                    category=spec.get("category", "methodology"),
                    age_band=spec.get("age_band", "all"),
                    status="published",
                    sort_order=spec.get("sort_order", 0),
                    published_at=now,
                    source_url=spec.get("source_url"),
                    author=spec.get("author"),
                    series=SERIES,
                    summary_bg=spec.get("summary_bg"),
                    key_points=spec.get("key_points"),
                    content_origin=ORIGIN,
                )
            )
            added += 1

        if force:
            db.query(MethodGuideline).delete()
            db.flush()
        g_added = 0
        for g in GUIDELINES:
            if not force:
                exists = (
                    db.query(MethodGuideline)
                    .filter(
                        MethodGuideline.skill_element == g["skill_element"],
                        MethodGuideline.error_bg == g["error_bg"],
                    )
                    .first()
                )
                if exists:
                    continue
            db.add(
                MethodGuideline(
                    skill_element=g["skill_element"],
                    error_bg=g["error_bg"],
                    correction_bg=g["correction_bg"],
                    age_band=g.get("age_band", "all"),
                    sort_order=g.get("sort_order", 0),
                    status="published",
                )
            )
            g_added += 1

        from app.national_method.cycle_article_links import sync_all_cycle_links

        link_stats = sync_all_cycle_links(db)
        db.commit()
        return {
            "articles_added": added,
            "guidelines_added": g_added,
            "cycle_links": link_stats,
        }
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", action="store_true")
    parser.add_argument("--import-db", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.export and not args.import_db:
        args.export = True
        args.import_db = True
    if args.export:
        export_articles()
    if args.import_db:
        print(import_to_db(force=args.force), flush=True)


if __name__ == "__main__":
    main()
