"""Интеграционен тест за услугата за възрастов еквивалент (Фаза 4)."""
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
    AssessmentNorm,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    Club,
    TestDefinition,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.services.age_equivalent_service import compute_athlete_age_equivalent  # noqa: E402

_TABLES = [
    TestDefinition.__table__,
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    AssessmentNorm.__table__,
    Athlete.__table__,
    Club.__table__,
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


class AgeEquivalentServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = db = _make_session()
        year = date.today().year
        db.add(TestDefinition(code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
                              unit="cm", direction=TestDirection.higher_better, sort_order=1))
        db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.endline,
                                start_date=date(2026, 5, 1)))
        db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))

        rid = 1
        aid = 1
        # Крива по възрасти (момичета): U10=130, U11=140, U12=150, U13=160; по 5 деца.
        means = {10: 130.0, 11: 140.0, 12: 150.0, 13: 160.0}
        for age, mean in means.items():
            for _ in range(5):
                db.add(Athlete(id=aid, coach_id=1, athlete_name=f"Дете {aid}",
                               birth_year=year - age, gender="female"))
                db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                        test_code="PHYS_LONGJUMP", raw_value=mean))
                aid += 1
                rid += 1

        # Целево дете: U10, но скача 150 (= средното за U12).
        self.target_id = aid
        db.add(Athlete(id=aid, coach_id=1, athlete_name="Талант", birth_year=year - 10, gender="female"))
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                test_code="PHYS_LONGJUMP", raw_value=150.0))
        db.commit()

    def tearDown(self):
        self.db.close()

    def test_age_equivalent_in_range(self):
        profile = compute_athlete_age_equivalent(self.db, self.target_id)
        self.assertIsNotNone(profile)
        self.assertEqual(profile.own_age, 10.0)
        self.assertEqual(len(profile.tests), 1)
        t = profile.tests[0]
        self.assertEqual(t.test_code, "PHYS_LONGJUMP")
        self.assertEqual(t.status, "in_range")
        self.assertEqual(t.equivalent_age, 12.0)
        self.assertEqual(t.delta_years, 2.0)

    def test_missing_athlete_returns_none(self):
        self.assertIsNone(compute_athlete_age_equivalent(self.db, 9999))


if __name__ == "__main__":
    unittest.main()
