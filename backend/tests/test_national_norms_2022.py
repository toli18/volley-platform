import unittest

from backend.app.national_method.national_norms_2022 import (
    SCORE_EXCELLENT,
    SCORE_SATISFACTORY,
    SCORE_VERY_GOOD,
    GradeBands,
    get_bands,
    score_2022,
    score_from_anchors,
)


class ScoreFromAnchorsTests(unittest.TestCase):
    def test_hits_anchor_points_exactly(self):
        anchors = [(170.0, SCORE_SATISFACTORY), (195.0, SCORE_VERY_GOOD), (220.0, SCORE_EXCELLENT)]
        self.assertEqual(score_from_anchors(170.0, anchors), 40.0)
        self.assertEqual(score_from_anchors(195.0, anchors), 60.0)
        self.assertEqual(score_from_anchors(220.0, anchors), 80.0)

    def test_interpolates_between_anchors(self):
        anchors = [(170.0, 40.0), (195.0, 60.0), (220.0, 80.0)]
        # точно по средата между 170 и 195 → между 40 и 60 = 50
        self.assertEqual(score_from_anchors(182.5, anchors), 50.0)

    def test_extrapolates_above_top_and_clamps_at_100(self):
        anchors = [(170.0, 40.0), (195.0, 60.0), (220.0, 80.0)]
        # наклон 20 точки/25 см; на 245 → 100; над това clamp 100
        self.assertEqual(score_from_anchors(245.0, anchors), 100.0)
        self.assertEqual(score_from_anchors(400.0, anchors), 100.0)

    def test_extrapolates_below_bottom_and_clamps_at_0(self):
        anchors = [(170.0, 40.0), (195.0, 60.0), (220.0, 80.0)]
        self.assertEqual(score_from_anchors(120.0, anchors), 0.0)

    def test_empty_anchors_neutral(self):
        self.assertEqual(score_from_anchors(10.0, []), 50.0)


class GradeBandsOrientationTests(unittest.TestCase):
    def test_higher_better_anchors_ascending_in_score(self):
        gb = GradeBands(170.0, 195.0, 220.0, higher_better=True)
        anchors = gb.anchors()
        raws = [a[0] for a in anchors]
        scores = [a[1] for a in anchors]
        self.assertEqual(raws, sorted(raws))
        self.assertEqual(scores, [40.0, 60.0, 80.0])

    def test_lower_better_anchors_descending_in_score(self):
        # бързина: по-малко = по-добре
        gb = GradeBands(9.995, 9.205, 8.505, higher_better=False)
        anchors = gb.anchors()
        raws = [a[0] for a in anchors]
        scores = [a[1] for a in anchors]
        # подредени по нарастващ raw, но оценката намалява
        self.assertEqual(raws, sorted(raws))
        self.assertEqual(scores, [80.0, 60.0, 40.0])

    def test_lower_better_faster_time_scores_higher(self):
        gb = GradeBands(9.995, 9.205, 8.505, higher_better=False)
        fast = score_from_anchors(8.0, gb.anchors())
        slow = score_from_anchors(9.8, gb.anchors())
        self.assertGreater(fast, slow)


class Coverage2022Tests(unittest.TestCase):
    def test_girls_cover_u13_and_u14_female(self):
        self.assertIsNotNone(get_bands("PHYS_LONGJUMP", "U13", "female"))
        self.assertIsNotNone(get_bands("PHYS_LONGJUMP", "U14", "female"))

    def test_boys_cover_u14_and_u15_male(self):
        self.assertIsNotNone(get_bands("PHYS_LONGJUMP", "U14", "male"))
        self.assertIsNotNone(get_bands("PHYS_LONGJUMP", "U15", "male"))

    def test_unmapped_cells_return_none(self):
        # момчета U13 ги няма в таблиците
        self.assertIsNone(get_bands("PHYS_LONGJUMP", "U13", "male"))
        # тестове извън таблиците 2022
        self.assertIsNone(get_bands("TECH_ATTACK", "U14", "male"))
        self.assertIsNone(get_bands("PHYS_JUMP_1ARM", "U14", "male"))
        # липсващи ключове
        self.assertIsNone(get_bands("PHYS_LONGJUMP", None, "male"))
        self.assertIsNone(get_bands("PHYS_LONGJUMP", "U14", None))

    def test_score_2022_matches_published_grades_boys_longjump(self):
        # момчета 14-15 дълъг скок: граница „Отлично" ~250.5 → 80
        self.assertEqual(score_2022(250.5, "PHYS_LONGJUMP", "U14", "male"), 80.0)
        # „Незадоволително" под 190 → под 40
        self.assertLess(score_2022(185.0, "PHYS_LONGJUMP", "U14", "male"), 40.0)
        # ясно „Отлично" → висока оценка
        self.assertGreaterEqual(score_2022(270.0, "PHYS_LONGJUMP", "U14", "male"), 85.0)

    def test_score_2022_none_when_no_norm(self):
        self.assertIsNone(score_2022(200.0, "PHYS_LONGJUMP", "U13", "male"))


if __name__ == "__main__":
    unittest.main()
