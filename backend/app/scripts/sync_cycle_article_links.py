"""Фаза B: синхронизация на връзки цикъл ↔ статии."""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal
from app.national_method.cycle_article_links import sync_all_cycle_links


def main():
    db = SessionLocal()
    try:
        stats = sync_all_cycle_links(db)
        db.commit()
        print(stats)
    finally:
        db.close()


if __name__ == "__main__":
    main()
