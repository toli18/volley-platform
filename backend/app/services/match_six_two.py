# backend/app/services/match_six_two.py
"""6-2: два разпределителя; задава този в задната линия (винаги 3 предни атакуващи).

Роли: S1/S2 (разпределители), P1/P2 (посрещачи), C1/C2 (центрове).
R1 гайд: 1=S1 (задава), 2=P1, 3=C1, 4=S2 (атакува като диагонал), 5=P2, 6=C2
Състав: 2×S, 2×OH, 2×MB (без задължителен OPP).
"""
from __future__ import annotations

from typing import Optional

from app.services.match_formation_common import (
    BACK_ZONES,
    FRONT_ZONES,
    OPPOSITE_ZONE,
    apply_libero_display,
    build_rotated_formations,
    clamp_rot,
)

R1 = {4: "S2", 3: "C1", 2: "P1", 5: "P2", 6: "C2", 1: "S1"}
BASE_FORMATION = build_rotated_formations(R1)
SERVE_FORMATION = dict(BASE_FORMATION)
RECEIVE_FORMATION = dict(BASE_FORMATION)
PHASE_MAP = {"base": BASE_FORMATION, "serve": SERVE_FORMATION, "receive": RECEIVE_FORMATION}
REQUIRED_ROLES = {"S1", "S2", "P1", "P2", "C1", "C2"}


def assign_roles_from_r1(
    starting_zones: dict[int, int],
    position_by_athlete: dict[int, str],
) -> dict[str, int]:
    zone_of = {int(aid): int(z) for z, aid in starting_zones.items()}
    starting_ids = set(zone_of.keys())
    by_pos: dict[str, list[int]] = {"S": [], "OH": [], "MB": [], "OPP": [], "L": []}
    for aid in starting_ids:
        code = str(position_by_athlete.get(aid) or "").upper()
        if code in by_pos:
            by_pos[code].append(int(aid))

    roles: dict[str, int] = {}
    setters = list(by_pos["S"])
    # Prefer S in zone 1 as S1 (back-row setter at R1)
    s1 = next((a for a in setters if zone_of.get(a) == 1), None)
    if s1:
        roles["S1"] = s1
        other = [a for a in setters if a != s1]
        if other:
            opp_z = OPPOSITE_ZONE.get(zone_of.get(s1, 1), 4)
            s2 = next((a for a in other if zone_of.get(a) == opp_z), None)
            roles["S2"] = s2 or other[0]
    elif len(setters) >= 2:
        roles["S1"] = setters[0]
        roles["S2"] = setters[1]
    elif len(setters) == 1:
        roles["S1"] = setters[0]

    ohs = list(by_pos["OH"]) + list(by_pos["OPP"])  # OPP can fill OH slot in 6-2
    p1 = next((a for a in ohs if zone_of.get(a) == 2), None)
    p2 = next((a for a in ohs if zone_of.get(a) == 5), None)
    if p1 and p2:
        roles["P1"], roles["P2"] = p1, p2
    else:
        front = [a for a in ohs if zone_of.get(a) in FRONT_ZONES]
        back = [a for a in ohs if zone_of.get(a) in BACK_ZONES]
        if front and back:
            roles["P1"], roles["P2"] = front[0], back[0]
        elif len(ohs) >= 2:
            roles["P1"], roles["P2"] = ohs[0], ohs[1]
        elif len(ohs) == 1:
            roles["P1"] = ohs[0]

    mbs = list(by_pos["MB"])
    c1 = next((a for a in mbs if zone_of.get(a) == 3), None)
    c2 = next((a for a in mbs if zone_of.get(a) == 6), None)
    if c1 and c2:
        roles["C1"], roles["C2"] = c1, c2
    else:
        front = [a for a in mbs if zone_of.get(a) in FRONT_ZONES]
        back = [a for a in mbs if zone_of.get(a) in BACK_ZONES]
        if front and back:
            roles["C1"], roles["C2"] = front[0], back[0]
        elif len(mbs) >= 2:
            roles["C1"], roles["C2"] = mbs[0], mbs[1]
        elif len(mbs) == 1:
            roles["C1"] = mbs[0]

    return roles


def formation_for(rotation: int, phase: str) -> dict[int, str]:
    if phase == "defense":
        phase = "base"
    table = PHASE_MAP.get(phase) or BASE_FORMATION
    return dict(table[clamp_rot(rotation)])


def apply_formation_display(
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, int]:
    form = formation_for(rotation, phase)
    zones, _ = apply_libero_display(form, role_to_athlete, libero_athlete_id)
    return zones


def athlete_roles_on_court(
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, str]:
    form = formation_for(rotation, phase)
    _, roles = apply_libero_display(form, role_to_athlete, libero_athlete_id)
    return roles
