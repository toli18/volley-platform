"""Period report match scores: live sets vs competition (RIS/manual) result."""

from types import SimpleNamespace

from app.services.club_period_reports import resolve_match_report_score


def test_prefers_live_sets_when_present():
    ev = SimpleNamespace(result_our_sets=3, result_opp_sets=0, result_source="ris")
    assert resolve_match_report_score(live_us=1, live_opp=0, competition_event=ev) == (
        1,
        0,
        "live",
    )


def test_falls_back_to_competition_result():
    ev = SimpleNamespace(result_our_sets=3, result_opp_sets=1, result_source="ris")
    assert resolve_match_report_score(live_us=0, live_opp=0, competition_event=ev) == (
        3,
        1,
        "ris",
    )


def test_manual_source_and_missing_event():
    ev = SimpleNamespace(result_our_sets=2, result_opp_sets=3, result_source="manual")
    assert resolve_match_report_score(live_us=0, live_opp=0, competition_event=ev) == (
        2,
        3,
        "manual",
    )
    assert resolve_match_report_score(live_us=0, live_opp=0, competition_event=None) == (
        0,
        0,
        None,
    )


def test_incomplete_competition_result_ignored():
    ev = SimpleNamespace(result_our_sets=3, result_opp_sets=None, result_source="ris")
    assert resolve_match_report_score(live_us=0, live_opp=0, competition_event=ev) == (
        0,
        0,
        None,
    )
