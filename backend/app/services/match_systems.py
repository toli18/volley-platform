# backend/app/services/match_systems.py
"""Фасада: ротации / роли по схема (5-1, 6-2, 4-2, 6-3)."""
from __future__ import annotations

from typing import Optional

from app.services import match_five_one as five_one
from app.services import match_four_two as four_two
from app.services import match_six_three as six_three
from app.services import match_six_two as six_two
from app.services.match_rotations import build_rotations_5_1

SUPPORTED_SYSTEMS = ("5-1", "6-2", "4-2", "6-3")

_MODULES = {
    "5-1": five_one,
    "6-2": six_two,
    "4-2": four_two,
    "6-3": six_three,
}

_REQUIRED = {
    "5-1": {"A", "O", "P1", "P2", "C1", "C2"},
    "6-2": six_two.REQUIRED_ROLES,
    "4-2": four_two.REQUIRED_ROLES,
    "6-3": six_three.REQUIRED_ROLES,
}


def normalize_system(system: str | None) -> str:
    code = str(system or "5-1").strip()
    return code if code in _MODULES else "5-1"


def is_supported(system: str | None) -> bool:
    return normalize_system(system) in _MODULES


def required_roles(system: str | None) -> set[str]:
    return set(_REQUIRED.get(normalize_system(system), _REQUIRED["5-1"]))


def assign_roles(
    system: str | None,
    starting_zones: dict[int, int],
    position_by_athlete: dict[int, str],
) -> dict[str, int]:
    mod = _MODULES[normalize_system(system)]
    return mod.assign_roles_from_r1(starting_zones, position_by_athlete)


def formation_for(system: str | None, rotation: int, phase: str) -> dict[int, str]:
    mod = _MODULES[normalize_system(system)]
    return mod.formation_for(rotation, phase)


def apply_formation_display(
    system: str | None,
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, int]:
    mod = _MODULES[normalize_system(system)]
    return mod.apply_formation_display(
        rotation=rotation,
        phase=phase,
        role_to_athlete=role_to_athlete,
        libero_athlete_id=libero_athlete_id,
    )


def athlete_roles_on_court(
    system: str | None,
    *,
    rotation: int,
    phase: str,
    role_to_athlete: dict[str, int],
    libero_athlete_id: Optional[int] = None,
) -> dict[int, str]:
    mod = _MODULES[normalize_system(system)]
    return mod.athlete_roles_on_court(
        rotation=rotation,
        phase=phase,
        role_to_athlete=role_to_athlete,
        libero_athlete_id=libero_athlete_id,
    )


def phase_from_serve(we_serve: bool, override: Optional[str] = None) -> str:
    return five_one.phase_from_serve(we_serve, override)


def build_rotations(
    system: str | None,
    starting_zones: dict[int, int],
    *,
    libero_athlete_id: Optional[int] = None,
) -> list[dict]:
    """Зонова ротация на атлети (еднаква за всички схеми)."""
    return build_rotations_5_1(starting_zones, libero_athlete_id=libero_athlete_id)


def roles_complete(system: str | None, roles: dict[str, int]) -> bool:
    need = required_roles(system)
    return need.issubset(set(roles.keys())) and all(roles.get(r) for r in need)
