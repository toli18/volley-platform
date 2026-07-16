# backend/app/services/match_five_one.py
"""5-1 формации: BASE ротация + SAQUE / RECEPCIÓN / DEFENSA (по роля).

Роли (от графиката ROTACION SISTEMAS 5-1):
  A  = разпределител (S)
  O  = диагонал (OPP)
  P1, P2 = посрещачи (OH)
  C1, C2 = централни (MB); в задна линия често се заменят с либеро

ZONE grid (наш корт):
  4  3  2   front (мрежа)
  5  6  1   back  (1 = сервис)
"""
from __future__ import annotations

from typing import Optional

# След специализирано нареждане: коя РОЛЯ стои в коя display-зона.
# BASE не се ползва тук — BASE = чистата ротационна подредба.
# Стойностите са стандартни 5-1 стекове; могат да се финетират по клубна школа.

# Ролите са фиксирани играчи (от R1).
# Приемаме стандартен R1 BASE: 1=A, 2=P1, 3=C1, 4=O, 5=P2, 6=C2
# (A срещу O). Таблиците по-долу са специализирани позиции след превключване.

SERVE_FORMATION = {
    # Наш сервис → атакуващи позиции
    1: {4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "C2", 1: "A"},
    2: {4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1"},
    3: {4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1"},
    4: {4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O"},
    5: {4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2"},
    6: {4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2"},
}

RECEIVE_FORMATION = {
    # Чужд сервис → стек / линия на посрещане (разпределителят скрит)
    1: {4: "O", 3: "C1", 2: "A", 5: "P1", 6: "P2", 1: "C2"},
    2: {4: "C1", 3: "A", 2: "P1", 5: "O", 6: "P2", 1: "C2"},
    3: {4: "A", 3: "P2", 2: "C2", 5: "P1", 6: "C1", 1: "O"},
    4: {4: "C2", 3: "A", 2: "O", 5: "P2", 6: "P1", 1: "C1"},
    5: {4: "C2", 3: "O", 2: "P1", 5: "A", 6: "P2", 1: "C1"},
    6: {4: "O", 3: "P1", 2: "A", 5: "P2", 6: "C2", 1: "C1"},
}

DEFENSE_FORMATION = {
    # Защита / base след разиграване
    1: {4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "A", 1: "C2"},
    2: {4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1"},
    3: {4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1"},
    4: {4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O"},
    5: {4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2"},
    6: {4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2"},
}

PHASE_MAP = {
    "serve": SERVE_FORMATION,
    "receive": RECEIVE_FORMATION,
    "defense": DEFENSE_FORMATION,
}

FRONT_ZONES = {2, 3, 4}
BACK_ZONES = {1, 5, 6}


def assign_roles_from_r1(
    starting_zones: dict[int, int],
    position_by_athlete: dict[int, str],
) -> dict[str, int]:
    """Връща role → athlete_id от R1 + позиционни кодове S/OH/MB/OPP."""
    zone_of = {int(aid): int(z) for z, aid in starting_zones.items()}
    by_pos: dict[str, list[int]] = {"S": [], "OH": [], "MB": [], "OPP": [], "L": []}
    for aid, pos in position_by_athlete.items():
        code = str(pos or "").upper()
        if code in by_pos:
            by_pos[code].append(int(aid))

    roles: dict[str, int] = {}

    if by_pos["S"]:
        roles["A"] = by_pos["S"][0]
    if by_pos["OPP"]:
        roles["O"] = by_pos["OPP"][0]

    ohs = sorted(by_pos["OH"], key=lambda a: zone_of.get(a, 99))
    if len(ohs) >= 1:
        # P1 = посрещач по-напред / по-малка зона при равенство
        front_oh = [a for a in ohs if zone_of.get(a) in FRONT_ZONES]
        back_oh = [a for a in ohs if zone_of.get(a) in BACK_ZONES]
        if front_oh and back_oh:
            roles["P1"] = front_oh[0]
            roles["P2"] = back_oh[0]
        else:
            roles["P1"] = ohs[0]
            if len(ohs) >= 2:
                roles["P2"] = ohs[1]

    mbs = sorted(by_pos["MB"], key=lambda a: zone_of.get(a, 99))
    if len(mbs) >= 1:
        front_mb = [a for a in mbs if zone_of.get(a) in FRONT_ZONES]
        back_mb = [a for a in mbs if zone_of.get(a) in BACK_ZONES]
        if front_mb and back_mb:
            roles["C1"] = front_mb[0]
            roles["C2"] = back_mb[0]
        else:
            roles["C1"] = mbs[0]
            if len(mbs) >= 2:
                roles["C2"] = mbs[1]

    return roles


def formation_for(rotation: int, phase: str) -> dict[int, str]:
    table = PHASE_MAP.get(phase) or SERVE_FORMATION
    rot = int(rotation)
    if rot not in table:
        rot = ((rot - 1) % 6) + 1
    return dict(table[rot])


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
        # Либеро вместо централен в задна зона
        if libero_athlete_id and role in {"C1", "C2"} and int(zone) in BACK_ZONES:
            out[int(zone)] = int(libero_athlete_id)
        else:
            out[int(zone)] = int(aid)
    return out


def phase_from_serve(we_serve: bool, override: Optional[str] = None) -> str:
    if override in PHASE_MAP:
        return override
    return "serve" if we_serve else "receive"
