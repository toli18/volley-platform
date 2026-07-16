/** Court zone rotation math (mirrors backend match_rotations). */

// Forward: zone gets athlete from ROTATE_FROM[zone]
export const ROTATE_FROM = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 1 };
// Reverse: zone gets athlete from REVERSE_FROM[zone]
export const REVERSE_FROM = { 1: 6, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

export function rotateZones(zones, steps = 1) {
  let current = { ...zones };
  const n = Math.max(0, Number(steps) || 0);
  for (let i = 0; i < n; i += 1) {
    const nxt = {};
    for (let zone = 1; zone <= 6; zone += 1) {
      const src = ROTATE_FROM[zone];
      if (current[src] != null) nxt[zone] = current[src];
    }
    current = nxt;
  }
  return current;
}

export function reverseRotateZones(zones, steps = 1) {
  let current = { ...zones };
  const n = Math.max(0, Number(steps) || 0);
  for (let i = 0; i < n; i += 1) {
    const nxt = {};
    for (let zone = 1; zone <= 6; zone += 1) {
      const src = REVERSE_FROM[zone];
      if (current[src] != null) nxt[zone] = current[src];
    }
    current = nxt;
  }
  return current;
}

/** Swap two zone athletes in a zone->athleteId map. */
export function swapZoneAthletes(zones, zoneA, zoneB) {
  const a = Number(zoneA);
  const b = Number(zoneB);
  if (a === b) return { ...zones };
  const next = { ...zones };
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}
