"""Тестове за разширенията на федеративното табло (Фаза 3):
пирамида на талантите, готовност на нормите, динамика по прозорци.
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
    Club,
    DevelopmentScore,
    Team,
    TestDefinition,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.services.assessment_dashboard import (  # noqa: E402
    _norms_readiness,
    _talent_catch,
    _talent_pyramid,
    _trend,
)


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _register_now(dbapi_conn, _record):
        dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().isoformat(sep=" "))

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False)()


class DashboardPhase3Tests(unittest.TestCase):
    def setUp(self):
        self.db = db = _make_session()
        year = date.today().year
        db.add(Club(id=1, name="Клуб А", city="София"))
        db.add(Team(id=1, name="Отбор 1", club_id=1, coach_id=1, is_active=True))
        db.add(TestDefinition(code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
                              unit="cm", direction=TestDirection.higher_better, sort_order=1))
        db.add(AssessmentWindow(id=1, season="2024/25", phase=AssessmentWindowPhase.baseline,
                                start_date=date(2024, 9, 1)))
        db.add(AssessmentWindow(id=2, season="2025/26", phase=AssessmentWindowPhase.endline,
                                start_date=date(2026, 5, 1)))
        db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
        db.add(AssessmentSession(id=2, window_id=2, team_id=1, status=AssessmentSessionStatus.finalized))

        rid = 1
        for i in range(8):
            aid = i + 1
            gender = "female" if i % 2 == 0 else "male"
            birth = year - 13 if i < 4 else year - 14
            db.add(Athlete(id=aid, coach_id=1, club_id=1, athlete_name=f"Дете {i}",
                           birth_year=birth, gender=gender))
            # Резултати в двата прозореца (за динамика); последният — w2.
            db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                    test_code="PHYS_LONGJUMP", raw_value=140.0 + i)); rid += 1
            db.add(AssessmentResult(id=rid, session_id=2, athlete_id=aid,
                                    test_code="PHYS_LONGJUMP", raw_value=150.0 + i)); rid += 1
            db.add(DevelopmentScore(athlete_id=aid, window_id=2, development_score=50.0 + i, delta=2.0))
        db.commit()

    def tearDown(self):
        self.db.close()

    def test_talent_pyramid_counts(self):
        w2 = self.db.get(AssessmentWindow, 2)
        rows = _talent_pyramid(self.db, w2, age_band=None)
        by_band = {r["age_band"]: r for r in rows}
        # 4 деца U13 (2 момичета, 2 момчета), 4 деца U14.
        total = sum(r["total"] for r in rows)
        self.assertEqual(total, 8)
        for r in rows:
            self.assertEqual(r["female"] + r["male"], r["total"])
            self.assertEqual(r["tested"], r["total"])  # всички са тествани в w2
        self.assertTrue(by_band)

    def test_talent_catch_structure(self):
        w2 = self.db.get(AssessmentWindow, 2)
        rows = _talent_catch(self.db, w2, gender=None, age_band=None)
        # 4 кошчета (U13/U14 × ж/м), всяко с по 2 оценени деца.
        self.assertEqual(len(rows), 4)
        self.assertEqual(sum(r["scored"] for r in rows), 8)
        for r in rows:
            self.assertEqual(r["excellent"] + r["very_good"], r["above_bar"])
            self.assertLessEqual(r["above_bar"], r["scored"])
            self.assertTrue(r["is_indicative"])  # малки кошчета (<5)
            self.assertIn(r["gender"], ("female", "male"))

    def test_talent_catch_counts_above_bar(self):
        # Качваме скока на дете 1 (момиче U13) до „Отлично" спрямо U13 (≥219.5).
        res = (
            self.db.query(AssessmentResult)
            .filter(AssessmentResult.athlete_id == 1, AssessmentResult.session_id == 2)
            .first()
        )
        res.raw_value = 230.0
        self.db.commit()
        w2 = self.db.get(AssessmentWindow, 2)
        rows = _talent_catch(self.db, w2, gender="female", age_band="U13")
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["age_band"], "U13")
        self.assertEqual(row["gender"], "female")
        self.assertGreaterEqual(row["excellent"], 1)
        self.assertGreaterEqual(row["above_bar"], 1)

    def test_norms_readiness_buckets_sum(self):
        rt = _norms_readiness(self.db)
        self.assertGreater(rt["total_cells"], 0)
        self.assertEqual(
            rt["official"] + rt["ready"] + rt["indicative"] + rt["low_data"],
            rt["total_cells"],
        )

    def test_trend_two_points_ordered(self):
        points = _trend(self.db)
        self.assertEqual(len(points), 2)
        self.assertEqual(points[0]["window_id"], 1)  # по-старият първи
        self.assertEqual(points[1]["window_id"], 2)
        self.assertIsNotNone(points[1]["coverage_pct"])
        self.assertIsNotNone(points[1]["avg_development"])


if __name__ == "__main__":
    unittest.main()
