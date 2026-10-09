"""Map RIS public games → ClubCompetitionEvent fields."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Optional


def team_side_name(side: Any) -> str | None:
    if not isinstance(side, dict):
        return None
    if side.get("kind") == "seed":
        label = (side.get("label") or "").strip()
        return label or None
    name = (side.get("displayName") or side.get("name") or "").strip()
    return name or None


def team_side_club_id(side: Any) -> int | None:
    if not isinstance(side, dict):
        return None
    if side.get("kind") != "team":
        return None
    try:
        return int(side.get("id"))
    except (TypeError, ValueError):
        return None


def is_placeholder_side(side: Any) -> bool:
    if not isinstance(side, dict):
        return True
    return side.get("kind") != "team" or team_side_club_id(side) is None


def opponent_for_club(game: dict, bvf_club_id: int) -> tuple[str | None, bool]:
    """Return (opponent_name, we_are_home)."""
    home = game.get("homeTeam")
    away = game.get("awayTeam")
    home_id = team_side_club_id(home)
    away_id = team_side_club_id(away)
    cid = int(bvf_club_id)
    if home_id == cid:
        return team_side_name(away), True
    if away_id == cid:
        return team_side_name(home), False
    # Club not on either side (shouldn't happen when filtered by club)
    return team_side_name(away) or team_side_name(home), True


def hall_location(game: dict) -> str:
    hall = game.get("hall") if isinstance(game.get("hall"), dict) else {}
    name = (hall.get("name") or "").strip()
    address = (hall.get("address") or "").strip()
    if name and address:
        return f"{name}, {address}"[:255]
    return (name or address or "Зала (БФВ)")[:255]


def parse_beg_time(raw: str | None) -> str:
    """Normalize HH:mm; treat 00:00 as unknown → 10:00 default with flag elsewhere."""
    t = (raw or "").strip()
    if re.fullmatch(r"\d{2}:\d{2}", t):
        return t
    if re.fullmatch(r"\d{1,2}:\d{2}", t):
        hh, mm = t.split(":")
        return f"{int(hh):02d}:{mm}"
    return "10:00"


def time_is_placeholder(raw: str | None) -> bool:
    t = (raw or "").strip()
    return t in ("", "00:00", "0:00")


def add_hours(hhmm: str, hours: int = 2) -> str:
    try:
        base = datetime.strptime(hhmm, "%H:%M")
    except ValueError:
        base = datetime.strptime("10:00", "%H:%M")
    end = base + timedelta(hours=hours)
    return end.strftime("%H:%M")


def competition_kind_from_game(game: dict) -> str:
    comp = game.get("competition") if isinstance(game.get("competition"), dict) else {}
    ctype = str(comp.get("type") or "").strip().lower()
    if ctype == "league":
        return "championship"
    return "tournament"


def age_hint_from_game(game: dict) -> tuple[int | None, int | None, str | None]:
    """Return (platform_age, sex 0/1, shortName) from championship.ageGroup."""
    champ = game.get("championship") if isinstance(game.get("championship"), dict) else {}
    ag = champ.get("ageGroup") if isinstance(champ.get("ageGroup"), dict) else {}
    short = (ag.get("shortName") or "").strip().lower()
    if not short:
        return None, None, None
    m = re.fullmatch(r"([mw])u(\d{1,2})", short)
    if m:
        sex = 0 if m.group(1) == "m" else 1
        return int(m.group(2)), sex, short
    if short in ("men", "m"):
        return 99, 0, short
    if short in ("women", "w"):
        return 99, 1, short
    return None, None, short


def suggest_card_index_id(card_indexes: list[Any], game: dict) -> int | None:
    age, sex, _ = age_hint_from_game(game)
    if age is None or sex is None:
        return None
    matches = []
    for ci in card_indexes:
        try:
            ci_age = int(getattr(ci, "age", 0) or 0)
            ci_sex = int(getattr(ci, "sex", 0) or 0)
        except (TypeError, ValueError):
            continue
        if ci_age == age and ci_sex == sex:
            matches.append(ci)
        elif age == 99 and ci_sex == sex and ci_age >= 18:
            matches.append(ci)
    if len(matches) == 1:
        return int(matches[0].id)
    return None


def championship_id_of(game: dict) -> int | None:
    champ = game.get("championship")
    if isinstance(champ, dict) and champ.get("id") is not None:
        try:
            return int(champ["id"])
        except (TypeError, ValueError):
            return None
    return None


def stream_url_of(game: dict) -> str | None:
    url = (game.get("streamUrl") or "").strip()
    return url or None


def match_number_of(game: dict) -> int | None:
    n = game.get("matchNumber")
    if n is None:
        return None
    try:
        return int(n)
    except (TypeError, ValueError):
        return None


def summarize_game_for_club(game: dict, bvf_club_id: int, *, already_imported: bool = False) -> dict[str, Any]:
    opponent, we_home = opponent_for_club(game, bvf_club_id)
    beg_raw = game.get("begTime")
    start = "10:00" if time_is_placeholder(beg_raw) else parse_beg_time(beg_raw)
    end = add_hours(start, 2)
    age, sex, short = age_hint_from_game(game)
    home = game.get("homeTeam") if isinstance(game.get("homeTeam"), dict) else {}
    away = game.get("awayTeam") if isinstance(game.get("awayTeam"), dict) else {}
    champ = game.get("championship") if isinstance(game.get("championship"), dict) else {}
    comp = game.get("competition") if isinstance(game.get("competition"), dict) else {}
    placeholders = is_placeholder_side(home) or is_placeholder_side(away)
    return {
        "ris_game_id": int(game["id"]),
        "match_number": match_number_of(game),
        "date": (game.get("begDate") or "").strip() or None,
        "start_time": start,
        "end_time": end,
        "time_placeholder": time_is_placeholder(beg_raw),
        "location": hall_location(game),
        "opponent_name": opponent,
        "we_are_home": we_home,
        "competition_kind": competition_kind_from_game(game),
        "status": game.get("status"),
        "round_label": game.get("roundLabel"),
        "championship_id": championship_id_of(game),
        "championship_label": (champ.get("label") or champ.get("name") or None),
        "competition_name": (comp.get("name") or None),
        "age_group_short": short,
        "age_hint": age,
        "sex_hint": sex,
        "home_name": team_side_name(home),
        "away_name": team_side_name(away),
        "stream_url": stream_url_of(game),
        "has_placeholders": placeholders,
        "already_imported": already_imported,
        "final_score_a": game.get("finalScoreA"),
        "final_score_b": game.get("finalScoreB"),
    }
