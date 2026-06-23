"""Тестове за „Участие по тест" във федеративното табло (Фаза 3).

Доказват: дялът измерени се смята спрямо тестваните деца; ниският дял се
маркира; антропометрията се изключва; редовете са сортирани с проблемите
най-отгоре.
"""
import os
import sys
import unittest
from datetime import date, datetime

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

os.environ.setdefault("DATABASE_URL", "sqlite://")

from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    TestDefinition,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.services.assessment_dashboard import _participation  # noqa: E402

_TABLES = [
    TestDefinition.__table__,
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    Athlete.__table__,
]


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _register_now(dbapi_conn, _record):
        dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().isoformat(sep=" "))

    Base.metadata.create_all(bind=engine, tables=_TABLES)
    return sessionmaker(bind=engine, autoflush=False)()


class ParticipationTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        year = date.today().year
        db = self.db
        db.add(TestDefinition(code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
                              unit="cm", direction=TestDirection.higher_better, sort_order=1))
        db.add(TestDefinition(code="SERVE_ACC", name="Точност подаване", category=TestCategory.technical,
                              unit="pts", direction=TestDirection.higher_better, sort_order=2))
        db.add(TestDefinition(code="ANTH_HEIGHT", name="Височина", category=TestCategory.anthropometry,
                              unit="cm", direction=TestDirection.context, sort_order=3))
        db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.endline,
                                start_date=date(2026, 5, 1)))
        db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))

        rid = 1
        for i in range(10):
            aid = i + 1
            db.add(Athlete(id=aid, coach_id=1, athlete_name=f"Дете {i}",
                           birth_year=year - 13, gender="female"))
            # Всички с дълъг скок и височина; само 6 с точност подаване.
            db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                    test_code="PHYS_LONGJUMP", raw_value=150.0 + i)); rid += 1
            db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                    test_code="ANTH_HEIGHT", raw_value=160.0 + i)); rid += 1
            if i < 6:
                db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                        test_code="SERVE_ACC", raw_value=5.0 + i)); rid += 1
        db.commit()
        self.window = db.get(AssessmentWindow, 1)

    def tearDown(self):
        self.db.close()

    def test_participation_and_low_flag(self):
        rows = _participation(self.db, self.window, gender=None, age_band=None)
        by_code = {r["test_code"]: r for r in rows}

        self.assertIn("PHYS_LONGJUMP", by_code)
        self.assertIn("SERVE_ACC", by_code)
        self.assertNotIn("ANTH_HEIGHT", by_code)  # антропометрията се изключва

        lj = by_code["PHYS_LONGJUMP"]
        self.assertEqual(lj["tested_total"], 10)
        self.assertEqual(lj["measured"], 10)
        self.assertEqual(lj["participation_pct"], 100.0)
        self.assertFalse(lj["is_low"])

        sv = by_code["SERVE_ACC"]
        self.assertEqual(sv["measured"], 6)
        self.assertEqual(sv["participation_pct"], 60.0)
        self.assertTrue(sv["is_low"])

    def test_sorted_problems_first(self):
        rows = _participation(self.db, self.window, gender=None, age_band=None)
        self.assertEqual(rows[0]["test_code"], "SERVE_ACC")  # най-пропусканият най-отгоре


if __name__ == "__main__":
    unittest.main()
