# backend/app/services/match_live.py
"""Live match score + rotation rules."""
from __future__ import annotations

from app.models_matches import MatchFormat, MatchStatAction

# Actions that award a point to us / opponent when recorded as a player stat
POINT_FOR_US = {
    MatchStatAction.kill,
    MatchStatAction.ace,
    MatchStatAction.block,
    MatchStatAction.our_point,
    MatchStatAction.opp_error,
}
POINT_FOR_OPP = {
    MatchStatAction.attack_error,
    MatchStatAction.error,
    MatchStatAction.pass_error,
    MatchStatAction.opp_point,
}
# pass_1 / pass_2 / pass_3 / dig — само качество, без точка и без ротация
NO_POINT_ACTIONS = {
    MatchStatAction.dig,
    MatchStatAction.pass_0,
    MatchStatAction.pass_1,
    MatchStatAction.pass_2,
    MatchStatAction.pass_3,
    MatchStatAction.free_ball,
}


def normalize_format(value: MatchFormat | str | None) -> str:
    if isinstance(value, MatchFormat):
        return value.value
    raw = str(value or MatchFormat.bo5.value).strip().lower()
    if raw in ("bo3", "2-of-3", "best_of_3", "2/3"):
        return MatchFormat.bo3.value
    return MatchFormat.bo5.value


def sets_to_win(match_format: MatchFormat | str | None) -> int:
    return 2 if normalize_format(match_format) == MatchFormat.bo3.value else 3


def max_sets(match_format: MatchFormat | str | None) -> int:
    return 3 if normalize_format(match_format) == MatchFormat.bo3.value else 5


def next_rotation(rotation: int) -> int:
    r = int(rotation or 1)
    return 1 if r >= 6 else r + 1


def apply_point(*, our_score: int, opp_score: int, rotation: int, we_serve: bool, scored_for: str) -> dict:
    """Apply one point. scored_for: 'us' | 'opp'."""
    our = int(our_score)
    opp = int(opp_score)
    rot = int(rotation or 1)
    serve = bool(we_serve)

    if scored_for == "us":
        our += 1
        if not serve:
            # side-out → we rotate and take serve
            rot = next_rotation(rot)
            serve = True
    elif scored_for == "opp":
        opp += 1
        if serve:
            # side-out against us → lose serve, no rotate
            serve = False
    else:
        raise ValueError("scored_for must be us|opp")

    return {
        "our_score": our,
        "opp_score": opp,
        "rotation": rot,
        "we_serve": serve,
    }


def set_target(set_number: int, match_format: MatchFormat | str | None = MatchFormat.bo5) -> int:
    """Deciding set (last allowed) is to 15; others to 25."""
    return 15 if int(set_number) >= max_sets(match_format) else 25


def is_set_won(
    our: int,
    opp: int,
    set_number: int,
    match_format: MatchFormat | str | None = MatchFormat.bo5,
) -> str | None:
    """Returns 'us'/'opp' winner side or None."""
    target = set_target(set_number, match_format)
    if our >= target and our - opp >= 2:
        return "us"
    if opp >= target and opp - our >= 2:
        return "opp"
    return None


def count_sets_won(sets: list) -> tuple[int, int]:
    """Count finished sets won by us / opp from MatchSet-like rows."""
    us = opp = 0
    for s in sets:
        status = s.status.value if hasattr(s.status, "value") else str(s.status)
        if status != "finished":
            continue
        if int(s.our_score) > int(s.opp_score):
            us += 1
        elif int(s.opp_score) > int(s.our_score):
            opp += 1
    return us, opp


def is_match_won(sets_won_us: int, sets_won_opp: int, match_format: MatchFormat | str | None) -> str | None:
    need = sets_to_win(match_format)
    if int(sets_won_us) >= need:
        return "us"
    if int(sets_won_opp) >= need:
        return "opp"
    return None


def action_point_side(action: MatchStatAction | str) -> str | None:
    if isinstance(action, str):
        try:
            action = MatchStatAction(action)
        except ValueError:
            return None
    if action in NO_POINT_ACTIONS:
        return None
    if action in POINT_FOR_US:
        return "us"
    if action in POINT_FOR_OPP:
        return "opp"
    return None
