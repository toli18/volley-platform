import unittest

from backend.app.services.hybrid_training_generator import generate_training_session, hard_filter_drills


def _mk_drill(
    did: int,
    *,
    level="U16",
    age_min=14,
    age_max=17,
    equipment="Топки, Мрежа",
    players="12",
    intensity_type="medium",
    category="Technique",
    domains=None,
    phases=None,
):
    return {
        "id": did,
        "title": f"Drill {did}",
        "name": f"Drill {did}",
        "level": level,
        "age_min": age_min,
        "age_max": age_max,
        "equipment": equipment,
        "players": players,
        "intensity_type": intensity_type,
        "rpe": 5,
        "category": category,
        "duration_min": 6,
        "duration_max": 10,
        "skill_domains": domains or ["Приемане"],
        "game_phases": phases or ["K1"],
        "technical_focus": ["Passing"],
        "tactical_focus": ["Transition"],
        "zone_focus": ["zone_1"],
        "description": "",
        "training_goal": "",
        "type_of_drill": "",
    }


class HybridGeneratorTests(unittest.TestCase):
    def setUp(self):
        self.base_request = {
            "age": 15,
            "level": "U16",
            "periodPhase": "inseason",
            "durationTotalMin": 90,
            "playersCount": 12,
            "equipmentAvailable": ["Топки", "Мрежа", "Конуси"],
            "focusSkills": ["Passing"],
            "focusDomains": ["Приемане"],
            "focusGamePhases": ["K1"],
            "intensityTarget": "medium",
            "constraints": {
                "excludeDrillIds": [],
                "mustIncludeDomains": [],
                "maxHighIntensityInRow": 2,
                "avoidRepeatSameCategory": True,
            },
            "randomSeed": 42,
        }

    def test_hard_constraints_filter_age_level_equipment(self):
        drills = [
            _mk_drill(1, age_min=14, age_max=17, level="U16", equipment="Топки, Мрежа"),
            _mk_drill(2, age_min=18, age_max=19, level="U18", equipment="Топки"),
            _mk_drill(3, age_min=14, age_max=17, level="U16", equipment="Щанги"),
        ]
        filtered = hard_filter_drills(drills, self.base_request, "Technique")
        ids = [d["id"] for d, _ in filtered]
        self.assertEqual(ids, [1])

    def test_intensity_progression_rule(self):
        drills = [_mk_drill(i, intensity_type="high") for i in range(1, 30)]
        req = dict(self.base_request)
        req["constraints"] = dict(req["constraints"])
        req["constraints"]["maxHighIntensityInRow"] = 1
        req["intensityTarget"] = "high"

        out = generate_training_session(drills, req)
        self.assertFalse(out["session"]["checks"]["intensityProgressionOk"])

    def test_deterministic_with_seed(self):
        drills = [_mk_drill(i, domains=["Приемане", "Сервис"]) for i in range(1, 25)]
        out1 = generate_training_session(drills, self.base_request)
        out2 = generate_training_session(drills, self.base_request)
        self.assertEqual(out1, out2)

    def test_coverage_improves_for_must_include_domains(self):
        drills = [
            _mk_drill(1, domains=["Приемане"]),
            _mk_drill(2, domains=["Сервис"]),
            _mk_drill(3, domains=["Блок"]),
            _mk_drill(4, domains=["Атака"]),
            _mk_drill(5, domains=["Защита"]),
        ]
        req = dict(self.base_request)
        req["constraints"] = dict(req["constraints"])
        req["constraints"]["mustIncludeDomains"] = ["Блок"]

        out = generate_training_session(drills, req)
        coverage = out["session"]["checks"]["coverage"]["skill_domains"]
        self.assertIn("блок", coverage)
        self.assertGreaterEqual(coverage["блок"], 1)


if __name__ == "__main__":
    unittest.main()

