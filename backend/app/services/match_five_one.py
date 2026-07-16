# backend/app/services/match_five_one.py
"""5-1 формации по графиката ROTACION SISTEMAS 5-1.

Роли: A=armador(S), O=opuesto(OPP), P1/P2=puntas(OH), C1/C2=centrales(MB).
C в задна линия → либеро.

Номерация:
  Наша R1 = испанска Rotación 1 (A в зона 1)
  Наша R2 = испанска Rotación 6 (A в зона 6)
  Наша R3 = испанска Rotación 5 (A в зона 5)
  Наша R4 = испанска Rotación 4 (A в зона 4)
  Наша R5 = испанска Rotación 3 (A в зона 3)
  Наша R6 = испанска Rotación 2 (A в зона 2)

ZONE (мрежа горе): 4 3 2 / 5 6 1
Стандартен R1 BASE: 1=A, 2=P1, 3=C1, 4=O, 5=P2, 6=C2
"""
from __future__ import annotations

from typing import Optional

# Специализирани позиции след превключване (SAQUE / RECEPCIÓN / DEFENSA)
# по нашата ротация. Стойности = роля в display-зона.

SERVE_FORMATION = {
    # SAQUE — атакуващи позиции след наш сервис
    1: {4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "C2", 1: "A"},
    2: {4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1"},
    3: {4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1"},
    4: {4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O"},
    5: {4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2"},
    6: {4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2"},
}

RECEIVE_FORMATION = {
    # RECEPCIÓN — стек: A скрит, O/C навън при нужда, посрещачи в линия
    # (визуалните координати са по роля в matchCourtLayout.js)
    1: {4: "O", 3: "C1", 2: "P1", 5: "P2", 6: "C2", 1: "A"},
    2: {4: "C1", 3: "O", 2: "P1", 5: "C2", 6: "P2", 1: "A"},
    3: {4: "O", 3: "P2", 2: "C2", 5: "P1", 6: "A", 1: "C1"},
    4: {4: "C2", 3: "P2", 2: "O", 5: "C1", 6: "P1", 1: "A"},
    5: {4: "C2", 3: "O", 2: "P1", 5: "A", 6: "P2", 1: "C1"},
    6: {4: "O", 3: "P1", 2: "C1", 5: "P2", 6: "C2", 1: "A"},
}

DEFENSE_FORMATION = {
    # DEFENSA — base след разиграване
    1: {4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "A", 1: "C2"},
    2: {4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1"},
    3: {4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1"},
    4: {4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O"},
    5: {4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2"},
    6: {4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2"},
}

# Легална BASE подредба (без стекове) — за справка / бъдещ UI
BASE_FORMATION = {
    1: {4: "O", 3: "C1", 2: "P1", 5: "P2", 6: "C2", 1: "A"},
    2: {4: "P2", 3: "O", 2: "C1", 5: "C2", 6: "A", 1: "P1"},
    3: {4: "C2", 3: "P2", 2: "O", 5: "A", 6: "P1", 1: "C1"},
    4: {4: "A", 3: "C2", 2: "P2", 5: "P1", 6: "C1", 1: "O"},
    5: {4: "P1", 3: "A", 2: "C2", 5: "C1", 6: "O", 1: "P2"},
    6: {4: "C1", 3: "P1", 2: "A", 5: "O", 6: "P2", 1: "C2"},
}

PHASE_MAP = {
    "serve": SERVE_FORMATION,
    "receive": RECEIVE_FORMATION,
    "defense": DEFENSE_FORMATION,
    "base": BASE_FORMATION,
}

FRONT_ZONES = {2, 3, 4}
BACK_ZONES = {1, 5, 6}
OPPOSITE_ZONE = {1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3}


def assign_roles_from_r1(
    starting_zones: dict[int, int],
    position_by_athlete: dict[int, str],
) -> dict[str, int]:
    """role → athlete_id. Работи най-добре при стандартен R1: A1 P1@2 C1@3 O@4 P2@5 C2@6."""
    zone_of = {int(aid): int(z) for z, aid in starting_zones.items()}
    starting_ids = set(zone_of.keys())

    by_pos: dict[str, list[int]] = {"S": [], "OH": [], "MB": [], "OPP": [], "L": []}
    for aid in starting_ids:
        code = str(position_by_athlete.get(aid) or "").upper()
        if code in by_pos:
            by_pos[code].append(int(aid))

    roles: dict[str, int] = {}

    # A = разпределител; предпочитаме зона 1 ако там е S
    if by_pos["S"]:
        s_in_1 = next((a for a in by_pos["S"] if zone_of.get(a) == 1), None)
        roles["A"] = s_in_1 or by_pos["S"][0]

    # O = диагонал; предпочитаме срещуположната на A зона
    if by_pos["OPP"]:
        if "A" in roles:
            opp_zone = OPPOSITE_ZONE.get(zone_of.get(roles["A"], 1), 4)
            o_there = next((a for a in by_pos["OPP"] if zone_of.get(a) == opp_zone), None)
            roles["O"] = o_there or by_pos["OPP"][0]
        else:
            roles["O"] = by_pos["OPP"][0]

    # P1 / P2 — по графиката: P1 стартова предна (зона 2), P2 задна (зона 5)
    ohs = [a for a in by_pos["OH"]]
    p1 = next((a for a in ohs if zone_of.get(a) == 2), None)
    p2 = next((a for a in ohs if zone_of.get(a) == 5), None)
    if p1 and p2:
        roles["P1"] = p1
        roles["P2"] = p2
    else:
        front_oh = [a for a in ohs if zone_of.get(a) in FRONT_ZONES]
        back_oh = [a for a in ohs if zone_of.get(a) in BACK_ZONES]
        if front_oh and back_oh:
            roles["P1"] = front_oh[0]
            roles["P2"] = back_oh[0]
        elif len(ohs) >= 2:
            roles["P1"] = ohs[0]
            roles["P2"] = ohs[1]
        elif len(ohs) == 1:
            roles["P1"] = ohs[0]

    # C1 / C2 — C1 зона 3, C2 зона 6
    mbs = [a for a in by_pos["MB"]]
    c1 = next((a for a in mbs if zone_of.get(a) == 3), None)
    c2 = next((a for a in mbs if zone_of.get(a) == 6), None)
    if c1 and c2:
        roles["C1"] = c1
        roles["C2"] = c2
    else:
        front_mb = [a for a in mbs if zone_of.get(a) in FRONT_ZONES]
        back_mb = [a for a in mbs if zone_of.get(a) in BACK_ZONES]
        if front_mb and back_mb:
            roles["C1"] = front_mb[0]
            roles["C2"] = back_mb[0]
        elif len(mbs) >= 2:
            roles["C1"] = mbs[0]
            roles["C2"] = mbs[1]
        elif len(mbs) == 1:
            roles["C1"] = mbs[0]

    return roles


def formation_for(rotation: int, phase: str) -> dict[int, str]:
    table = PHASE_MAP.get(phase) or SERVE_FORMATION
    rot = int(rotation)
    if rot not in table:
        rot = ((rot - 1) % 6) + 1
    return dict(table[rot])


def role_for_zone(rotation: int, phase: str, zone: int) -> Optional[str]:
    form = formation_for(rotation, phase)
    return form.get(int(zone))


def apply_formation_display(
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, int]:
    """role formation → display zone → athlete_id. Либеро замества C в задна линия."""
    form = formation_for(rotation, phase)
    out: dict[int, int] = {}
    for zone, role in form.items():
        aid = role_to_athlete.get(role)
        if aid is None:
            continue
        if libero_athlete_id and role in {"C1", "C2"} and int(zone) in BACK_ZONES:
            out[int(zone)] = int(libero_athlete_id)
        else:
            out[int(zone)] = int(aid)
    return out


def athlete_roles_on_court(
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, str]:
    """athlete_id → role code (L ако либеро е на мястото на C)."""
    form = formation_for(rotation, phase)
    out: dict[int, str] = {}
    for zone, role in form.items():
        aid = role_to_athlete.get(role)
        if aid is None:
            continue
        if libero_athlete_id and role in {"C1", "C2"} and int(zone) in BACK_ZONES:
            out[int(libero_athlete_id)] = "L"
        else:
            out[int(aid)] = role
    return out


def phase_from_serve(we_serve: bool, override: Optional[str] = None) -> str:
    if override in PHASE_MAP:
        return override
    return "serve" if we_serve else "receive"
