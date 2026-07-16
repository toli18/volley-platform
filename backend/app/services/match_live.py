# backend/app/services/match_live.py
"""Live match score + rotation rules."""
from __future__ import annotations

from app.models_matches import MatchStatAction

# Actions that award a point to us / opponent when recorded as a player stat
POINT_FOR_US = {
    MatchStatAction.kill,
    MatchStatAction.ace,
    MatchStatAction.block,
    MatchStatAction.our_point,
}
POINT_FOR_OPP = {
    MatchStatAction.attack_error,
    MatchStatAction.error,
    MatchStatAction.pass_error,
    MatchStatAction.opp_point,
}


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


def set_target(set_number: int) -> int:
    return 15 if int(set_number) >= 5 else 25


def is_set_won(our: int, opp: int, set_number: int) -> bool | None:
    """Returns 'us'/'opp' winner side or None."""
    target = set_target(set_number)
    if our >= target and our - opp >= 2:
        return "us"
    if opp >= target and opp - our >= 2:
        return "opp"
    return None


def action_point_side(action: MatchStatAction | str) -> str | None:
    if isinstance(action, str):
        try:
            action = MatchStatAction(action)
        except ValueError:
            return None
    if action in POINT_FOR_US:
        return "us"
    if action in POINT_FOR_OPP:
        return "opp"
    return None
