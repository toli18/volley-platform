"""
Превод на националната библиотека на български и публикуване.

  set DATABASE_URL=...
  python -m app.scripts.translate_bvf_library --drills
  python -m app.scripts.translate_bvf_library --articles
  python -m app.scripts.translate_bvf_library --all

По-бърз/качествен превод: задай OPENAI_API_KEY (иначе Google превод).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.models import Drill, MethodArticle, MethodSource
from app.scripts.import_bvf_library import _ensure_schema
from app.services.bvf_translator import translate_text, translate_title

DRAFT_PREFIX_RE = re.compile(
    r"^> Автоматично извлечен текст.*?\n\n---\n\n",
    re.DOTALL,
)
TRANSLATED_HEADER = (
    "> Официален материал БФВ — преведен на български от източника.\n\n"
)


def _parse_article_body(body: str) -> tuple[str, str, str]:
    """meta header, source line, content."""
    m = DRAFT_PREFIX_RE.match(body or "")
    if not m:
        return "", "", body or ""
    rest = body[m.end() :]
    src_match = re.match(r"\*\*Източник:\*\*[^\n]+\n\n", rest)
    if src_match:
        meta = body[: m.end()] + src_match.group(0)
        content = rest[src_match.end() :]
        return meta, src_match.group(0), content
    return body[: m.end()], "", rest


def _detect_lang_from_source(db, source_id: int | None) -> str:
    if not source_id:
        return "auto"
    row = db.query(MethodSource).filter(MethodSource.id == source_id).first()
    if not row:
        return "auto"
    lang = (row.original_language or "auto").lower()
    return lang if lang in ("en", "it") else "auto"


def _already_bulgarian(text: str) -> bool:
    letters = re.findall(r"[а-яА-ЯёЁ]", text or "")
    latin = re.findall(r"[a-zA-Z]", text or "")
    return len(letters) >= 40 and len(letters) > len(latin) * 0.6


def translate_drills(db, limit: int | None, force: bool) -> int:
    q = db.query(Drill).filter(Drill.scope == "federation")
    rows = q.order_by(Drill.id.asc()).all()
    done = 0
    for d in rows:
        if limit is not None and done >= limit:
            break
        if not force and _already_bulgarian(f"{d.title} {d.instructions or ''}"):
            continue
        lang = "en"
        if d.method_source_id:
            lang = _detect_lang_from_source(db, d.method_source_id)
        try:
            d.title = translate_title(d.title or "", lang)
            if d.description and not re.search(r"[а-яА-Я]{8,}", d.description):
                d.description = translate_text(d.description, lang)[:2000]
            if d.instructions:
                d.instructions = translate_text(d.instructions, lang)[:8000]
            if d.coaching_points and not _already_bulgarian(d.coaching_points):
                d.coaching_points = translate_text(d.coaching_points, lang)[:2000]
            d.updated_at = datetime.utcnow()
            done += 1
            db.commit()
            print(f"  drill #{d.id}: {d.title[:60]}...")
        except Exception as exc:
            db.rollback()
            print(f"  skip drill #{d.id}: {exc}")
    return done


def translate_articles(db, limit: int | None, force: bool, publish: bool) -> int:
    q = db.query(MethodArticle).filter(MethodArticle.title_bg.like("PDF:%"))
    if not force:
        q = q.filter(MethodArticle.status == "draft")
    rows = q.order_by(MethodArticle.id.asc()).all()
    done = 0
    for a in rows:
        if limit is not None and done >= limit:
            break
        body = a.body_bg or ""
        if not force and TRANSLATED_HEADER.strip() in body[:200]:
            continue
        lang = _detect_lang_from_source(db, a.source_id)
        meta, src_line, content = _parse_article_body(body)
        if not content.strip():
            content = body
        try:
            title = a.title_bg
            if title.startswith("PDF:"):
                title = translate_title(title.replace("PDF:", "").strip(), lang)
                a.title_bg = f"БФВ: {title}"[:512]
            new_body = translate_text(content, lang)
            a.body_bg = (TRANSLATED_HEADER + src_line + new_body)[:120_000]
            if publish:
                a.status = "published"
                if not a.published_at:
                    a.published_at = datetime.utcnow()
            a.updated_at = datetime.utcnow()
            done += 1
            db.commit()
            print(f"  article #{a.id}: {a.title_bg[:55]}...")
        except Exception as exc:
            db.rollback()
            print(f"  skip article #{a.id}: {exc}")
    return done


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--drills", action="store_true")
    parser.add_argument("--articles", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-publish", action="store_true", help="Articles stay draft after translate")
    args = parser.parse_args()
    if not (args.drills or args.articles or args.all):
        args.all = True

    _ensure_schema()
    db = SessionLocal()
    try:
        publish = not args.no_publish
        stats = {}
        if args.drills or args.all:
            print("Превод на упражнения...")
            stats["drills"] = translate_drills(db, args.limit, args.force)
        if args.articles or args.all:
            print("Превод на PDF статии...")
            stats["articles"] = translate_articles(db, args.limit, args.force, publish)
        print(json.dumps(stats, ensure_ascii=False))
    finally:
        db.close()


if __name__ == "__main__":
    main()
