import unittest

from backend.app.services.bulgarian_training_generator import (
    PickedState,
    generateSessionPlan,
    inferGameContext,
    normalizeSkill,
    phaseWeightsFromCategory,
    scoreDrill,
)


def _mk_drill(
    did: int,
    *,
    name: str,
    category: str,
    skill_focus: str,
    goal: str = "",
    description: str = "",
    video_urls=None,
):
    return {
        "id": did,
        "name": name,
        "category": category,
        "skill_focus": skill_focus,
        "skillFocus": skill_focus,
        "goal": goal,
        "description": description,
        "training_goal": "",
        "technical_focus": [],
        "tactical_focus": [],
        "game_phases": [],
        "type_of_drill": "",
        "duration_min": 8,
        "duration_max": 12,
        "age_min": 15,
        "age_max": 19,
        "video_urls": video_urls if video_urls is not None else ["https://video.example/test"],
        "image_urls": [],
        "rpe": 6,
        "intensity_type": "medium",
        "complexity_level": "",
        "decision_level": "",
    }


class BulgarianGeneratorTests(unittest.TestCase):
    def test_normalize_skill_synonyms(self):
        self.assertEqual(normalizeSkill("Посрещане"), "Посрещане")
        self.assertEqual(normalizeSkill("Приемане"), "Посрещане")
        self.assertEqual(normalizeSkill("Serve receive"), "Посрещане")

    def test_phase_weights_game_situation(self):
        w = phaseWeightsFromCategory("Игрова ситуация")
        self.assertEqual(w["Интеграция"], 0.6)
        self.assertEqual(w["Състезателност"], 0.4)

    def test_infer_game_context_keywords(self):
        drill_6v6 = _mk_drill(1, name="Игра 6v6", category="Игрова ситуация", skill_focus="Посрещане")
        drill_points = _mk_drill(2, name="Точки до 15", category="Игрова ситуация", skill_focus="Посрещане", goal="игра на точки")
        drill_3v3 = _mk_drill(3, name="Малка игра 3v3", category="Основна фаза 2", skill_focus="Посрещане")
        self.assertEqual(inferGameContext(drill_6v6), "6v6")
        self.assertEqual(inferGameContext(drill_points), "точки")
        self.assertEqual(inferGameContext(drill_3v3), "малка група")

    def test_post_pass_enforces_primary_ratio(self):
        drills = []
        categories = ["Загрявка", "Основна фаза 1", "Основна фаза 2", "Игрова ситуация", "Затваряне"]
        did = 1
        for cat in categories:
            for idx in range(3):
                drills.append(
                    _mk_drill(
                        did,
                        name=f"Видео {cat} {idx}",
                        category=cat,
                        skill_focus="Атака",
                        video_urls=["https://video.example/a"],
                    )
                )
                did += 1
        for cat in categories:
            for idx in range(3):
                drills.append(
                    _mk_drill(
                        did,
                        name=f"Primary {cat} {idx}",
                        category=cat,
                        skill_focus="Посрещане",
                        video_urls="Няма данни",
                    )
                )
                did += 1

        plan = generateSessionPlan(
            drills,
            {
                "age": "16-18",
                "durationTotalMin": 90,
                "mainFocus": "Посрещане",
                "secondaryFocus": "Разпределение",
            },
        )
        selected = [item for phase in plan["фази"] for item in phase["упражнения"]]
        primary_hits = sum(1 for item in selected if "посрещ" in str(item.get("skillFocus", "")).lower())
        self.assertGreaterEqual(primary_hits / max(1, len(selected)), 0.8)

    def test_sequence_awareness_bonus(self):
        drill = _mk_drill(
            99,
            name="Надграждане",
            category="Основна фаза 2",
            skill_focus="Посрещане, Разпределение, Сервис",
        )
        focus = {"primary": "Посрещане", "secondary": "Разпределение"}
        state_without = PickedState(
            selected=[],
            picked_ids=set(),
            picked_skill_set=set(),
            progression_skill_base=set(),
            max_skill_count_so_far=2,
            build_pair_ready=False,
            recent_rank_by_id={},
        )
        state_with = PickedState(
            selected=[],
            picked_ids=set(),
            picked_skill_set={"Посрещане", "Разпределение"},
            progression_skill_base={"Посрещане", "Разпределение"},
            max_skill_count_so_far=2,
            build_pair_ready=False,
            recent_rank_by_id={},
        )
        score_without = scoreDrill(drill, "Интеграция", focus, state_without)["score"]
        score_with = scoreDrill(drill, "Интеграция", focus, state_with)["score"]
        self.assertGreaterEqual(score_with - score_without, 15)

    def test_recent_training_anti_repeat_and_novelty_score(self):
        drill_recent = _mk_drill(10, name="Скорошно", category="Основна фаза 1", skill_focus="Посрещане")
        drill_new = _mk_drill(11, name="Ново", category="Основна фаза 1", skill_focus="Посрещане")
        focus = {"primary": "Посрещане", "secondary": "Разпределение"}
        state = PickedState(
            selected=[],
            picked_ids=set(),
            picked_skill_set=set(),
            progression_skill_base=set(),
            max_skill_count_so_far=1,
            build_pair_ready=False,
            recent_rank_by_id={10: 1},
        )
        recent_meta = scoreDrill(drill_recent, "Изграждане", focus, state)
        new_meta = scoreDrill(drill_new, "Изграждане", focus, state)
        self.assertLess(recent_meta["score"], new_meta["score"])
        self.assertEqual(recent_meta["noveltyScore"], 0)
        self.assertEqual(new_meta["noveltyScore"], 12)


if __name__ == "__main__":
    unittest.main()

