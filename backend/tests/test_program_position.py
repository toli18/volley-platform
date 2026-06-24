"""Чисти тестове за program_position (без БД)."""
import os
import sys
import unittest
from datetime import date

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.national_method import program_position as pos  # noqa: E402
from app.national_method.annual_program import meso_definitions_for  # noqa: E402

DEFS = meso_definitions_for("U14")


class MonthToMesoTests(unittest.TestCase):
    def test_first_month_returns_first_meso(self):
        first_month = pos._first_month_of(DEFS[0]["months_bg"])
        self.assertEqual(pos.month_to_meso(DEFS, first_month), DEFS[0]["meso_number"])

    def test_july_maps_to_last_meso(self):
        # Мезо 11 е "юли" в U14 годишната програма.
        self.assertEqual(pos.month_to_meso(DEFS, 7), 11)

    def test_unknown_months_bg_falls_back(self):
        self.assertEqual(pos._first_month_of("неразбираемо"), None)
        self.assertEqual(pos.month_to_meso([], 5), 1)


class ResolvePositionTests(unittest.TestCase):
    def test_week_counts_within_first_meso(self):
        start = date(2025, 8, 4)  # понеделник
        r = pos.resolve_position(DEFS, start, start, start_meso_override=1)
        self.assertTrue(r["started"])
        self.assertFalse(r["completed"])
        self.assertEqual(r["meso_number"], 1)
        self.assertEqual(r["week_in_meso"], 1)

    def test_advances_meso_after_four_weeks(self):
        start = date(2025, 8, 4)
        ref = date(2025, 9, 1)  # +4 седмици
        r = pos.resolve_position(DEFS, start, ref, start_meso_override=1)
        self.assertEqual(r["meso_index"], 2)
        self.assertEqual(r["week_in_meso"], 1)

    def test_not_started_before_start(self):
        start = date(2025, 9, 1)
        ref = date(2025, 8, 18)
        r = pos.resolve_position(DEFS, start, ref, start_meso_override=1)
        self.assertFalse(r["started"])
        self.assertEqual(r["week_in_meso"], 0)

    def test_completed_clamps_to_last(self):
        start = date(2025, 8, 4)
        ref = date(2027, 8, 4)  # далеч след края
        r = pos.resolve_position(DEFS, start, ref, start_meso_override=1)
        self.assertTrue(r["completed"])
        self.assertEqual(r["meso_index"], r["total_mesos"])
        self.assertEqual(r["week_in_meso"], pos.WEEKS_PER_MESO)

    def test_override_beats_month(self):
        start = date(2025, 7, 6)  # юли → по подразбиране мезо 11
        r_default = pos.resolve_position(DEFS, start, start)
        self.assertEqual(r_default["meso_number"], 11)
        r_override = pos.resolve_position(DEFS, start, start, start_meso_override=3)
        self.assertEqual(r_override["meso_number"], 3)

    def test_monday_of(self):
        # 2025-06-18 е сряда → понеделник 2025-06-16
        self.assertEqual(pos.monday_of(date(2025, 6, 18)), date(2025, 6, 16))


if __name__ == "__main__":
    unittest.main()
