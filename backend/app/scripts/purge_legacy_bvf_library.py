"""
Премахва от БД английско / GTP / PDF / машинно преведено съдържание.

  python -m app.scripts.purge_legacy_bvf_library
  python -m app.scripts.purge_legacy_bvf_library --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.national_method.content_policy import purge_legacy_library


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        stats = purge_legacy_library(db, dry_run=args.dry_run)
        print(stats)
    finally:
        db.close()


if __name__ == "__main__":
    main()
