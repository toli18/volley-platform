# backend/app/services/match_rotations.py
"""Изчисляване на ротации за волейболни схеми (MVP: 5-1)."""
from __future__ import annotations

from typing import Optional

# При side-out: играчът от зона 2 отива на сервис (зона 1).
# new[1]=old[2], new[2]=old[3], ... new[6]=old[1]
ROTATE_FROM = {1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 1}

ZONE_LABELS_BG = {
    1: "I · задна дясна (сервис)",
    2: "II · предна дясна",
    3: "III · предна средна",
    4: "IV · предна лява",
    5: "V · задна лява",
    6: "VI · задна средна",
}


def rotate_zones(zones: dict[int, int], steps: int = 1) -> dict[int, int]:
    """zones: zone_number (1-6) -> athlete_id. Връща нова карта след `steps` ротации."""
    current = {int(z): int(aid) for z, aid in zones.items()}
    for _ in range(max(0, steps)):
        nxt: dict[int, int] = {}
        for zone in range(1, 7):
            src = ROTATE_FROM[zone]
            if src in current:
                nxt[zone] = current[src]
        current = nxt
    return current


def build_rotations_5_1(
    starting_zones: dict[int, int],
    *,
    libero_athlete_id: Optional[int] = None,
) -> list[dict]:
    """Връща R1..R6. starting_zones е стартовата шестица (R1)."""
    if set(starting_zones.keys()) != {1, 2, 3, 4, 5, 6}:
        missing = sorted({1, 2, 3, 4, 5, 6} - set(starting_zones.keys()))
        raise ValueError(f"Липсват зони: {missing}")
    ids = list(starting_zones.values())
    if len(set(ids)) != 6:
        raise ValueError("Дублиран състезател в стартовата шестица")
    if libero_athlete_id is not None and libero_athlete_id in ids:
        raise ValueError("Либерото не може да е едновременно в шестицата")

    rotations: list[dict] = []
    for r in range(1, 7):
        zones = rotate_zones(starting_zones, steps=r - 1)
        rotations.append(
            {
                "rotation": r,
                "zones": zones,
                "libero_athlete_id": libero_athlete_id,
            }
        )
    return rotations
