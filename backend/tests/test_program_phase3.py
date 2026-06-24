"""Фаза 3: управление на инстанция (PATCH/preview/статус) на ниво рутер."""
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
from app.models import MethodCycle, Team, UserRole  # noqa: E402
from app.routers.national_method import (  # noqa: E402
    CycleInstanceIn,
    CycleInstanceUpdateIn,
    head_create_cycle_instance,
    head_list_cycle_instances,
    head_preview_cycle_instance,
    head_update_cycle_instance,
)
from app.services.program_week_service import build_program_week  # noqa: E402


class _FakeHead:
    def __init__(self):
        self.id = 1
        self.role = UserRole.club_head_coach
        self.club_id = 1


def _make_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


class Phase3Tests(unittest.TestCase):
    def setUp(self):
        self.db = _make_session()
        self.user = _FakeHead()
        self.team = Team(id=1, coach_id=1, club_id=1, name="U14", age_group="U14", gender="male", is_active=True)
        self.db.add(self.team)
        self.db.add(
            MethodCycle(
                id=1,
                title_bg="Мезо 1",
                cycle_type="meso",
                weeks=4,
                age_band="U14",
                structure_json={"meso_number": 1},
                status="published",
                sort_order=101,
            )
        )
        self.db.commit()
        res = head_create_cycle_instance(
            CycleInstanceIn(team_id=1, cycle_id=1, start_date="2025-08-04"),
            db=self.db,
            user=self.user,
        )
        self.instance_id = res["id"]

    def tearDown(self):
        self.db.close()

    def test_preview_resolves_position(self):
        prev = head_preview_cycle_instance(
            cycle_id=1, start_date="2025-07-06", start_meso=3, db=self.db, user=self.user
        )
        self.assertEqual(prev["resolved_start_meso"], 3)
        self.assertEqual(prev["total_mesos"], 11)

    def test_pause_hides_program(self):
        head_update_cycle_instance(
            self.instance_id, CycleInstanceUpdateIn(status="paused"), db=self.db, user=self.user
        )
        out = build_program_week(self.db, self.team, today=date(2025, 8, 6))
        self.assertFalse(out["has_program"])
        # Възобновяване → програмата се връща.
        head_update_cycle_instance(
            self.instance_id, CycleInstanceUpdateIn(status="active"), db=self.db, user=self.user
        )
        out2 = build_program_week(self.db, self.team, today=date(2025, 8, 6))
        self.assertTrue(out2["has_program"])

    def test_start_meso_override_persisted(self):
        resp = head_update_cycle_instance(
            self.instance_id, CycleInstanceUpdateIn(start_meso=5), db=self.db, user=self.user
        )
        self.assertEqual(resp["start_meso"], 5)
        rows = head_list_cycle_instances(db=self.db, user=self.user)
        self.assertEqual(rows[0]["start_meso"], 5)
        # Изчистване с 0.
        resp2 = head_update_cycle_instance(
            self.instance_id, CycleInstanceUpdateIn(start_meso=0), db=self.db, user=self.user
        )
        self.assertIsNone(resp2["start_meso"])

    def test_invalid_status_rejected(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            head_update_cycle_instance(
                self.instance_id, CycleInstanceUpdateIn(status="bogus"), db=self.db, user=self.user
            )


if __name__ == "__main__":
    unittest.main()
