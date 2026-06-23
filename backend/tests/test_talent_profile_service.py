"""Интеграционни тестове за услугата „Профил на таланта" (БД слой).

Доказват:
  • compute_athlete_talent_profile сглобява профил от реалните резултати на детето;
  • взема се ПОСЛЕДНАТА непразна стойност за тест (по-нов прозорец печели);
  • непокрит тест (без репер 2022) не влиза в профила;
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
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
)
from app.national_method.national_norms_2022 import (  # noqa: E402
    LEVEL_EXCELLENT,
    LEVEL_VERY_GOOD,
    score_2022,
)
from app.services.talent_profile_service import compute_athlete_talent_profile  # noqa: E402

_TABLES = [
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
    db.add(Athlete(id=1, coach_id=1, athlete_name="Малък талант", birth_year=year - 10, gender="female"))

    # По-стар прозорец (baseline) и по-нов (endline) от същия сезон.
    db.add(
        AssessmentWindow(
            id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)
        )
    )
    db.add(
        AssessmentWindow(
            id=2, season="2025/26", phase=AssessmentWindowPhase.endline, start_date=date(2026, 5, 1)
        )
    )
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
    db.add(AssessmentSession(id=2, window_id=2, team_id=1, status=AssessmentSessionStatus.finalized))

    # PHYS_LONGJUMP в двата прозореца — по-новият (219.5) трябва да спечели.
    db.add(AssessmentResult(id=1, session_id=1, athlete_id=1, test_code="PHYS_LONGJUMP", raw_value=180.0))
    db.add(AssessmentResult(id=2, session_id=2, athlete_id=1, test_code="PHYS_LONGJUMP", raw_value=219.5))
    # PHYS_MEDBALL само в стария прозорец.
    db.add(AssessmentResult(id=3, session_id=1, athlete_id=1, test_code="PHYS_MEDBALL", raw_value=595.0))
    # Непокрит тест (няма репер 2022) — не трябва да влиза в профила.
    db.add(AssessmentResult(id=4, session_id=2, athlete_id=1, test_code="PHYS_JUMP_1ARM", raw_value=50.0))
    db.commit()


class TalentProfileServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        _seed(self.db)

    def tearDown(self):
        self.db.close()

    def test_profile_built_against_u13_reference(self):
        profile = compute_athlete_talent_profile(self.db, 1)
        self.assertIsNotNone(profile)
        self.assertTrue(profile.covered)
        self.assertEqual(profile.age_band, "U10")
        self.assertEqual(profile.reference_age_band, "U13")
        self.assertTrue(profile.is_aspirational)

    def test_uses_latest_value_per_test(self):
        profile = compute_athlete_talent_profile(self.db, 1)
        by_code = {t.test_code: t for t in profile.tests}
        self.assertIn("PHYS_LONGJUMP", by_code)
        # По-новата стойност (219.5), не старата (180.0).
        self.assertEqual(by_code["PHYS_LONGJUMP"].raw_value, 219.5)
        self.assertEqual(
            by_code["PHYS_LONGJUMP"].talent_score,
            score_2022(219.5, "PHYS_LONGJUMP", "U13", "female"),
        )
        self.assertEqual(by_code["PHYS_LONGJUMP"].talent_label, LEVEL_EXCELLENT)
        self.assertEqual(by_code["PHYS_MEDBALL"].talent_label, LEVEL_VERY_GOOD)

    def test_uncovered_test_excluded(self):
        profile = compute_athlete_talent_profile(self.db, 1)
        codes = {t.test_code for t in profile.tests}
        self.assertNotIn("PHYS_JUMP_1ARM", codes)
        self.assertEqual(codes, {"PHYS_LONGJUMP", "PHYS_MEDBALL"})

    def test_missing_athlete_returns_none(self):
        self.assertIsNone(compute_athlete_talent_profile(self.db, 999))


if __name__ == "__main__":
    unittest.main()
