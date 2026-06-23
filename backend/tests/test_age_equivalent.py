"""Чисти тестове за модула age_equivalent (Фаза 4)."""
import os
import sys
import unittest

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.national_method.age_equivalent import (  # noqa: E402
    age_band_to_years,
    age_equivalent,
)


class AgeBandParseTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(age_band_to_years("U13"), 13.0)
        self.assertEqual(age_band_to_years("u9"), 9.0)
        self.assertIsNone(age_band_to_years(None))
        self.assertIsNone(age_band_to_years("xx"))


class AgeEquivalentHigherBetterTests(unittest.TestCase):
    # Крива: по-голяма възраст → по-голямо средно (напр. дълъг скок).
    POINTS = [(9.0, 130.0), (10.0, 140.0), (11.0, 150.0), (12.0, 160.0)]

    def test_in_range_interpolation(self):
        # 155 е по средата между 11 (150) и 12 (160) → 11.5.
        res = age_equivalent(self.POINTS, 155.0, higher_better=True)
        self.assertEqual(res.status, "in_range")
        self.assertAlmostEqual(res.equivalent_age, 11.5, places=2)

    def test_above_oldest(self):
        res = age_equivalent(self.POINTS, 200.0, higher_better=True)
        self.assertEqual(res.status, "above_oldest")
        self.assertEqual(res.equivalent_age, 12.0)

    def test_below_youngest(self):
        res = age_equivalent(self.POINTS, 100.0, higher_better=True)
        self.assertEqual(res.status, "below_youngest")
        self.assertEqual(res.equivalent_age, 9.0)

    def test_needs_two_points(self):
        self.assertIsNone(age_equivalent([(11.0, 150.0)], 150.0, higher_better=True))


class AgeEquivalentLowerBetterTests(unittest.TestCase):
    # Крива: по-голяма възраст → по-малко средно (време за бягане, по-малко=по-добре).
    POINTS = [(9.0, 4.6), (10.0, 4.4), (11.0, 4.2), (12.0, 4.0)]

    def test_in_range_interpolation(self):
        # 4.1 е по средата между 11 (4.2) и 12 (4.0) → 11.5.
        res = age_equivalent(self.POINTS, 4.1, higher_better=False)
        self.assertEqual(res.status, "in_range")
        self.assertAlmostEqual(res.equivalent_age, 11.5, places=2)

    def test_above_oldest_when_faster(self):
        # По-бързо от най-голямата възраст → еквивалент = най-голямата.
        res = age_equivalent(self.POINTS, 3.5, higher_better=False)
        self.assertEqual(res.status, "above_oldest")
        self.assertEqual(res.equivalent_age, 12.0)

    def test_below_youngest_when_slower(self):
        res = age_equivalent(self.POINTS, 5.0, higher_better=False)
        self.assertEqual(res.status, "below_youngest")
        self.assertEqual(res.equivalent_age, 9.0)


if __name__ == "__main__":
    unittest.main()
