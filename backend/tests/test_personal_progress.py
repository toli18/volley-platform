"""Чисти тестове за personal_progress (личен рекорд, подобрение, следваща цел).

Без БД — само математиката, която стои зад мотивационния изглед.
"""
import os
import sys
import unittest

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.national_method.national_norms_2022 import (  # noqa: E402
    LEVEL_EXCELLENT,
    LEVEL_SATISFACTORY,
    LEVEL_VERY_GOOD,
    get_bands,
)
from app.national_method.personal_progress import (  # noqa: E402
    compute_improvement,
    is_at_best,
    next_goal,
    personal_best,
)


class PersonalBestTests(unittest.TestCase):
    def test_higher_better_takes_max(self):
        self.assertEqual(personal_best([180.0, 219.5, 200.0], higher_better=True), 219.5)

    def test_lower_better_takes_min(self):
        self.assertEqual(personal_best([10.5, 9.5, 10.0], higher_better=False), 9.5)

    def test_empty_returns_none(self):
        self.assertIsNone(personal_best([], higher_better=True))

    def test_is_at_best(self):
        self.assertTrue(is_at_best(219.5, 219.5, higher_better=True))
        self.assertTrue(is_at_best(9.5, 9.5, higher_better=False))
        self.assertFalse(is_at_best(200.0, 219.5, higher_better=True))


class ImprovementTests(unittest.TestCase):
    def test_higher_better_improvement(self):
        imp = compute_improvement([180.0, 219.5], higher_better=True)
        self.assertEqual(imp.prev, 180.0)
        self.assertEqual(imp.latest, 219.5)
        self.assertEqual(imp.delta, 39.5)
        self.assertTrue(imp.improved)

    def test_lower_better_improvement(self):
        # По-малко = по-добре: 10.5 → 10.0 е подобрение.
        imp = compute_improvement([10.5, 10.0], higher_better=False)
        self.assertEqual(imp.delta, -0.5)
        self.assertTrue(imp.improved)

    def test_lower_better_regression(self):
        imp = compute_improvement([9.5, 10.0], higher_better=False)
        self.assertFalse(imp.improved)

    def test_single_value_has_no_prev(self):
        imp = compute_improvement([200.0], higher_better=True)
        self.assertIsNone(imp.prev)
        self.assertIsNone(imp.delta)
        self.assertIsNone(imp.improved)
        self.assertEqual(imp.latest, 200.0)

    def test_empty_returns_none(self):
        self.assertIsNone(compute_improvement([], higher_better=True))


class NextGoalTests(unittest.TestCase):
    def setUp(self):
        # Дълъг скок, момичета U13: НЗ<169.5 · З 194.5 · МД 219.5 (higher_better).
        self.longjump = get_bands("PHYS_LONGJUMP", "U13", "female")
        # Бързина 9-3-6-3-9, момичета U13 (lower_better).
        self.speed = get_bands("SPEED_9363", "U13", "female")

    def test_higher_better_next_level(self):
        goal = next_goal(180.0, self.longjump, higher_better=True)
        self.assertIsNotNone(goal)
        self.assertEqual(goal.target_raw, 194.5)
        self.assertEqual(goal.next_level, LEVEL_VERY_GOOD)
        self.assertAlmostEqual(goal.gap, 14.5)

    def test_higher_better_top_returns_none(self):
        self.assertIsNone(next_goal(230.0, self.longjump, higher_better=True))

    def test_lower_better_next_level(self):
        # 10.5 сек е под прага за „Задоволително" (9.995) → целта е да слезе под него.
        goal = next_goal(10.5, self.speed, higher_better=False)
        self.assertIsNotNone(goal)
        self.assertEqual(goal.target_raw, 9.995)
        self.assertEqual(goal.next_level, LEVEL_SATISFACTORY)

    def test_lower_better_top_returns_none(self):
        self.assertIsNone(next_goal(8.0, self.speed, higher_better=False))

    def test_higher_better_excellent_goal(self):
        goal = next_goal(200.0, self.longjump, higher_better=True)
        self.assertEqual(goal.target_raw, 219.5)
        self.assertEqual(goal.next_level, LEVEL_EXCELLENT)


if __name__ == "__main__":
    unittest.main()
