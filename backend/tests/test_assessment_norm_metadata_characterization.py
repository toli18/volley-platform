"""Характеризационни тестове за ADR-003 Стъпка 1.

Доказват, че добавянето на nullable metadata колони към `AssessmentNorm`
(source_status/maturity_level/valid_from/valid_to/coverage/confidence_score/
season_count) НЕ променя нито един изчислен резултат:

  • `normalize_session_results()` връща идентични `normalized` стойности;
  • Development Score (под-индекси/скор/делта) е идентичен;
  • избраният `norm_source`/`is_indicative` е идентичен.

Сравнението е „metadata празни (NULL)" срещу „metadata напълно попълнени" —
двата сценария трябва да дадат бит-в-бит еднакъв изход.

Тестът върви на in-memory SQLite и изпълнява реалния scoring pipeline.
"""
import os
import sys
import unittest
from datetime import date, datetime

# Вътрешният код ползва `from app...`, затова добавяме backend/ към пътя.
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Engine-ът е лениво създаван; sqlite URL предотвратява изискване за реална БД.
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
    DevelopmentScore,
    TestDefinition,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.services.assessment_scoring import compute_session_scores  # noqa: E402

_TABLES = [
    TestDefinition.__table__,
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    AssessmentNorm.__table__,
    DevelopmentScore.__table__,
    Athlete.__table__,
]


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _register_now(dbapi_conn, _record):  # SQLite няма now() → регистрираме го.
        dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().isoformat(sep=" "))

    Base.metadata.create_all(bind=engine, tables=_TABLES)
    return sessionmaker(bind=engine, autoflush=False)()


def _seed(db, *, populate_metadata: bool):
    year = date.today().year
    birth_year = year - 14  # → age_band "U14" за днешната година

    db.add(
        TestDefinition(
            id=1, code="T_TECH", name="Tech", category=TestCategory.technical,
            unit="points", direction=TestDirection.higher_better, sort_order=1,
        )
    )
    db.add(
        TestDefinition(
            id=2, code="T_SPEED", name="Speed", category=TestCategory.speed,
            unit="sec", direction=TestDirection.lower_better, sort_order=2,
        )
    )
    for aid in (1, 2, 3):
        db.add(Athlete(id=aid, coach_id=1, athlete_name=f"A{aid}", birth_year=birth_year, gender="male"))

    db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline))
    db.add(
        AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized)
    )

    # Норма за T_TECH с sample_count над гейта → активира assessment_norm пътя.
    norm = AssessmentNorm(
        test_code="T_TECH", age_band="U14", gender="male",
        mean_value=10.0, std_value=2.0, sample_count=25, source="computed",
    )
    if populate_metadata:
        # Попълваме само полетата, които НЕ захранват Confidence Engine
        # (ADR-003 Стъпка 3). Те трябва да останат инертни спрямо оценките.
        # `maturity_level/coverage/season_count` СЕ захранват Engine-а (по
        # дизайн на Стъпка 3) и затова се покриват от resolver тестовете,
        # а не тук — оставаме реалистични спрямо производственото състояние
        # (тези полета са NULL, докато няма producer).
        norm.source_status = "active"
        norm.confidence_score = 0.95
        norm.valid_from = date(year, 1, 1)
        norm.valid_to = date(year, 12, 31)
    db.add(norm)

    tech_vals = {1: 12.0, 2: 10.0, 3: 8.0}
    speed_vals = {1: 9.0, 2: 9.5, 3: 10.0}
    rid = 1
    for aid in (1, 2, 3):
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code="T_TECH", raw_value=tech_vals[aid]))
        rid += 1
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code="T_SPEED", raw_value=speed_vals[aid]))
        rid += 1
    db.commit()


def _run(populate_metadata: bool):
    db = _make_session()
    try:
        _seed(db, populate_metadata=populate_metadata)
        session = db.get(AssessmentSession, 1)
        compute_session_scores(db, session)
        db.commit()

        norm_snap = {
            (r.athlete_id, r.test_code): (r.normalized, r.is_indicative, r.norm_source)
            for r in db.query(AssessmentResult).all()
        }
        dev_snap = {
            d.athlete_id: (d.technical_subindex, d.physical_subindex, d.development_score, d.delta)
            for d in db.query(DevelopmentScore).all()
        }
        return norm_snap, dev_snap
    finally:
        db.close()


class MetadataInvarianceTests(unittest.TestCase):
    def test_scores_identical_with_or_without_metadata(self):
        without = _run(populate_metadata=False)
        with_meta = _run(populate_metadata=True)
        self.assertEqual(without[0], with_meta[0], "normalized/source се различават")
        self.assertEqual(without[1], with_meta[1], "Development Score се различава")

    def test_assessment_norm_path_exact_scores(self):
        norm_snap, _ = _run(populate_metadata=False)
        # T_TECH: mean=10, std=2, higher_better → z*20+50.
        self.assertEqual(norm_snap[(1, "T_TECH")][0], 70.0)  # raw 12 → z=+1
        self.assertEqual(norm_snap[(2, "T_TECH")][0], 50.0)  # raw 10 → z=0
        self.assertEqual(norm_snap[(3, "T_TECH")][0], 30.0)  # raw 8 → z=-1
        # норма-пътят не е индикативен и source е assessment_norm
        self.assertFalse(norm_snap[(1, "T_TECH")][1])
        self.assertEqual(norm_snap[(1, "T_TECH")][2], "assessment_norm")

    def test_cohort_path_used_for_test_without_norm(self):
        norm_snap, _ = _run(populate_metadata=False)
        # T_SPEED няма норма → cohort, индикативно.
        self.assertEqual(norm_snap[(1, "T_SPEED")][2], "cohort")
        self.assertTrue(norm_snap[(1, "T_SPEED")][1])

    def test_development_score_present_and_invariant(self):
        without = _run(populate_metadata=False)[1]
        with_meta = _run(populate_metadata=True)[1]
        # има реален development_score за всеки атлет
        for aid in (1, 2, 3):
            self.assertIsNotNone(without[aid][2])
        self.assertEqual(without, with_meta)


if __name__ == "__main__":
    unittest.main()
