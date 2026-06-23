"""Характеризационни тестове за ADR-003 Стъпка 3 (Confidence Engine integration).

Доказват, че `NormResolver.resolve()` дава ИДЕНТИЧЕН изход след централизирането
на confidence/eligibility през ADR-003 модула:

  • Assessment Norm път → source=assessment_norm, confidence=medium, mean/std от нормата;
  • Cohort път        → source=cohort, confidence=low;
  • Neutral път       → source=neutral, confidence=indicative, applicable=False.

Допълнително показват, че абстракциите се „събуждат" САМО при налична maturity
metadata (бъдеще) — без да променят днешното поведение.
"""
import os
import sys
import unittest
from datetime import datetime

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
)
from app.models_assessment import AssessmentSessionStatus  # noqa: E402
from app.services.norm_resolver import NormResolver, NormSource  # noqa: E402
from app.services import norm_confidence as nc  # noqa: E402

_TABLES = [
    AssessmentNorm.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
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


def _add_norm(db, **kw):
    defaults = dict(
        test_code="T_NORM", age_band="U14", gender="male",
        mean_value=10.0, std_value=2.0, sample_count=25, source="computed",
    )
    defaults.update(kw)
    db.add(AssessmentNorm(**defaults))
    db.commit()


def _add_cohort(db, test_code, values):
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
    rid = 1
    for aid, val in enumerate(values, start=1):
        db.add(
            AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code=test_code, raw_value=val)
        )
        rid += 1
    db.commit()


class ResolverPathCharacterizationTests(unittest.TestCase):
    def test_assessment_norm_path(self):
        db = _make_session()
        try:
            _add_norm(db)
            r = NormResolver(db, window_id=1).resolve("T_NORM", "U14", "male")
            self.assertEqual(r.source, NormSource.ASSESSMENT_NORM)
            self.assertEqual(r.confidence, nc.ConfidenceLevel.MEDIUM)
            self.assertTrue(r.applicable)
            self.assertFalse(r.is_indicative)
            self.assertEqual(r.mean, 10.0)
            self.assertEqual(r.std, 2.0)
        finally:
            db.close()

    def test_cohort_path(self):
        db = _make_session()
        try:
            _add_cohort(db, "T_COH", [9.0, 9.5, 10.0])
            r = NormResolver(db, window_id=1).resolve("T_COH", "U14", "male")
            self.assertEqual(r.source, NormSource.COHORT)
            self.assertEqual(r.confidence, nc.ConfidenceLevel.LOW)
            self.assertTrue(r.applicable)
            self.assertTrue(r.is_indicative)
            self.assertIsNotNone(r.mean)
        finally:
            db.close()

    def test_neutral_path(self):
        db = _make_session()
        try:
            r = NormResolver(db, window_id=1).resolve("T_NONE", "U14", "male")
            self.assertEqual(r.source, NormSource.NEUTRAL)
            self.assertEqual(r.confidence, nc.ConfidenceLevel.INDICATIVE)
            self.assertFalse(r.applicable)
            self.assertTrue(r.is_indicative)
        finally:
            db.close()

    def test_norm_without_metadata_stays_medium(self):
        # Поведенчески неутрално: норма без maturity metadata → MEDIUM (както днес).
        db = _make_session()
        try:
            _add_norm(db, maturity_level=None, coverage=None, season_count=None)
            r = NormResolver(db, window_id=1).resolve("T_NORM", "U14", "male")
            self.assertEqual(r.confidence, nc.ConfidenceLevel.MEDIUM)
        finally:
            db.close()


class ResolverAbstractionWakesUpTests(unittest.TestCase):
    """Доказва, че Confidence Engine/eligibility работят при налична metadata —
    това са БЪДЕЩИ сценарии, които днес не съществуват (metadata = NULL)."""

    def test_mature_metadata_yields_high(self):
        db = _make_session()
        try:
            _add_norm(
                db, sample_count=300, maturity_level=nc.MaturityLevel.MATURE,
                coverage=0.9, season_count=3,
            )
            r = NormResolver(db, window_id=1).resolve("T_NORM", "U14", "male")
            self.assertEqual(r.confidence, nc.ConfidenceLevel.HIGH)
        finally:
            db.close()

    def test_seed_maturity_data_source_not_eligible(self):
        # data-derived (computed→national) с maturity=seed → НЕ е eligible →
        # резолверът пропуска нормата и пада на neutral (няма cohort данни).
        db = _make_session()
        try:
            _add_norm(db, sample_count=300, maturity_level=nc.MaturityLevel.SEED, coverage=0.9)
            r = NormResolver(db, window_id=1).resolve("T_NORM", "U14", "male")
            self.assertEqual(r.source, NormSource.NEUTRAL)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
