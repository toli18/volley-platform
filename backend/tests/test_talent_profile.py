"""Unit тестове за ЧИСТИЯ слой „Профил на таланта".

Покриват:
  • новите помощници в national_norms_2022 (grade_label, reference_age_band);
  • build_talent_profile — сглобяване на профила срещу референтния стандарт 2022,
    пропускане на непокрити/празни тестове, общ индекс и флага „аспирационен".
"""
import unittest

from backend.app.national_method.national_norms_2022 import (
    LEVEL_EXCELLENT,
    LEVEL_SATISFACTORY,
    LEVEL_UNSATISFACTORY,
    LEVEL_VERY_GOOD,
    grade_label,
    reference_age_band,
    score_2022,
)
from backend.app.national_method.talent_profile import build_talent_profile


class GradeLabelTests(unittest.TestCase):
    def test_thresholds_map_to_published_levels(self):
        self.assertEqual(grade_label(0.0), LEVEL_UNSATISFACTORY)
        self.assertEqual(grade_label(39.9), LEVEL_UNSATISFACTORY)
        self.assertEqual(grade_label(40.0), LEVEL_SATISFACTORY)
        self.assertEqual(grade_label(59.9), LEVEL_SATISFACTORY)
        self.assertEqual(grade_label(60.0), LEVEL_VERY_GOOD)
        self.assertEqual(grade_label(79.9), LEVEL_VERY_GOOD)
        self.assertEqual(grade_label(80.0), LEVEL_EXCELLENT)
        self.assertEqual(grade_label(100.0), LEVEL_EXCELLENT)


class ReferenceAgeBandTests(unittest.TestCase):
    def test_female_reference_is_u13(self):
        self.assertEqual(reference_age_band("female"), "U13")

    def test_male_reference_is_u14(self):
        self.assertEqual(reference_age_band("male"), "U14")

    def test_unknown_gender_has_no_reference(self):
        self.assertIsNone(reference_age_band("other"))
        self.assertIsNone(reference_age_band(None))


class BuildTalentProfileTests(unittest.TestCase):
    def test_covered_female_scores_against_u13_reference(self):
        profile = build_talent_profile(
            "female",
            "U10",
            {"PHYS_LONGJUMP": 219.5, "PHYS_MEDBALL": 595.0},
        )
        self.assertTrue(profile.covered)
        self.assertEqual(profile.reference_age_band, "U13")
        self.assertTrue(profile.is_aspirational)  # 10 < 13
        self.assertEqual(len(profile.tests), 2)

        by_code = {t.test_code: t for t in profile.tests}
        self.assertEqual(
            by_code["PHYS_LONGJUMP"].talent_score,
            score_2022(219.5, "PHYS_LONGJUMP", "U13", "female"),
        )
        self.assertEqual(by_code["PHYS_LONGJUMP"].talent_label, LEVEL_EXCELLENT)
        self.assertEqual(by_code["PHYS_MEDBALL"].talent_label, LEVEL_VERY_GOOD)

    def test_talent_index_is_mean_with_label(self):
        # 219.5 → 80 (Отлично), 595.0 → 60 (Много добро); средно 70 → Много добро.
        profile = build_talent_profile(
            "female", "U11", {"PHYS_LONGJUMP": 219.5, "PHYS_MEDBALL": 595.0}
        )
        self.assertEqual(profile.talent_index, 70.0)
        self.assertEqual(profile.talent_index_label, LEVEL_VERY_GOOD)

    def test_skips_uncovered_tests_and_none_values(self):
        profile = build_talent_profile(
            "female",
            "U12",
            {
                "PHYS_LONGJUMP": 200.0,  # покрит
                "TECH_ATTACK": 10.0,  # няма репер 2022 → пропуска се
                "PHYS_JUMP_1ARM": 50.0,  # няма репер 2022 → пропуска се
                "PHYS_MEDBALL": None,  # липсва стойност → пропуска се
            },
        )
        codes = {t.test_code for t in profile.tests}
        self.assertEqual(codes, {"PHYS_LONGJUMP"})

    def test_uncovered_gender_yields_empty_profile(self):
        profile = build_talent_profile("other", "U10", {"PHYS_LONGJUMP": 200.0})
        self.assertFalse(profile.covered)
        self.assertIsNone(profile.reference_age_band)
        self.assertFalse(profile.is_aspirational)
        self.assertEqual(profile.tests, ())
        self.assertIsNone(profile.talent_index)
        self.assertIsNone(profile.talent_index_label)

    def test_not_aspirational_when_at_or_above_reference(self):
        profile = build_talent_profile("female", "U14", {"PHYS_LONGJUMP": 200.0})
        self.assertTrue(profile.covered)
        self.assertFalse(profile.is_aspirational)  # 14 >= 13

    def test_no_results_gives_empty_but_covered(self):
        profile = build_talent_profile("male", "U11", {})
        self.assertTrue(profile.covered)
        self.assertEqual(profile.reference_age_band, "U14")
        self.assertEqual(profile.tests, ())
        self.assertIsNone(profile.talent_index)


if __name__ == "__main__":
    unittest.main()
