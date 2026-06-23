"""Тестове за връстниковото сравнение (процентил).

Чистата математика (`percentile_rank`) се тества пряко; събирането от БД и
`compute_peer_percentile` — през sqlite в паметта (последна стойност на връстник,
филтри по възраст/пол, изключване на самото дете, праг за „индикативно").
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
from app.services.peer_norms import (  # noqa: E402
    compute_peer_percentile,
    peer_latest_values,
    percentile_rank,
)

_TABLES = [
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    Athlete.__table__,
]


class PercentileRankTests(unittest.TestCase):
    def test_higher_better_basic(self):
        peers = [100.0, 110.0, 120.0, 130.0]
        # 125 бие 4-те под него? три (100,110,120) < 125 → 3/4 = 75
        self.assertEqual(percentile_rank(125.0, peers, higher_better=True), 75.0)

    def test_lower_better_basic(self):
        peers = [10.0, 11.0, 12.0, 13.0]
        # по-малко=по-добре: 10.5 бие тези над него (11,12,13) → 3/4 = 75
        self.assertEqual(percentile_rank(10.5, peers, higher_better=False), 75.0)

    def test_ties_count_half(self):
        peers = [100.0, 120.0, 120.0, 140.0]
        # 120: под него 1 (100), равни 2 → (1 + 0.5*2)/4 = 50
        self.assertEqual(percentile_rank(120.0, peers, higher_better=True), 50.0)

    def test_best_and_worst(self):
        peers = [100.0, 110.0, 120.0]
        self.assertEqual(percentile_rank(200.0, peers, higher_better=True), 100.0)
        self.assertEqual(percentile_rank(50.0, peers, higher_better=True), 0.0)

    def test_empty_peers(self):
        self.assertEqual(percentile_rank(100.0, [], higher_better=True), 0.0)


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _register_now(dbapi_conn, _record):
        dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().isoformat(sep=" "))

    Base.metadata.create_all(bind=engine, tables=_TABLES)
    return sessionmaker(bind=engine, autoflush=False)()


class PeerDbTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        self.year = date.today().year
        self._seed()

    def tearDown(self):
        self.db.close()

    def _seed(self):
        u13_birth = self.year - 13
        # Два прозореца, за да проверим „последна стойност печели".
        self.db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)))
        self.db.add(AssessmentWindow(id=2, season="2025/26", phase=AssessmentWindowPhase.endline, start_date=date(2026, 5, 1)))
        self.db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
        self.db.add(AssessmentSession(id=2, window_id=2, team_id=1, status=AssessmentSessionStatus.finalized))

        # 4 момичета U13 + 1 момче U13 (различен пол) + 1 момиче U14 (различна възраст).
        self.db.add(Athlete(id=1, coach_id=1, athlete_name="F1", birth_year=u13_birth, gender="female"))
        self.db.add(Athlete(id=2, coach_id=1, athlete_name="F2", birth_year=u13_birth, gender="female"))
        self.db.add(Athlete(id=3, coach_id=1, athlete_name="F3", birth_year=u13_birth, gender="female"))
        self.db.add(Athlete(id=4, coach_id=1, athlete_name="F4", birth_year=u13_birth, gender="female"))
        self.db.add(Athlete(id=5, coach_id=1, athlete_name="M1", birth_year=u13_birth, gender="male"))
        self.db.add(Athlete(id=6, coach_id=1, athlete_name="F14", birth_year=self.year - 14, gender="female"))

        rid = 1
        def add(session_id, athlete_id, raw):
            nonlocal rid
            self.db.add(AssessmentResult(id=rid, session_id=session_id, athlete_id=athlete_id, test_code="PHYS_LONGJUMP", raw_value=raw))
            rid += 1

        # F1 има стара и нова стойност — новата (200) трябва да се ползва.
        add(1, 1, 150.0)
        add(2, 1, 200.0)
        add(2, 2, 180.0)
        add(2, 3, 160.0)
        add(2, 4, 140.0)
        # Различен пол / възраст — не трябва да влизат в U13 female.
        add(2, 5, 999.0)
        add(2, 6, 999.0)
        self.db.commit()

    def test_latest_value_per_peer_and_filtering(self):
        vals = peer_latest_values(self.db, "PHYS_LONGJUMP", "U13", "female")
        # F1=200 (не 150), F2=180, F3=160, F4=140; без момче/U14.
        self.assertEqual(sorted(vals), [140.0, 160.0, 180.0, 200.0])

    def test_exclude_self(self):
        vals = peer_latest_values(self.db, "PHYS_LONGJUMP", "U13", "female", exclude_athlete_id=1)
        self.assertEqual(sorted(vals), [140.0, 160.0, 180.0])

    def test_compute_percentile_excludes_self_and_is_indicative(self):
        # Дете F1 (200) спрямо връстничките без себе си: [140,160,180] → бие 3/3 = 100.
        cmp = compute_peer_percentile(
            self.db, "PHYS_LONGJUMP", "U13", "female", 200.0,
            higher_better=True, exclude_athlete_id=1,
        )
        self.assertIsNotNone(cmp)
        self.assertEqual(cmp.percentile, 100.0)
        self.assertEqual(cmp.sample_size, 3)
        self.assertTrue(cmp.is_indicative)  # 3 < 20

    def test_none_when_no_peers(self):
        cmp = compute_peer_percentile(
            self.db, "PHYS_LONGJUMP", "U13", "male", 100.0, higher_better=True, exclude_athlete_id=5
        )
        # Само едно момче U13 и то е изключено → няма връстници.
        self.assertIsNone(cmp)

    def test_none_when_value_missing(self):
        cmp = compute_peer_percentile(
            self.db, "PHYS_LONGJUMP", "U13", "female", None, higher_better=True
        )
        self.assertIsNone(cmp)


if __name__ == "__main__":
    unittest.main()
