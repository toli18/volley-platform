"""Тестове на endpoint-а GET /scouting (ниво рутер): достъп + филтри + изход.

Извикват функцията на рутера директно с реална sqlite сесия и фиктивен
потребител. Сметката е тествана отделно; тук пазим достъпа и филтрите.
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
    TeamMember,
    TestDefinition,
    UserRole,
)
from app.models_assessment import (  # noqa: E402
    AssessmentSessionStatus,
    AssessmentWindowPhase,
    TestCategory,
    TestDirection,
)
from app.routers.assessments import scouting_table  # noqa: E402

_TABLES = [
    TestDefinition.__table__,
    AssessmentWindow.__table__,
    AssessmentSession.__table__,
    AssessmentResult.__table__,
    Athlete.__table__,
    TeamMember.__table__,
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


class ScoutingEndpointTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        self.year = date.today().year
        self._seed()

    def tearDown(self):
        self.db.close()

    def _call(self, user, *, gender=None, age_band=None, team_id=None, test_code=None):
        # Извикваме рутер-функцията директно, затова подаваме филтрите изрично
        # (иначе остават FastAPI Query() обектите вместо None).
        return scouting_table(
            gender=gender,
            age_band=age_band,
            team_id=team_id,
            test_code=test_code,
            db=self.db,
            current_user=user,
        )

    def _seed(self):
        u13 = self.year - 13
        self.db.add(TestDefinition(id=1, code="PHYS_LONGJUMP", name="Дълъг скок", category=TestCategory.physical, unit="cm", direction=TestDirection.higher_better, sort_order=1))
        # Антропометрия — НЕ трябва да е колона.
        self.db.add(TestDefinition(id=2, code="ANTH_HEIGHT", name="Ръст", category=TestCategory.anthropometry, unit="cm", direction=TestDirection.context, sort_order=2))

        # Коуч 10 → F1, F2; Коуч 20 → F3. Едно момче за филтъра по пол.
        self.db.add(Athlete(id=1, coach_id=10, club_id=100, athlete_name="A F1", birth_year=u13, gender="female"))
        self.db.add(Athlete(id=2, coach_id=10, club_id=100, athlete_name="B F2", birth_year=u13, gender="female"))
        self.db.add(Athlete(id=3, coach_id=20, club_id=200, athlete_name="C F3", birth_year=u13, gender="female"))
        self.db.add(Athlete(id=4, coach_id=10, club_id=100, athlete_name="D M1", birth_year=u13, gender="male"))

        self.db.add(AssessmentWindow(id=1, season="2025/26", phase=AssessmentWindowPhase.baseline, start_date=date(2025, 9, 1)))
        self.db.add(AssessmentSession(id=1, window_id=1, team_id=1, status=AssessmentSessionStatus.finalized))
        self.db.add(TeamMember(id=1, team_id=1, athlete_id=1))

        rid = 1
        for aid, raw in [(1, 200.0), (2, 180.0), (3, 160.0), (4, 150.0)]:
            self.db.add(AssessmentResult(id=rid, session_id=1, athlete_id=aid, test_code="PHYS_LONGJUMP", raw_value=raw))
            rid += 1
        self.db.commit()

    def test_admin_sees_all_and_excludes_anthropometry(self):
        admin = _FakeUser(1, UserRole.platform_admin)
        out = self._call(admin)
        self.assertEqual([t.code for t in out.tests], ["PHYS_LONGJUMP"])  # без ANTH_HEIGHT
        self.assertEqual(len(out.rows), 4)

    def test_coach_sees_only_own_athletes(self):
        coach = _FakeUser(10, UserRole.coach)
        out = self._call(coach)
        ids = {r.athlete_id for r in out.rows}
        self.assertEqual(ids, {1, 2, 4})  # F3 (коуч 20) липсва

    def test_gender_filter(self):
        admin = _FakeUser(1, UserRole.platform_admin)
        out = self._call(admin, gender="male")
        self.assertEqual({r.athlete_id for r in out.rows}, {4})

    def test_team_filter(self):
        admin = _FakeUser(1, UserRole.platform_admin)
        out = self._call(admin, team_id=1)
        self.assertEqual({r.athlete_id for r in out.rows}, {1})

    def test_age_band_filter_empty_when_no_match(self):
        admin = _FakeUser(1, UserRole.platform_admin)
        out = self._call(admin, age_band="U99")
        self.assertEqual(len(out.rows), 0)

    def test_cells_carry_both_comparisons(self):
        coach = _FakeUser(10, UserRole.coach)
        out = self._call(coach)
        row = next(r for r in out.rows if r.athlete_id == 1)
        cell = row.cells[0]
        self.assertEqual(cell.test_code, "PHYS_LONGJUMP")
        self.assertEqual(cell.raw_value, 200.0)
        self.assertIsNotNone(cell.score_2022)  # U13 female покрит
        # Връстници в системата (всички полове/коучове): F2=180, F3=160, M1 е друг пол.
        # F1 (200) спрямо женските U13 без себе си [180,160] → 100.
        self.assertEqual(cell.peer_percentile, 100.0)
        self.assertEqual(cell.peer_sample, 2)


if __name__ == "__main__":
    unittest.main()
