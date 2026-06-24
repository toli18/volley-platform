"""Интеграционен тест за build_program_week (sqlite, реална сесия)."""
import os
import sys
import unittest
from datetime import date

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

os.environ.setdefault("DATABASE_URL", "sqlite://")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    ClubCycleInstance,
    MethodCycle,
    Team,
    TeamSession,
    TrainingScheduleRule,
)
from app.services.program_week_service import build_program_week  # noqa: E402


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


class ProgramWeekServiceTests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        self.team = Team(
            id=1,
            coach_id=1,
            club_id=1,
            name="U14 момчета",
            age_group="U14",
            gender="male",
            is_active=True,
        )
        self.db.add(self.team)
        self.db.add(
            MethodCycle(
                id=1,
                title_bg="Мезо 1 — въвеждане",
                cycle_type="meso",
                weeks=4,
                age_band="U14",
                structure_json={"meso_number": 1},
                status="published",
                sort_order=101,
            )
        )
        self.db.add(
            ClubCycleInstance(
                id=1,
                club_id=1,
                team_id=1,
                cycle_id=1,
                start_date="2025-08-04",  # понеделник
                status="active",
                created_by=1,
            )
        )
        # Две седмични тренировки: понеделник и вторник.
        for wd in (0, 1):
            self.db.add(
                TrainingScheduleRule(
                    club_id=1,
                    team_id=1,
                    coach_id=1,
                    location="Зала 1",
                    weekday=wd,
                    start_time="18:00",
                    end_time="19:30",
                    effective_from="2025-01-01",
                    is_active=True,
                )
            )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_no_program_when_no_instance(self):
        self.db.query(ClubCycleInstance).delete()
        self.db.commit()
        out = build_program_week(self.db, self.team, today=date(2025, 8, 6))
        self.assertFalse(out["has_program"])

    def test_position_and_overlay(self):
        out = build_program_week(self.db, self.team, today=date(2025, 8, 6))
        self.assertTrue(out["has_program"])
        self.assertEqual(out["meso_index"], 1)
        self.assertEqual(out["week_in_meso"], 1)
        # Две реални тренировки в прозореца → два дни с програмно съдържание.
        self.assertEqual(len(out["days"]), 2)
        self.assertTrue(out["days"][0]["has_program_day"])
        self.assertEqual(out["days"][0]["weekday_label"], "понеделник")
        # 4 програмни сесии, 2 покрити → 2 непокрити теми.
        self.assertEqual(len(out["unmapped_days"]), 2)

    def test_execution_status_and_progress(self):
        # Реална сесия само в понеделник (08-04).
        self.db.add(TeamSession(team_id=1, date="2025-08-04", title="Тренировка"))
        self.db.commit()
        out = build_program_week(self.db, self.team, today=date(2025, 8, 6))
        # Mon = проведена, Tue (минала, без сесия) = пропусната.
        self.assertEqual(out["days"][0]["execution_status"], "done")
        self.assertEqual(out["days"][1]["execution_status"], "missed")
        self.assertEqual(out["week_done"], 1)
        self.assertEqual(out["week_mapped"], 2)
        prog = out["progress"]
        self.assertTrue(prog["started"])
        self.assertEqual(prog["planned"], 2)
        self.assertEqual(prog["executed"], 1)
        self.assertEqual(prog["rate_pct"], 50)

    def test_future_days_are_upcoming(self):
        out = build_program_week(self.db, self.team, week_offset=1, today=date(2025, 8, 6))
        self.assertTrue(all(d["execution_status"] == "upcoming" for d in out["days"]))

    def test_next_week_offset_advances_window(self):
        out0 = build_program_week(self.db, self.team, week_offset=0, today=date(2025, 8, 6))
        out1 = build_program_week(self.db, self.team, week_offset=1, today=date(2025, 8, 6))
        self.assertEqual(out0["window"]["from_date"], "2025-08-04")
        self.assertEqual(out1["window"]["from_date"], "2025-08-11")
        self.assertEqual(out1["week_in_meso"], 2)


if __name__ == "__main__":
    unittest.main()
