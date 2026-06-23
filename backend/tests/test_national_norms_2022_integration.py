"""Интеграционни характеризационни тестове за активирания репер 2022.

Прокарват реален резултат през целия scoring pipeline (`compute_session_scores`)
и доказват:

  • покрита клетка (момчета U14, PHYS_LONGJUMP) → source=national_2022,
    оценката идва от нивата 2022 (банди), маркирана е като индикативна;
  • непокрит тест (PHYS_JUMP_1ARM, няма го в таблиците 2022) → пада на cohort,
    точно както досега;
  • оценките по нива съвпадат с публикуваните граници (Отлично→80, и т.н.).
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
from app.national_method.national_norms_2022 import score_2022  # noqa: E402
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
    def _register_now(dbapi_conn, _record):
        dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().isoformat(sep=" "))

    Base.metadata.create_all(bind=engine, tables=_TABLES)
    return sessionmaker(bind=engine, autoflush=False)()


# Момчета 14-15 дълъг скок: граници Задоволително/Мн.добро/Отлично ≈ 190.5/219.5/250.5.
_LONGJUMP_RAW = {1: 250.5, 2: 219.5, 3: 190.5}
# Непокрит тест (няма го в 2022) — произволни стойности с ненулево отклонение.
_ONEARM_RAW = {1: 260.0, 2: 250.0, 3: 240.0}


def _seed(db):
    year = date.today().year
    birth_year = year - 14  # → age_band "U14"

    db.add(
        TestDefinition(
            id=1, code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
            unit="cm", direction=TestDirection.higher_better, sort_order=1,
        )
    )
    db.add(
        TestDefinition(
            id=2, code="PHYS_JUMP_1ARM", name="Отскок с една ръка", category=TestCategory.physical,
            unit="cm", direction=TestDirection.higher_better, sort_order=2,
        )
    )
    for aid in (1, 2, 3):
        db.add(Athlete(id=aid, coach_id=1, athlete_name=f"A{aid}", birth_year=birth_year, gender="male"))

    db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline))
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))

    rid = 1
    for aid in (1, 2, 3):
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code="PHYS_LONGJUMP", raw_value=_LONGJUMP_RAW[aid]))
        rid += 1
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code="PHYS_JUMP_1ARM", raw_value=_ONEARM_RAW[aid]))
        rid += 1
    db.commit()


def _run():
    db = _make_session()
    try:
        _seed(db)
        session = db.get(AssessmentSession, 1)
        compute_session_scores(db, session)
        db.commit()
        return {
            (r.athlete_id, r.test_code): (r.normalized, r.is_indicative, r.norm_source)
            for r in db.query(AssessmentResult).all()
        }
    finally:
        db.close()


class National2022IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.snap = _run()

    def test_covered_cell_uses_2022_reference(self):
        for aid in (1, 2, 3):
            normalized, is_indicative, source = self.snap[(aid, "PHYS_LONGJUMP")]
            self.assertEqual(source, "national_2022")
            self.assertTrue(is_indicative, "реперът 2022 трябва да е индикативен")
            self.assertEqual(normalized, score_2022(_LONGJUMP_RAW[aid], "PHYS_LONGJUMP", "U14", "male"))

    def test_published_grade_boundaries_map_as_expected(self):
        # граница „Отлично" → 80, „Много добро" → 60, „Задоволително" → 40
        self.assertEqual(self.snap[(1, "PHYS_LONGJUMP")][0], 80.0)
        self.assertEqual(self.snap[(2, "PHYS_LONGJUMP")][0], 60.0)
        self.assertEqual(self.snap[(3, "PHYS_LONGJUMP")][0], 40.0)

    def test_uncovered_test_falls_back_to_cohort(self):
        # PHYS_JUMP_1ARM го няма в таблиците 2022 → cohort (както досега).
        _, is_indicative, source = self.snap[(1, "PHYS_JUMP_1ARM")]
        self.assertEqual(source, "cohort")
        self.assertTrue(is_indicative)


if __name__ == "__main__":
    unittest.main()
