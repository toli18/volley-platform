"""RIS final score → competition result mapping."""

from types import SimpleNamespace

from app.services.ris_import import apply_ris_result_to_event, final_sets_for_club


def _game(*, home_id, away_id, score_a, score_b):
    return {
        "homeTeam": {"kind": "team", "id": home_id, "displayName": "Home"},
        "awayTeam": {"kind": "team", "id": away_id, "displayName": "Away"},
        "finalScoreA": score_a,
        "finalScoreB": score_b,
    }


def test_final_sets_home_club():
    assert final_sets_for_club(_game(home_id=10, away_id=20, score_a=3, score_b=1), 10) == (3, 1)


def test_final_sets_away_club():
    assert final_sets_for_club(_game(home_id=10, away_id=20, score_a=3, score_b=1), 20) == (1, 3)


def test_final_sets_missing_or_zero():
    assert final_sets_for_club(_game(home_id=10, away_id=20, score_a=None, score_b=None), 10) is None
    assert final_sets_for_club(_game(home_id=10, away_id=20, score_a=0, score_b=0), 10) is None
    assert final_sets_for_club(_game(home_id=10, away_id=20, score_a=2, score_b=2), 10) is None


def test_apply_fills_empty_and_skips_manual():
    game = _game(home_id=10, away_id=20, score_a=3, score_b=0)
    ev = SimpleNamespace(
        result_our_sets=None,
        result_opp_sets=None,
        result_source=None,
        result_synced_at=None,
    )
    changed = apply_ris_result_to_event(ev, game, 10)
    assert "result_our_sets" in changed
    assert ev.result_our_sets == 3 and ev.result_opp_sets == 0
    assert ev.result_source == "ris"

    manual = SimpleNamespace(
        result_our_sets=2,
        result_opp_sets=1,
        result_source="manual",
        result_synced_at=None,
    )
    assert apply_ris_result_to_event(manual, game, 10) == []
    assert manual.result_our_sets == 2
