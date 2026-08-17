"""СЕК възрастови кохорти: естествена група + една нагоре."""
import os
import sys
import unittest
from types import SimpleNamespace

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.bvf_season_carding import (  # noqa: E402
    allowed_age_codes,
    athlete_fits_card_index_rules,
    natural_age_code,
)


class BvfAgeCohortTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
