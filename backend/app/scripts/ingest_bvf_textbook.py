"""
Импорт на учебника БФВ (plain text) → JSON + MethodArticle в DB.

  python -m app.scripts.ingest_bvf_textbook --export
  python -m app.scripts.ingest_bvf_textbook --import-db
  python -m app.scripts.ingest_bvf_textbook --export --import-db --replace-vc
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
from app.models import MethodArticle, MethodSource
from app.national_method.content_policy import purge_volleycomment_content
from app.national_method.textbook_parser import parse_textbook
from app.settings import settings

SEED_DATA = BACKEND_ROOT / "app" / "seed" / "data"
TEXTBOOK_TXT = SEED_DATA / "bvf_textbook_bg.txt"
EXPORT_PATH = SEED_DATA / "bvf_textbook_bg.json"
SOURCE_FILENAME = "bvf-textbook-bg"
ORIGIN = "textbook"
SERIES = "bvf-coach-textbook"


def export_textbook() -> dict:
    if not TEXTBOOK_TXT.is_file():
        raise FileNotFoundError(f"Липсва {TEXTBOOK_TXT}")
    raw = TEXTBOOK_TXT.read_text(encoding="utf-8")
    payload = parse_textbook(raw)
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    SEED_DATA.mkdir(parents=True, exist_ok=True)
    EXPORT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Записано: {EXPORT_PATH} ({payload['section_count']} секции)", flush=True)
    return payload


def _ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    if (settings.database_url or "").startswith("sqlite"):
        with engine.begin() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(method_articles)")).fetchall()}
            for name, ddl in (
                ("source_url", "ALTER TABLE method_articles ADD COLUMN source_url VARCHAR(1024)"),
                ("author", "ALTER TABLE method_articles ADD COLUMN author VARCHAR(256)"),
                ("series", "ALTER TABLE method_articles ADD COLUMN series VARCHAR(160)"),
                ("summary_bg", "ALTER TABLE method_articles ADD COLUMN summary_bg TEXT"),
                ("key_points", "ALTER TABLE method_articles ADD COLUMN key_points JSON"),
                ("content_origin", "ALTER TABLE method_articles ADD COLUMN content_origin VARCHAR(32)"),
            ):
                if name not in cols:
                    conn.execute(text(ddl))


def import_to_db(force: bool = False, replace_vc: bool = False) -> dict:
    if not EXPORT_PATH.exists():
        export_textbook()
    _ensure_schema()
    data = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    db = SessionLocal()
    stats: dict = {"imported": 0, "updated": 0, "skipped": 0}
    try:
        if replace_vc:
            stats["volleycomment_purge"] = purge_volleycomment_content(db, dry_run=False)

        src = db.query(MethodSource).filter(MethodSource.filename == SOURCE_FILENAME).first()
        if not src:
            src = MethodSource(
                filename=SOURCE_FILENAME,
                original_language="bg",
                content_type="textbook",
                age_band="all",
                rights_note="БФВ — официален учебник по волейбол (треньори)",
                ingest_status="published",
                wave=1,
                admin_notes="Единствен източник за методическа библиотека и AI контекст",
            )
            db.add(src)
            db.flush()

        if force:
            db.query(MethodArticle).filter(MethodArticle.content_origin == ORIGIN).delete()
            db.flush()

        now = datetime.utcnow()
        for sec in data.get("sections") or []:
            slug = sec["slug"]
            existing = (
                db.query(MethodArticle)
                .filter(MethodArticle.content_origin == ORIGIN, MethodArticle.series == slug)
                .first()
            )
            fields = {
                "source_id": src.id,
                "title_bg": sec["title_bg"][:512],
                "body_bg": sec["body_bg"],
                "category": sec.get("category") or "methodology",
                "age_band": sec.get("age_band") or "all",
                "status": "published",
                "sort_order": int(sec.get("sort_order") or 0),
                "published_at": now,
                "summary_bg": sec.get("summary_bg"),
                "series": slug[:160],
                "content_origin": ORIGIN,
                "key_points": {
                    "slug": slug,
                    "part": sec.get("part"),
                    "kind": sec.get("kind"),
                    "session_code": sec.get("session_code"),
                    "session_phase": sec.get("session_phase"),
                },
            }
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                stats["updated"] += 1
            else:
                db.add(MethodArticle(**fields))
                stats["imported"] += 1

        db.commit()
        stats["total_sections"] = len(data.get("sections") or [])
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Импорт учебник БФВ")
    p.add_argument("--export", action="store_true", help="Парсва TXT → JSON")
    p.add_argument("--import-db", action="store_true", help="Зарежда JSON в DB")
    p.add_argument("--force", action="store_true", help="Презаписва textbook статии")
    p.add_argument("--replace-vc", action="store_true", help="Изтрива Volley Comment преди импорт")
    args = p.parse_args()
    if not args.export and not args.import_db:
        args.export = True
        args.import_db = True
        args.replace_vc = True
    if args.export:
        export_textbook()
    if args.import_db:
        stats = import_to_db(force=args.force or args.replace_vc, replace_vc=args.replace_vc)
        print(json.dumps(stats, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
