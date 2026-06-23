"""Интеграционни тестове за услугата „Мотивационен изглед" (БД слой).

Доказват:
  • compute_athlete_motivation сглобява личен рекорд, подобрение и следваща цел;
  • антропометрията се изключва;
  • следващата цел стъпва на нивата 2022 за СОБСТВЕНАТА възраст;
  • връстниковият процентил се пресмята спрямо другите деца в системата;
  • липсващо дете → None.

ВАЖНО: услугата само чете — не пише в БД и не пипа официалните оценки.
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
from app.national_method.national_norms_2022 import (  # noqa: E402
    LEVEL_EXCELLENT,
    LEVEL_SATISFACTORY,
    score_2022,
)
from app.services.motivation_service import compute_athlete_motivation  # noqa: E402

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


def _seed(db):
    year = date.today().year
    # Дете U13, момиче (собствената възраст е покрита от 2022).
    db.add(Athlete(id=1, coach_id=1, athlete_name="Мотивирано дете", birth_year=year - 13, gender="female"))
    # Връстник за процентила (същи пол и възраст).
    db.add(Athlete(id=2, coach_id=1, athlete_name="Връстник", birth_year=year - 13, gender="female"))

    db.add(TestDefinition(
        code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
        unit="cm", direction=TestDirection.higher_better, sort_order=1,
    ))
    db.add(TestDefinition(
        code="SPEED_9363", name="Бързина 9-3-6-3-9", category=TestCategory.speed,
        unit="sec", direction=TestDirection.lower_better, sort_order=2,
    ))
    db.add(TestDefinition(
        code="ANTH_HEIGHT", name="Ръст", category=TestCategory.anthropometry,
        unit="cm", direction=TestDirection.context, sort_order=3,
    ))

    db.add(AssessmentWindow(
        id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)
    ))
    db.add(AssessmentWindow(
        id=2, season="2025/26", phase=AssessmentWindowPhase.endline, start_date=date(2026, 5, 1)
    ))
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
    db.add(AssessmentSession(id=2, window_id=2, team_id=1, status=AssessmentSessionStatus.finalized))

    # Дете 1: дълъг скок 180 → 200 (подобрение, нов рекорд).
    db.add(AssessmentResult(id=1, session_id=1, athlete_id=1, test_code="PHYS_LONGJUMP", raw_value=180.0))
    db.add(AssessmentResult(id=2, session_id=2, athlete_id=1, test_code="PHYS_LONGJUMP", raw_value=200.0))
    # Дете 1: бързина 10.5 → 10.0 (по-малко = по-добре → подобрение).
    db.add(AssessmentResult(id=3, session_id=1, athlete_id=1, test_code="SPEED_9363", raw_value=10.5))
    db.add(AssessmentResult(id=4, session_id=2, athlete_id=1, test_code="SPEED_9363", raw_value=10.0))
    # Антропометрия — трябва да се изключи.
    db.add(AssessmentResult(id=5, session_id=2, athlete_id=1, test_code="ANTH_HEIGHT", raw_value=160.0))
    # Връстник: по-слаб дълъг скок (170) → детето е по-добро от него.
    db.add(AssessmentResult(id=6, session_id=2, athlete_id=2, test_code="PHYS_LONGJUMP", raw_value=170.0))
    db.commit()


class MotivationServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        _seed(self.db)

    def tearDown(self):
        self.db.close()

    def test_profile_basic(self):
        p = compute_athlete_motivation(self.db, 1)
        self.assertIsNotNone(p)
        self.assertEqual(p.age_band, "U13")
        self.assertEqual(p.reference_age_band, "U13")

    def test_anthropometry_excluded(self):
        p = compute_athlete_motivation(self.db, 1)
        codes = {t.test_code for t in p.tests}
        self.assertEqual(codes, {"PHYS_LONGJUMP", "SPEED_9363"})

    def test_longjump_progress_and_goal(self):
        p = compute_athlete_motivation(self.db, 1)
        lj = next(t for t in p.tests if t.test_code == "PHYS_LONGJUMP")
        self.assertEqual(lj.latest, 200.0)
        self.assertEqual(lj.personal_best, 200.0)
        self.assertTrue(lj.is_personal_best)
        self.assertTrue(lj.is_new_record)
        self.assertEqual(lj.prev, 180.0)
        self.assertEqual(lj.delta, 20.0)
        self.assertTrue(lj.improved)
        # Следваща цел: към „Отлично" (219.5) за U13 момичета.
        self.assertIsNotNone(lj.next_goal)
        self.assertEqual(lj.next_goal.target_raw, 219.5)
        self.assertEqual(lj.next_goal.next_level, LEVEL_EXCELLENT)
        # Талант (спрямо U13) и връстников процентил присъстват.
        self.assertEqual(lj.talent_score, score_2022(200.0, "PHYS_LONGJUMP", "U13", "female"))
        self.assertIsNotNone(lj.peer_percentile)
        self.assertEqual(lj.peer_percentile, 100.0)  # бие единствения връстник (170)
        self.assertEqual(lj.peer_sample, 1)

    def test_speed_lower_better_goal(self):
        p = compute_athlete_motivation(self.db, 1)
        sp = next(t for t in p.tests if t.test_code == "SPEED_9363")
        self.assertFalse(sp.higher_better)
        self.assertTrue(sp.improved)  # 10.5 → 10.0 е по-бързо
        self.assertIsNotNone(sp.next_goal)
        self.assertEqual(sp.next_goal.target_raw, 9.995)
        self.assertEqual(sp.next_goal.next_level, LEVEL_SATISFACTORY)

    def test_summary_counts(self):
        p = compute_athlete_motivation(self.db, 1)
        self.assertEqual(p.improved_count, 2)
        self.assertEqual(p.personal_best_count, 2)

    def test_missing_athlete_returns_none(self):
        self.assertIsNone(compute_athlete_motivation(self.db, 999))


if __name__ == "__main__":
    unittest.main()
