"""Тестове за продуцента на национални норми (Фаза 2).

Доказват:
  • compute_candidates групира последните стойности по клетка и смята статистики;
  • двата прага (показвай от 5, доверявай се от 20) работят;
  • одобрението записва допустима `computed` норма И резолверът започва да я ползва;
  • оттеглянето я прави недопустима (резолверът пада на 2022/кохорта);
  • approve под прага без force хвърля грешка.

ВАЖНО: до одобрение официалните оценки не се променят (резолверът не вижда черновата).
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
    Club,
    TestDefinition,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.services.norm_producer import (  # noqa: E402
    MIN_TRUST_SAMPLE,
    approve_cell,
    compute_candidates,
    refresh_approved_norms,
    revoke_cell,
)
from app.services.norm_resolver import NormResolver, NormSource  # noqa: E402

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


def _seed(db):
    year = date.today().year
    db.add(Club(id=1, name="Клуб А", city="София"))
    db.add(Club(id=2, name="Клуб Б", city="Пловдив"))
    db.add(TestDefinition(
        code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical,
        unit="cm", direction=TestDirection.higher_better, sort_order=1,
    ))
    db.add(AssessmentWindow(
        id=1, season="2025/26", phase=AssessmentWindowPhase.endline, start_date=date(2026, 5, 1)
    ))
    db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))

    rid = 1
    aid = 1
    # 20 момичета U13 (родени преди 13 г.) с разнообразни стойности → trust_ready.
    for i in range(20):
        db.add(Athlete(
            id=aid, coach_id=1, club_id=(1 if i % 2 == 0 else 2),
            athlete_name=f"Момиче {i}", birth_year=year - 13, gender="female",
        ))
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                test_code="PHYS_LONGJUMP", raw_value=150.0 + i))
        aid += 1
        rid += 1

    # 6 момчета U13 — над display (5), под trust (20).
    for i in range(6):
        db.add(Athlete(
            id=aid, coach_id=1, club_id=1,
            athlete_name=f"Момче {i}", birth_year=year - 13, gender="male",
        ))
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                test_code="PHYS_LONGJUMP", raw_value=170.0 + i))
        aid += 1
        rid += 1

    # 3 момичета U14 — под display прага (5) → не се показват по подразбиране.
    for i in range(3):
        db.add(Athlete(
            id=aid, coach_id=1, club_id=1,
            athlete_name=f"U14 {i}", birth_year=year - 14, gender="female",
        ))
        db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid,
                                test_code="PHYS_LONGJUMP", raw_value=180.0 + i))
        aid += 1
        rid += 1

    db.commit()


class NormProducerTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        _seed(self.db)

    def tearDown(self):
        self.db.close()

    def test_candidates_buckets_and_thresholds(self):
        cands = compute_candidates(self.db)
        by_cell = {(c.test_code, c.age_band, c.gender): c for c in cands}

        female = by_cell[("PHYS_LONGJUMP", "U13", "female")]
        self.assertEqual(female.n, 20)
        self.assertTrue(female.trust_ready)
        self.assertTrue(female.display_ready)
        self.assertEqual(female.clubs_count, 2)
        self.assertIsNotNone(female.mean)
        self.assertTrue(female.has_2022)  # U13 момичета са в стандарта 2022

        male = by_cell[("PHYS_LONGJUMP", "U13", "male")]
        self.assertEqual(male.n, 6)
        self.assertTrue(male.display_ready)
        self.assertFalse(male.trust_ready)

    def test_below_display_excluded_by_default(self):
        cands = compute_candidates(self.db)
        keys = {(c.test_code, c.age_band, c.gender) for c in cands}
        self.assertNotIn(("PHYS_LONGJUMP", "U14", "female"), keys)  # само 3 деца
        # Но се вижда при include_below_display.
        incl = compute_candidates(self.db, include_below_display=True)
        keys2 = {(c.test_code, c.age_band, c.gender) for c in incl}
        self.assertIn(("PHYS_LONGJUMP", "U14", "female"), keys2)

    def test_approve_activates_norm_in_resolver(self):
        # Преди одобрение: резолверът ползва стандарт 2022 (не computed норма).
        resolver = NormResolver(self.db, window_id=1)
        before = resolver.resolve("PHYS_LONGJUMP", "U13", "female")
        self.assertEqual(before.source, NormSource.NATIONAL_2022)

        approve_cell(self.db, "PHYS_LONGJUMP", "U13", "female")

        # След одобрение: резолверът ползва изчислената (жива) норма.
        resolver2 = NormResolver(self.db, window_id=1)
        after = resolver2.resolve("PHYS_LONGJUMP", "U13", "female")
        self.assertEqual(after.source, NormSource.ASSESSMENT_NORM)
        self.assertTrue(after.applicable)
        self.assertIsNotNone(after.mean)

        row = (
            self.db.query(AssessmentNorm)
            .filter(AssessmentNorm.test_code == "PHYS_LONGJUMP",
                    AssessmentNorm.age_band == "U13", AssessmentNorm.gender == "female")
            .first()
        )
        self.assertEqual(row.source, "computed")
        self.assertEqual(row.source_status, "active")
        self.assertEqual(row.sample_count, 20)

    def test_revoke_falls_back(self):
        approve_cell(self.db, "PHYS_LONGJUMP", "U13", "female")
        revoke_cell(self.db, "PHYS_LONGJUMP", "U13", "female")
        resolver = NormResolver(self.db, window_id=1)
        resolved = resolver.resolve("PHYS_LONGJUMP", "U13", "female")
        # Пада обратно на стандарт 2022 (клетката е покрита).
        self.assertEqual(resolved.source, NormSource.NATIONAL_2022)

    def test_approve_below_trust_raises(self):
        with self.assertRaises(ValueError):
            approve_cell(self.db, "PHYS_LONGJUMP", "U13", "male")  # само 6 деца

    def test_refresh_updates_approved(self):
        approve_cell(self.db, "PHYS_LONGJUMP", "U13", "female")
        updated = refresh_approved_norms(self.db)
        self.assertGreaterEqual(updated, 1)

    def test_approved_flag_in_candidates(self):
        approve_cell(self.db, "PHYS_LONGJUMP", "U13", "female")
        cands = compute_candidates(self.db, gender="female", age_band="U13")
        female = next(c for c in cands if c.test_code == "PHYS_LONGJUMP")
        self.assertTrue(female.is_approved)


if __name__ == "__main__":
    unittest.main()
