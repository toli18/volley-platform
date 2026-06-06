"""
Seed на годишна програма: макро I/II + 11 мезоцикъла (U14, U16, U18).

  cd backend
  python -m app.scripts.seed_annual_program
  python -m app.scripts.seed_annual_program --replace
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.models import MethodCycle, MethodSource
from app.national_method.annual_program import ANNUAL_AGE_BANDS, all_annual_cycle_specs

SOURCE_FILENAME = "bvf-textbook-annual-program"
SOURCE_MARKER = "BVF_ANNUAL_PROGRAM_V1"


def _ensure_source(db) -> MethodSource:
    src = db.query(MethodSource).filter(MethodSource.filename == SOURCE_FILENAME).first()
    if src:
        return src
    src = MethodSource(
        filename=SOURCE_FILENAME,
        original_language="bg",
        content_type="periodization",
        age_band="all",
        rights_note="БФВ — учебник по волейбол, периодизация",
        ingest_status="published",
        wave=2,
        admin_notes=SOURCE_MARKER,
    )
    db.add(src)
    db.flush()
    return src


def seed_annual_program(db, *, replace: bool = False) -> dict[str, int]:
    src = _ensure_source(db)
    now = datetime.utcnow()
    created = updated = skipped = 0

    existing_by_key: dict[str, MethodCycle] = {}
    for row in db.query(MethodCycle).filter(MethodCycle.source_id == src.id).all():
        key = (row.structure_json or {}).get("annual_program_key")
        if key:
            existing_by_key[key] = row

    if replace:
        keys = {
            spec["structure_json"]["annual_program_key"]
            for band in ANNUAL_AGE_BANDS
            for spec in all_annual_cycle_specs(band)
        }
        for key, row in list(existing_by_key.items()):
            if key in keys:
                db.delete(row)
                del existing_by_key[key]
        db.flush()

    for band in ANNUAL_AGE_BANDS:
        for spec in all_annual_cycle_specs(band):
            key = spec["structure_json"]["annual_program_key"]
            row = existing_by_key.get(key)
            if row:
                row.title_bg = spec["title_bg"]
                row.summary_bg = spec["summary_bg"]
                row.cycle_type = spec["cycle_type"]
                row.weeks = spec["weeks"]
                row.age_band = spec["age_band"]
                row.structure_json = spec["structure_json"]
                row.sort_order = spec["sort_order"]
                row.status = "published"
                row.published_at = row.published_at or now
                updated += 1
                continue

            db.add(
                MethodCycle(
                    source_id=src.id,
                    title_bg=spec["title_bg"],
                    summary_bg=spec["summary_bg"],
                    cycle_type=spec["cycle_type"],
                    weeks=spec["weeks"],
                    age_band=spec["age_band"],
                    structure_json=spec["structure_json"],
                    status="published",
                    sort_order=spec["sort_order"],
                    published_at=now,
                )
            )
            created += 1

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed BVF annual program (macro + 11 meso)")
    parser.add_argument("--replace", action="store_true", help="Replace existing annual cycles from this source")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        stats = seed_annual_program(db, replace=args.replace)
        total = db.query(MethodCycle).filter(MethodCycle.status == "published").count()
        print(f"Annual program seed: {stats}")
        print(f"Published cycles in DB: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
