"""Тестове на endpoint-а GET /athletes/{id}/talent-profile (ниво рутер).

Извикват функцията на рутера директно с реална sqlite сесия и фиктивен
потребител — покриват достъпа (403/404), обогатяването с имена на тестове и
сглобяването на изходната схема. Цялата сметка зад тях е тествана отделно.
"""
import os
import sys
import unittest
from datetime import date, datetime

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException  # noqa: E402
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
    UserRole,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.routers.assessments import athlete_talent_profile  # noqa: E402

_TABLES = [
    TestDefinition.__table__,
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    Athlete.__table__,
]


class _FakeUser:
    def __init__(self, user_id, role, club_id=None):
        self.id = user_id
        self.role = role
        self.club_id = club_id


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
    db.add(
        TestDefinition(
            id=1, code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
            unit="cm", direction=TestDirection.higher_better, sort_order=1,
        )
    )
    # Дете на коуч #10 (за проверка на достъпа).
    db.add(Athlete(id=1, coach_id=10, athlete_name="Малък талант", birth_year=year - 10, gender="female"))
    db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)))
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
    db.add(AssessmentResult(id=1, session_id=1, athlete_id=1, test_code="PHYS_LONGJUMP", raw_value=219.5))
    db.commit()


class TalentProfileEndpointTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        _seed(self.db)
        self.admin = _FakeUser(1, UserRole.platform_admin)

    def tearDown(self):
        self.db.close()

    def test_returns_profile_with_enriched_test_name(self):
        out = athlete_talent_profile(1, db=self.db, current_user=self.admin)
        self.assertEqual(out.athlete_id, 1)
        self.assertEqual(out.athlete_name, "Малък талант")
        self.assertEqual(out.reference_age_band, "U13")
        self.assertTrue(out.covered)
        self.assertTrue(out.is_aspirational)
        self.assertEqual(len(out.tests), 1)
        self.assertEqual(out.tests[0].test_code, "PHYS_LONGJUMP")
        self.assertEqual(out.tests[0].test_name, "Дълъг скок")
        self.assertEqual(out.tests[0].talent_label, "Отлично")

    def test_missing_athlete_404(self):
        with self.assertRaises(HTTPException) as ctx:
            athlete_talent_profile(999, db=self.db, current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_foreign_coach_forbidden_403(self):
        # Коуч #99 не е собственик на детето (coach_id=10) → 403.
        other_coach = _FakeUser(99, UserRole.coach)
        with self.assertRaises(HTTPException) as ctx:
            athlete_talent_profile(1, db=self.db, current_user=other_coach)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
