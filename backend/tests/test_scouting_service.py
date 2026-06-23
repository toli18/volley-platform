"""Интеграционни тестове за скаутската таблица (услугата).

Проверяват:
  • последна стойност на дете (по-нов прозорец печели);
  • сравнение А — стандарт 2022 за покрит тест, None за непокрит;
  • сравнение Б — връстников процентил (без самото дете) + флаг „индикативно";
  • празна клетка при липсващ резултат.
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
from app.national_method.national_norms_2022 import score_2022  # noqa: E402
from app.services.scouting_service import build_scouting_table  # noqa: E402

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


class ScoutingServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        self.year = date.today().year
        self._seed()
        self.tests = self.db.query(TestDefinition).order_by(TestDefinition.sort_order).all()

    def tearDown(self):
        self.db.close()

    def _seed(self):
        u13 = self.year - 13
        self.db.add(TestDefinition(id=1, code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical, unit="cm", direction=TestDirection.higher_better, sort_order=1))
        self.db.add(TestDefinition(id=2, code="PHYS_JUMP_1ARM", name="Отскок с една ръка", category=TestCategory.physical, unit="cm", direction=TestDirection.higher_better, sort_order=2))

        for aid in (1, 2, 3, 4):
            self.db.add(Athlete(id=aid, coach_id=1, athlete_name=f"F{aid}", birth_year=u13, gender="female"))

        self.db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)))
        self.db.add(AssessmentWindow(id=2, season="2025/26", phase=AssessmentWindowPhase.endline, start_date=date(2026, 5, 1)))
        self.db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
        self.db.add(AssessmentSession(id=2, window_id=2, team_id=1, status=AssessmentSessionStatus.finalized))

        rid = 1
        def add(session_id, athlete_id, code, raw):
            nonlocal rid
            self.db.add(AssessmentResult(id=rid, session_id=session_id, athlete_id=athlete_id, test_code=code, raw_value=raw))
            rid += 1

        # Дълъг скок: F1 има стара (150) и нова (220); останалите по една.
        add(1, 1, "PHYS_LONGJUMP", 150.0)
        add(2, 1, "PHYS_LONGJUMP", 220.0)
        add(2, 2, "PHYS_LONGJUMP", 180.0)
        add(2, 3, "PHYS_LONGJUMP", 160.0)
        add(2, 4, "PHYS_LONGJUMP", 140.0)
        # Непокрит от 2022 тест — само за F1.
        add(2, 1, "PHYS_JUMP_1ARM", 60.0)
        self.db.commit()

    def test_latest_value_and_2022_and_peer(self):
        athletes = self.db.query(Athlete).filter(Athlete.id == 1).all()
        rows = build_scouting_table(self.db, athletes, self.tests, ref_year=self.year)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.age_band, "U13")
        cell = {c.test_code: c for c in row.cells}

        lj = cell["PHYS_LONGJUMP"]
        # Последна стойност = 220 (не 150).
        self.assertEqual(lj.raw_value, 220.0)
        # Стандарт 2022 за U13 female longjump.
        self.assertEqual(lj.score_2022, score_2022(220.0, "PHYS_LONGJUMP", "U13", "female"))
        self.assertIsNotNone(lj.score_2022_label)
        # Връстници без себе си: [180,160,140] → 220 бие и трите = 100.
        self.assertEqual(lj.peer_percentile, 100.0)
        self.assertEqual(lj.peer_sample, 3)
        self.assertTrue(lj.peer_indicative)

    def test_uncovered_test_has_no_2022_score(self):
        athletes = self.db.query(Athlete).filter(Athlete.id == 1).all()
        rows = build_scouting_table(self.db, athletes, self.tests, ref_year=self.year)
        cell = {c.test_code: c for c in rows[0].cells}
        one_arm = cell["PHYS_JUMP_1ARM"]
        self.assertEqual(one_arm.raw_value, 60.0)
        self.assertIsNone(one_arm.score_2022)  # няма репер 2022
        # Само F1 има този тест → няма връстници.
        self.assertIsNone(one_arm.peer_percentile)

    def test_empty_cell_when_no_result(self):
        # F2 няма резултат за PHYS_JUMP_1ARM → празна клетка.
        athletes = self.db.query(Athlete).filter(Athlete.id == 2).all()
        rows = build_scouting_table(self.db, athletes, self.tests, ref_year=self.year)
        cell = {c.test_code: c for c in rows[0].cells}
        self.assertIsNone(cell["PHYS_JUMP_1ARM"].raw_value)
        self.assertIsNone(cell["PHYS_JUMP_1ARM"].score_2022)
        self.assertIsNone(cell["PHYS_JUMP_1ARM"].peer_percentile)

    def test_peer_percentile_midfield(self):
        # F3 (160) спрямо [220,180,140] → бие само 140 → 1/3 = 33.3.
        athletes = self.db.query(Athlete).filter(Athlete.id == 3).all()
        rows = build_scouting_table(self.db, athletes, self.tests, ref_year=self.year)
        lj = {c.test_code: c for c in rows[0].cells}["PHYS_LONGJUMP"]
        self.assertEqual(lj.peer_percentile, 33.3)
        self.assertEqual(lj.peer_sample, 3)


if __name__ == "__main__":
    unittest.main()
