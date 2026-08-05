# backend/app/services/match_formation_common.py
"""Споделена математика за формации (ротации на зони/роли)."""
from __future__ import annotations

ROTATE_FROM = {1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 1}
FRONT_ZONES = {2, 3, 4}
BACK_ZONES = {1, 5, 6}
OPPOSITE_ZONE = {1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3}


def build_rotated_formations(r1: dict[int, str]) -> dict[int, dict[int, str]]:
    """R1 zone→role → таблица за ротации 1..6 (side-out clockwise)."""
    out: dict[int, dict[int, str]] = {1: {int(k): v for k, v in r1.items()}}
    cur = dict(out[1])
    for r in range(2, 7):
        cur = {z: cur[ROTATE_FROM[z]] for z in (1, 2, 3, 4, 5, 6)}
        out[r] = dict(cur)
    return out


def clamp_rot(rotation: int) -> int:
    r = int(rotation or 1)
    if r < 1:
        return 1
    if r > 6:
        return ((r - 1) % 6) + 1
    return r


def apply_libero_display(
    form: dict[int, str],
    role_to_athlete: dict[str, int],
    libero_athlete_id: int | None,
    *,
    mb_roles: set[str] | None = None,
    phase: str | None = None,
) -> tuple[dict[int, int], dict[int, str]]:
    """zone→athlete и athlete→role; либеро замества MB в задна линия.

    Правило: либерото не бие сервис. Когато MB е в зона 1 при наш сервис,
    либерото излиза и центърът стои на корта да сервира.
    """
    mb = mb_roles or {"C1", "C2"}
    server_role = form.get(1)
    mb_serving = (
        (phase or "") == "serve"
        and server_role in mb
        and bool(libero_athlete_id)
    )

    zones_out: dict[int, int] = {}
    roles_out: dict[int, str] = {}
    for zone, role in form.items():
        aid = role_to_athlete.get(role)
        if aid is None:
            continue
        # При сервис на център — без либеро на корта (MB сервира в зона 1)
        use_libero = (
            bool(libero_athlete_id)
            and role in mb
            and int(zone) in BACK_ZONES
            and not mb_serving
        )
        if use_libero:
            zones_out[int(zone)] = int(libero_athlete_id)
            roles_out[int(libero_athlete_id)] = "L"
        else:
            zones_out[int(zone)] = int(aid)
            roles_out[int(aid)] = role
    return zones_out, roles_out
