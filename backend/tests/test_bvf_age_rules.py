"""СЕК възрастови кохорти: естествена група + една нагоре."""
import os
import sys
import unittest
from types import SimpleNamespace

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.bvf_season_carding import (  # noqa: E402
    _local_card_index_locked_by_sek,
    allowed_age_codes,
    athlete_fits_card_index_rules,
    natural_age_code,
    platform_age_sex_from_sek_card_index,
    sek_card_index_multipart_age,
    sek_license_category_label,
)


class BvfAgeCohortTests(unittest.TestCase):
    def test_sek_license_labels_u13_vs_u14(self):
        self.assertIn("Мини", sek_license_category_label(13, 0))
        self.assertIn("14", sek_license_category_label(14, 0))
        self.assertNotEqual(sek_license_category_label(13, 0), sek_license_category_label(14, 0))

    def test_season_2022_matches_bvf_announcement(self):
        self.assertEqual(natural_age_code(2012, 2022), 12)  # Детски
        self.assertEqual(natural_age_code(2011, 2022), 13)  # Мини
        self.assertEqual(natural_age_code(2010, 2022), 14)  # Под 14
        self.assertEqual(natural_age_code(2009, 2022), 16)
        self.assertEqual(natural_age_code(2008, 2022), 16)
        self.assertEqual(natural_age_code(2006, 2022), 18)

    def test_detski_2026_rejects_older_birth_years(self):
        # 2014/2015 са Мини/Под 14 — не Детски
        self.assertNotIn(12, allowed_age_codes(2014, 2026))
        self.assertNotIn(12, allowed_age_codes(2015, 2026))
        self.assertIn(12, allowed_age_codes(2016, 2026))
        self.assertIn(12, allowed_age_codes(2017, 2026))

    def test_play_up_one_group_only(self):
        self.assertEqual(allowed_age_codes(2016, 2026), {12, 13})  # Детски → Мини
        self.assertEqual(allowed_age_codes(2015, 2026), {13, 14})  # Мини → Под 14
        self.assertEqual(allowed_age_codes(2014, 2026), {14, 16})  # Под 14 → Под 16
        self.assertNotIn(16, allowed_age_codes(2016, 2026))  # без прескачане

    def test_detski_label_rejects_2014(self):
        older = SimpleNamespace(gender="male", birth_year=2014, birth_date=None, egn=None)
        ok, reason = athlete_fits_card_index_rules(
            older, season_year=2026, age=99, sex=0, age_group="Детски - локално"
        )
        self.assertFalse(ok)
        self.assertIn("Под 14", reason or "")
        older = SimpleNamespace(gender="male", birth_year=2014, birth_date=None, egn=None)
        ok, reason = athlete_fits_card_index_rules(older, season_year=2026, age=12, sex=0)
        self.assertFalse(ok)
        self.assertIn("2014", reason or "")

        young = SimpleNamespace(gender="male", birth_year=2016, birth_date=None, egn=None)
        ok, _ = athlete_fits_card_index_rules(young, season_year=2026, age=12, sex=0)
        self.assertTrue(ok)

    def test_pending_sek_not_locked_for_delete(self):
        loc = SimpleNamespace(is_signed=False, status="pending_bvf_sign")
        self.assertFalse(_local_card_index_locked_by_sek(loc))

    def test_signed_sek_marked_locked_for_editing(self):
        loc = SimpleNamespace(is_signed=True, status="pending_bvf_sign")
        self.assertTrue(_local_card_index_locked_by_sek(loc))

    def test_u13_and_u14_sek_labels_differ(self):
        self.assertIn("Мини", sek_license_category_label(13, 0))
        self.assertIn("14", sek_license_category_label(14, 0))

    def test_sek_card_index_age_enum_read(self):
        row = {"age": 3, "sex": 0, "ageGroup": "Момчета - Мини Волейбол"}
        self.assertEqual(platform_age_sex_from_sek_card_index(row), (13, 0))
        row2 = {"age": 1, "sex": 0, "ageGroup": "Момчета - Детски Волейбол"}
        self.assertEqual(platform_age_sex_from_sek_card_index(row2), (12, 0))
        row3 = {"age": 5, "sex": 0, "ageGroup": "Момчета под 14г."}
        self.assertEqual(platform_age_sex_from_sek_card_index(row3), (14, 0))
        row4 = {"age": 0, "sex": 1, "ageGroup": "Момичета - Детски Волейбол"}
        self.assertEqual(platform_age_sex_from_sek_card_index(row4), (12, 1))

    def test_sek_card_index_post_age_one_below_platform_band(self):
        self.assertEqual(sek_card_index_multipart_age(12, 0), "11")
        self.assertEqual(sek_card_index_multipart_age(13, 0), "12")
        self.assertEqual(sek_card_index_multipart_age(14, 0), "13")
        self.assertEqual(sek_card_index_multipart_age(99, 1), "99")

    def test_sek_card_index_raw_age_post_encoding(self):
        row = {"age": 12, "sex": 0, "ageGroup": "Момчета - Мини Волейбол"}
        self.assertEqual(platform_age_sex_from_sek_card_index(row), (13, 0))
        row2 = {"age": 11, "sex": 0}
        self.assertEqual(platform_age_sex_from_sek_card_index(row2), (12, 0))


if __name__ == "__main__":
    unittest.main()
