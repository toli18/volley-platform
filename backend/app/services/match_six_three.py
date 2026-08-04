# backend/app/services/match_six_three.py
"""6-3: три разпределителя, редуващи се (всеки задава ~2 ротации).

Роли: S1/S2/S3 + P1/P2 + C1
R1 гайд (редуване): 1=S1, 2=P1, 3=S2, 4=P2, 5=S3, 6=C1
Състав: 3×S, 2×OH, 1×MB (OPP може да замени OH).
Активният разпределител е този в предна линия (зони 2/3/4) — за етикети всички S* остават.
"""
from __future__ import annotations

from typing import Optional

from app.services.match_formation_common import (
    BACK_ZONES,
    FRONT_ZONES,
    apply_libero_display,
    build_rotated_formations,
    clamp_rot,
)

R1 = {4: "P2", 3: "S2", 2: "P1", 5: "S3", 6: "C1", 1: "S1"}
BASE_FORMATION = build_rotated_formations(R1)
SERVE_FORMATION = dict(BASE_FORMATION)
RECEIVE_FORMATION = dict(BASE_FORMATION)
PHASE_MAP = {"base": BASE_FORMATION, "serve": SERVE_FORMATION, "receive": RECEIVE_FORMATION}
REQUIRED_ROLES = {"S1", "S2", "S3", "P1", "P2", "C1"}


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
    # Prefer R1 zones 1, 3, 5 for S1, S2, S3
    prefer = {1: "S1", 3: "S2", 5: "S3"}
    used: set[int] = set()
    for z, role in prefer.items():
        hit = next((a for a in setters if zone_of.get(a) == z and a not in used), None)
        if hit:
            roles[role] = hit
            used.add(hit)
    remaining = [a for a in setters if a not in used]
    for role in ("S1", "S2", "S3"):
        if role not in roles and remaining:
            roles[role] = remaining.pop(0)

    hitters = list(by_pos["OH"]) + list(by_pos["OPP"]) + list(by_pos["MB"])
    # Prefer P1 in 2, P2 in 4, C1 in 6
    p1 = next((a for a in hitters if zone_of.get(a) == 2), None)
    p2 = next((a for a in hitters if zone_of.get(a) == 4), None)
    c1 = next((a for a in by_pos["MB"] if zone_of.get(a) == 6), None)
    if not c1:
        c1 = next((a for a in hitters if zone_of.get(a) == 6), None)

    taken = set(roles.values())
    if p1 and p1 not in taken:
        roles["P1"] = p1
        taken.add(p1)
    if p2 and p2 not in taken:
        roles["P2"] = p2
        taken.add(p2)
    if c1 and c1 not in taken:
        roles["C1"] = c1
        taken.add(c1)

    leftover = [a for a in hitters if a not in taken]
    for role in ("P1", "P2", "C1"):
        if role not in roles and leftover:
            roles[role] = leftover.pop(0)

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
    zones, _ = apply_libero_display(form, role_to_athlete, libero_athlete_id, mb_roles={"C1"})
    return zones


def athlete_roles_on_court(
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, str]:
    form = formation_for(rotation, phase)
    _, roles = apply_libero_display(form, role_to_athlete, libero_athlete_id, mb_roles={"C1"})
    return roles
