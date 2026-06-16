"""Smoke check for BVF method data (textbook, annual program, drills).

Usage:
  python -m app.scripts.check_bvf_health
"""
from __future__ import annotations

from app.database import SessionLocal
from app.models import Drill, MethodCycle
from app.national_method.textbook_index import textbook_navigation


def main() -> int:
    db = SessionLocal()
    try:
        idx = textbook_navigation()
        session_plans = sum(len(v or []) for v in (idx.get("session_plans_by_age") or {}).values())
        meso = (
            db.query(MethodCycle)
            .filter(MethodCycle.cycle_type == "meso", MethodCycle.status == "published")
            .count()
        )
        drills = db.query(Drill).filter(Drill.scope == "federation").count()
        print(f"textbook_sections={idx.get('section_count', 0)}")
        print(f"session_plans={session_plans}")
        print(f"meso_cycles_published={meso}")
        print(f"federation_drills={drills}")
        ok = session_plans >= 20 and meso >= 30 and drills >= 50
        print("status=OK" if ok else "status=NEEDS_SEED")
        return 0 if ok else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
