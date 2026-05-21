"""
DEPRECATED — архивният GTP/PDF bundle е премахнат от платформата.
Използвайте: python -m app.scripts.ingest_volleycomment
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.scripts.import_bvf_library import (  # noqa: E402
    DEFAULT_LIBRARY_ROOT,
    _chunk_pdf_text,
    _parse_gtp_md,
)
from app.seed.bvf_library_content_bg import ARTICLES, CYCLES  # noqa: E402
from app.services.bvf_translator import translate_text, translate_title  # noqa: E402

SEED_DATA = BACKEND_ROOT / "app" / "seed" / "data"
DRILLS_PATH = SEED_DATA / "bvf_drills_bg.json"
ARTICLES_PATH = SEED_DATA / "bvf_articles_bg.json"
PROGRESS_PATH = SEED_DATA / "bvf_export_progress.json"
BUNDLE_VERSION = "1.0.0"


def _load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _progress() -> dict:
    return _load_json(
        PROGRESS_PATH,
        {"drills_done": [], "articles_done": [], "started_at": None},
    )


def _save_progress(prog: dict) -> None:
    _save_json(PROGRESS_PATH, prog)


def export_embedded_articles() -> list[dict]:
    out = []
    for spec in ARTICLES:
        out.append(
            {
                "title_bg": spec["title_bg"],
                "body_bg": spec["body_bg"],
                "category": spec["category"],
                "age_band": spec["age_band"],
                "sort_order": spec.get("sort_order", 0),
                "source_file": spec.get("source_file", ""),
                "language": "bg",
            }
        )
    return out


def export_gtp_drills(library_root: Path, prog: dict, flush_every: int = 5) -> list[dict]:
    drills_dir = library_root / "getthepancake" / "drills"
    if not drills_dir.is_dir():
        return _load_json(DRILLS_PATH, {"version": BUNDLE_VERSION, "drills": []}).get("drills", [])

    existing = _load_json(DRILLS_PATH, {"version": BUNDLE_VERSION, "drills": []})
    drills: list[dict] = list(existing.get("drills", []))
    done_keys = set(prog.get("drills_done", []))
    by_key = {d["external_key"]: d for d in drills}

    files = sorted(drills_dir.glob("*.md"))
    added = 0
    for md in files:
        parsed = _parse_gtp_md(md)
        if not parsed:
            continue
        key = parsed["external_key"]
        if key in done_keys and key in by_key:
            continue
        print(f"[drill] {key}", flush=True)
        try:
            title_bg = translate_title(parsed["title"], "en")
            desc_bg = translate_text(parsed["description"], "en")
            instr_bg = translate_text(parsed["instructions"], "en")
            cp_bg = (
                "Адаптирайте обема и правилата към възрастта на отбора. "
                "Насочвайте играчите с кратки команди."
            )
            row = {
                "external_key": key,
                "title_bg": title_bg,
                "description_bg": desc_bg,
                "instructions_bg": instr_bg[:12000],
                "coaching_points_bg": cp_bg,
                "category": parsed["category"],
                "age_min": parsed["age_min"],
                "age_max": parsed["age_max"],
                "source": "getthepancake",
                "language": "bg",
            }
            by_key[key] = row
            done_keys.add(key)
            added += 1
            if added % flush_every == 0:
                drills = list(by_key.values())
                _save_json(
                    DRILLS_PATH,
                    {
                        "version": BUNDLE_VERSION,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "count": len(drills),
                        "drills": drills,
                    },
                )
                prog["drills_done"] = sorted(done_keys)
                _save_progress(prog)
        except Exception as exc:
            print(f"  skip {key}: {exc}", flush=True)

    drills = list(by_key.values())
    _save_json(
        DRILLS_PATH,
        {
            "version": BUNDLE_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(drills),
            "drills": drills,
        },
    )
    prog["drills_done"] = sorted(done_keys)
    _save_progress(prog)
    return drills


def export_pdf_articles(library_root: Path, prog: dict) -> list[dict]:
    extracted_dir = library_root / "bvf-pdf" / "extracted"
    inv_path = library_root / "bvf_pdf_inventory.json"
    if not extracted_dir.is_dir() or not inv_path.exists():
        return _load_json(ARTICLES_PATH, {"version": BUNDLE_VERSION, "articles": []}).get("articles", [])

    inventory = json.loads(inv_path.read_text(encoding="utf-8"))
    existing = _load_json(ARTICLES_PATH, {"version": BUNDLE_VERSION, "articles": []})
    articles: list[dict] = list(existing.get("articles", []))
    done_keys = set(prog.get("articles_done", []))
    by_key = {a["article_key"]: a for a in articles}

    embedded = export_embedded_articles()
    for e in embedded:
        k = f"embedded:{e['title_bg']}"
        if k not in by_key:
            by_key[k] = {**e, "article_key": k, "status": "published"}

    for item in inventory.get("files", []):
        filename = item.get("filename")
        if not filename:
            continue
        article_key = f"pdf:{filename}"
        if article_key in done_keys and article_key in by_key:
            continue
        txt_path = extracted_dir / f"{Path(filename).stem}.txt"
        if not txt_path.exists():
            continue
        raw = txt_path.read_text(encoding="utf-8", errors="replace")
        if len(raw.strip()) < 400:
            continue
        lang = item.get("language", "it")
        if lang not in ("en", "it"):
            lang = "it"
        label = (item.get("notes") or Path(filename).stem).strip()
        print(f"[article] {filename}", flush=True)
        try:
            title_bg = translate_title(label, lang)
            title_bg = f"БФВ: {title_bg}"[:512]
            # Един файл = една статия; дълги текстове на части при превод
            chunks = _chunk_pdf_text(raw)
            if not chunks:
                chunks = [raw[:50000]]
            translated_parts = []
            for i, ch in enumerate(chunks):
                print(f"  chunk {i + 1}/{len(chunks)}", flush=True)
                translated_parts.append(translate_text(ch, lang))
            body_bg = (
                f"> Официален материал БФВ — методика и упражнения (превод на български).\n\n"
                f"**Документ:** {filename}\n\n---\n\n"
                + "\n\n---\n\n".join(translated_parts)
            )[:118_000]
            row = {
                "article_key": article_key,
                "title_bg": title_bg,
                "body_bg": body_bg,
                "category": item.get("content_type", "methodology"),
                "age_band": item.get("age_band", "all"),
                "sort_order": 50,
                "source_file": filename,
                "language": "bg",
                "status": "published",
            }
            by_key[article_key] = row
            done_keys.add(article_key)
            articles = list(by_key.values())
            _save_json(
                ARTICLES_PATH,
                {
                    "version": BUNDLE_VERSION,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "count": len(articles),
                    "articles": articles,
                },
            )
            prog["articles_done"] = sorted(done_keys)
            _save_progress(prog)
        except Exception as exc:
            print(f"  skip {filename}: {exc}", flush=True)

    articles = list(by_key.values())
    _save_json(
        ARTICLES_PATH,
        {
            "version": BUNDLE_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(articles),
            "articles": articles,
        },
    )
    prog["articles_done"] = sorted(done_keys)
    _save_progress(prog)
    return articles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", default=os.environ.get("BVF_LIBRARY_ROOT", str(DEFAULT_LIBRARY_ROOT)))
    parser.add_argument("--drills-only", action="store_true")
    parser.add_argument("--articles-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.library_root)
    if not root.is_dir():
        print(f"Library not found: {root}")
        sys.exit(1)

    prog = _progress()
    if not prog.get("started_at"):
        prog["started_at"] = datetime.now(timezone.utc).isoformat()
        _save_progress(prog)

    if not args.articles_only:
        export_gtp_drills(root, prog)
    if not args.drills_only:
        export_pdf_articles(root, prog)

    d = _load_json(DRILLS_PATH, {})
    a = _load_json(ARTICLES_PATH, {})
    print(
        json.dumps(
            {
                "drills": d.get("count", 0),
                "articles": a.get("count", 0),
                "paths": [str(DRILLS_PATH), str(ARTICLES_PATH)],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
