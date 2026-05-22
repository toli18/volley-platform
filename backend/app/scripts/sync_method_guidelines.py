"""
Синхронизира method_guidelines от seed (премахва дубликати).

  python -m app.scripts.sync_method_guidelines
  python -m app.scripts.sync_method_guidelines --dry-run
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.database import SessionLocal
from app.models import MethodGuideline
from app.national_method.guideline_dedup import dedupe_guideline_pairs
from app.seed.bvf_coaching_guidelines_bg import GUIDELINES


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        before = db.query(MethodGuideline).count()
        if not args.dry_run:
            db.query(MethodGuideline).delete()
            db.flush()
        now = datetime.utcnow()
        added = 0
        for g in GUIDELINES:
            if args.dry_run:
                added += 1
                continue
            db.add(
                MethodGuideline(
                    skill_element=g["skill_element"],
                    error_bg=g["error_bg"],
                    correction_bg=g["correction_bg"],
                    age_band=g.get("age_band", "all"),
                    sort_order=g.get("sort_order", 0),
                    status="published",
                    published_at=now,
                )
            )
            added += 1
        if not args.dry_run:
            db.commit()
        print(f"Before: {before} rows. Seed: {added} guidelines (dry_run={args.dry_run}).")
        # preview dedupe on merged
        pairs = [{"error": g["error_bg"], "correction": g["correction_bg"]} for g in GUIDELINES]
        print(f"Unique errors in seed: {len(dedupe_guideline_pairs(pairs))}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
