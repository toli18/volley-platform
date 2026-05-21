"""
Импорт на национална библиотека от локална папка + вградено BG съдържание.

Употреба:
  set BVF_LIBRARY_ROOT=C:\\Users\\krasi\\Downloads\\библиотека
  python -m app.scripts.import_bvf_library

Или от backend/:
  python -m app.scripts.import_bvf_library --force
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# Ensure app package
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import Drill, MethodArticle, MethodCycle, MethodSource
from app.settings import settings
from app.seed.bvf_library_content_bg import ARTICLES, CYCLES

SEED_DATA = BACKEND_ROOT / "app" / "seed" / "data"
DRILLS_BUNDLE_PATH = SEED_DATA / "bvf_drills_bg.json"
ARTICLES_BUNDLE_PATH = SEED_DATA / "bvf_articles_bg.json"

DEFAULT_LIBRARY_ROOT = Path(r"C:\Users\krasi\Downloads\библиотека")
IMPORT_MARKER = "BVF_LIBRARY_FULL_IMPORT_V2"
PDF_CHUNK_CHARS = 10_000
PDF_MIN_CHARS = 400
PDF_DRAFT_PREFIX = (
    "> Автоматично извлечен текст от източника. **Нужен превод и редакция на български** "
    "преди публикуване към треньорите.\n\n"
)


def _parse_gtp_md(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8", errors="replace")
    if "---" in text:
        body = text.split("---", 1)[-1].strip()
    else:
        body = text
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    title = ""
    for ln in lines[:15]:
        if ln.startswith("#"):
            title = ln.lstrip("#").strip()
            break
    if not title:
        for ln in lines[:8]:
            if len(ln) > 8 and not ln.startswith("http"):
                title = ln[:120]
                break
    if not title or len(title) < 4:
        return None
    # Skip index/tag pages
    low = title.lower()
    if low in ("serving", "passing", "hitting", "setting", "special"):
        return None
    instructions = body[:4000]
    category = "general"
    blob = (title + body).lower()
    if "serv" in blob:
        category = "сервис"
    elif "pass" in blob or "receiv" in blob:
        category = "прием"
    elif "set" in blob:
        category = "разпределение"
    elif "hit" in blob or "attack" in blob:
        category = "атака"
    elif "block" in blob:
        category = "блок"
    elif "warm" in blob or "stretch" in blob:
        category = "разгрявка"
    elif "plan" in blob or "practice" in blob:
        category = "план"
    elif "game" in blob or "fun" in blob:
        category = "игра"
    age_min, age_max = 12, 18
    if "6th" in blob or "12u" in blob or "elementary" in blob:
        age_min, age_max = 10, 13
    if "youth" in blob or "beginner" in blob:
        age_min, age_max = 10, 14
    return {
        "title": title[:200],
        "description": (
            f"Национално упражнение БФВ — {category}. "
            "(Източник на английски — преведете инструкциите при нужда.)"
        ),
        "category": category,
        "instructions": instructions,
        "coaching_points": "Адаптирайте обема и правилата към възрастта на отбора. Превод на български при публикуване.",
        "age_min": age_min,
        "age_max": age_max,
        "external_key": f"gtp:{path.stem}",
    }


def _ensure_source(db, filename: str, language: str, content_type: str, age_band: str) -> int:
    row = db.query(MethodSource).filter(MethodSource.filename == filename).first()
    if row:
        return row.id
    row = MethodSource(
        filename=filename,
        original_language=language,
        content_type=content_type,
        age_band=age_band,
        rights_note="БФВ библиотека",
        ingest_status="published",
        wave=1,
        admin_notes=IMPORT_MARKER,
    )
    db.add(row)
    db.flush()
    return row.id


def import_articles_and_cycles(db, force: bool) -> tuple[int, int]:
    now = datetime.utcnow()
    articles_n = 0
    cycles_n = 0

    for spec in ARTICLES:
        if db.query(MethodArticle).filter(MethodArticle.title_bg == spec["title_bg"]).first():
            continue
        src_id = _ensure_source(
            db,
            spec.get("source_file", "bvf-content"),
            "bg",
            spec["category"],
            spec["age_band"],
        )
        db.add(
            MethodArticle(
                source_id=src_id,
                title_bg=spec["title_bg"],
                body_bg=spec["body_bg"],
                category=spec["category"],
                age_band=spec["age_band"],
                status="published",
                sort_order=spec.get("sort_order", 0),
                published_at=now,
            )
        )
        articles_n += 1

    for spec in CYCLES:
        if db.query(MethodCycle).filter(MethodCycle.title_bg == spec["title_bg"]).first():
            continue
        db.add(
            MethodCycle(
                title_bg=spec["title_bg"],
                summary_bg=spec.get("summary_bg"),
                cycle_type=spec["cycle_type"],
                weeks=spec["weeks"],
                age_band=spec["age_band"],
                structure_json=spec["structure_json"],
                status="published",
                sort_order=0,
                published_at=now,
            )
        )
        cycles_n += 1

    db.flush()
    return articles_n, cycles_n


def import_getthepancake_drills(db, library_root: Path, force: bool) -> int:
    drills_dir = library_root / "getthepancake" / "drills"
    if not drills_dir.is_dir():
        return 0
    src_id = _ensure_source(db, "getthepancake-archive", "en", "exercise", "all")
    count = 0
    files = sorted(drills_dir.glob("*.md"))
    for md in files:
        parsed = _parse_gtp_md(md)
        if not parsed:
            continue
        ext = parsed["external_key"]
        exists = (
            db.query(Drill)
            .filter(Drill.scope == "federation", Drill.title == parsed["title"])
            .first()
        )
        if exists and not force:
            continue
        if exists and force:
            db.delete(exists)
            db.flush()
        db.add(
            Drill(
                title=parsed["title"],
                description=parsed["description"],
                category=parsed["category"],
                instructions=parsed["instructions"][:8000],
                coaching_points=parsed["coaching_points"],
                age_min=parsed["age_min"],
                age_max=parsed["age_max"],
                scope="federation",
                is_national_read_only=True,
                method_source_id=src_id,
                status="approved",
                level="national",
            )
        )
        count += 1
    db.flush()
    return count


def _chunk_pdf_text(raw: str) -> list[str]:
    raw = raw.strip()
    if len(raw) < PDF_MIN_CHARS:
        return []
    if len(raw) <= PDF_CHUNK_CHARS:
        return [raw]
    segments = re.split(r"(?=\n--- Page \d+ ---\n)", raw)
    if len(segments) <= 1:
        segments = [raw[i : i + PDF_CHUNK_CHARS] for i in range(0, len(raw), PDF_CHUNK_CHARS)]
    chunks: list[str] = []
    buf = ""
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        if len(buf) + len(seg) + 2 > PDF_CHUNK_CHARS and len(buf) >= PDF_MIN_CHARS:
            chunks.append(buf.strip())
            buf = seg
        else:
            buf = f"{buf}\n\n{seg}".strip() if buf else seg
    if buf.strip() and len(buf.strip()) >= PDF_MIN_CHARS:
        chunks.append(buf.strip())
    return chunks or [raw[:PDF_CHUNK_CHARS]]


def import_pdf_extracted_articles(db, library_root: Path, force: bool = False) -> int:
    """Импорт на пълния извлечен PDF текст като чернови статии (EN/IT, без автоматичен превод)."""
    extracted_dir = library_root / "bvf-pdf" / "extracted"
    inv_path = library_root / "bvf_pdf_inventory.json"
    if not extracted_dir.is_dir() or not inv_path.exists():
        return 0
    inventory = json.loads(inv_path.read_text(encoding="utf-8"))
    added = 0
    for item in inventory.get("files", []):
        filename = item.get("filename")
        if not filename:
            continue
        txt_path = extracted_dir / f"{Path(filename).stem}.txt"
        if not txt_path.exists():
            continue
        raw = txt_path.read_text(encoding="utf-8", errors="replace")
        chunks = _chunk_pdf_text(raw)
        if not chunks:
            continue
        label = (item.get("notes") or Path(filename).stem).strip()
        lang = item.get("language", "unknown")
        src_id = _ensure_source(
            db,
            filename,
            lang,
            item.get("content_type", "methodology"),
            item.get("age_band", "all"),
        )
        src_row = db.query(MethodSource).filter(MethodSource.id == src_id).first()
        if src_row and not src_row.extracted_text:
            src_row.extracted_text = raw[:500_000]

        total = len(chunks)
        for idx, chunk in enumerate(chunks, start=1):
            title = f"PDF: {label}" if total == 1 else f"PDF: {label} ({idx}/{total})"
            if db.query(MethodArticle).filter(MethodArticle.title_bg == title).first() and not force:
                continue
            if force:
                for row in db.query(MethodArticle).filter(MethodArticle.title_bg == title).all():
                    db.delete(row)
                db.flush()
            body = PDF_DRAFT_PREFIX + f"**Източник:** `{filename}` · **Език:** {lang}\n\n---\n\n" + chunk
            db.add(
                MethodArticle(
                    source_id=src_id,
                    title_bg=title,
                    body_bg=body[:120_000],
                    category=item.get("content_type", "methodology"),
                    age_band=item.get("age_band", "all"),
                    status="draft",
                    sort_order=100 + idx,
                )
            )
            added += 1
    db.flush()
    return added


def register_pdf_sources(db, library_root: Path) -> int:
    inv_path = library_root / "bvf_pdf_inventory.json"
    if not inv_path.exists():
        return 0
    data = json.loads(inv_path.read_text(encoding="utf-8"))
    n = 0
    for item in data.get("files", []):
        fn = item.get("filename")
        if not fn:
            continue
        _ensure_source(
            db,
            fn,
            item.get("language", "unknown"),
            item.get("content_type", "methodology"),
            item.get("age_band", "all"),
        )
        n += 1
    return n


def bundle_available() -> bool:
    """Архивният BG bundle (GTP превод) е изключен — само Volley Comment + seed."""
    return False


def import_from_bg_bundle(db, force: bool = False) -> dict:
    """DEPRECATED: машинно преведен GTP bundle — не се импортира в платформата."""
    return {"skipped": True, "reason": "legacy_bundle_disabled"}


def run_embedded(db, force: bool = False) -> dict:
    """Вградено BG съдържание (статии + цикли) — работи без локална папка."""
    art_n, cyc_n = import_articles_and_cycles(db, force)
    return {"articles_added": art_n, "cycles_added": cyc_n}


def run_archive(db, library_root: Path, force: bool = False, include_pdf_text: bool = True) -> dict:
    """PDF източници + пълен PDF текст (чернови) + Get The Pancake упражнения."""
    pdf_sources = register_pdf_sources(db, library_root)
    pdf_articles = import_pdf_extracted_articles(db, library_root, force) if include_pdf_text else 0
    drill_n = import_getthepancake_drills(db, library_root, force)
    return {
        "pdf_sources": pdf_sources,
        "pdf_draft_articles_added": pdf_articles,
        "drills_added": drill_n,
        "note": "PDF/GTP текстът е EN/IT — публикуваните BG резюмета са отделно (9 статии).",
    }


def library_stats(db) -> dict:
    return {
        "articles_published": db.query(MethodArticle).filter(MethodArticle.status == "published").count(),
        "articles_draft": db.query(MethodArticle).filter(MethodArticle.status == "draft").count(),
        "cycles_published": db.query(MethodCycle).filter(MethodCycle.status == "published").count(),
        "federation_drills": db.query(Drill).filter(Drill.scope == "federation").count(),
    }


def _ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    if (settings.database_url or "").startswith("sqlite"):
        with engine.begin() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(drills)")).fetchall()}
            if "scope" not in cols:
                conn.execute(text("ALTER TABLE drills ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'community'"))
            if "is_national_read_only" not in cols:
                conn.execute(
                    text("ALTER TABLE drills ADD COLUMN is_national_read_only BOOLEAN NOT NULL DEFAULT 0")
                )
            if "method_source_id" not in cols:
                conn.execute(text("ALTER TABLE drills ADD COLUMN method_source_id INTEGER"))


def run_import(
    library_root: Path | None,
    force: bool = False,
    embedded_only: bool = False,
    from_bundle: bool | None = None,
) -> dict:
    _ensure_schema()
    db = SessionLocal()
    use_bundle = from_bundle if from_bundle is not None else bundle_available()
    try:
        if use_bundle:
            result = {"bundle": import_from_bg_bundle(db, force)}
        else:
            result = {"embedded": run_embedded(db, force)}
            if not embedded_only and library_root and library_root.is_dir():
                result["archive"] = run_archive(db, library_root, force, include_pdf_text=False)
        db.commit()
        result["totals"] = library_stats(db)
        if __name__ == "__main__":
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", default=os.environ.get("BVF_LIBRARY_ROOT", str(DEFAULT_LIBRARY_ROOT)))
    parser.add_argument("--force", action="store_true", help="Re-import drills with same title")
    parser.add_argument("--embedded-only", action="store_true", help="Only BG articles/cycles from repo")
    args = parser.parse_args()
    root = Path(args.library_root) if args.library_root else None
    if not args.embedded_only and root and not root.is_dir():
        print(f"Library folder not found: {root}")
        sys.exit(1)
    from_bundle = None
    if args.from_bundle:
        from_bundle = True
    if args.no_bundle:
        from_bundle = False
    run_import(root, force=args.force, embedded_only=args.embedded_only, from_bundle=from_bundle)


if __name__ == "__main__":
    main()
