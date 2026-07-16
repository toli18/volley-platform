/**
 * Прецизни координати на корта (едната половина, мрежата горе).
 * x/y в % от полето: x 0=ляво … 100=дясно; y 0=мрежа … 100=крайна линия.
 */

export const BASE_ZONE_XY = {
  4: { x: 17, y: 18 },
  3: { x: 50, y: 15 },
  2: { x: 83, y: 18 },
  5: { x: 17, y: 70 },
  6: { x: 50, y: 68 },
  1: { x: 83, y: 72 },
};

/** Легални / стартови позиции — равномерно за setup. */
export const GRID_ZONE_XY = { ...BASE_ZONE_XY };

/**
 * Serve / defense / receive: по ротация × зона.
 * Целта е стекове като във Volleyball Rotations, не 2×3 решетка.
 */
const SERVE_XY = {
  1: {
    4: { x: 16, y: 12 },
    3: { x: 50, y: 10 },
    2: { x: 84, y: 12 },
    5: { x: 22, y: 58 },
    6: { x: 50, y: 62 },
    1: { x: 86, y: 82 },
  },
  2: {
    4: { x: 16, y: 12 },
    3: { x: 50, y: 10 },
    2: { x: 84, y: 12 },
    5: { x: 28, y: 60 },
    6: { x: 62, y: 48 },
    1: { x: 86, y: 78 },
  },
  3: {
    4: { x: 18, y: 12 },
    3: { x: 48, y: 14 },
    2: { x: 82, y: 12 },
    5: { x: 38, y: 52 },
    6: { x: 58, y: 64 },
    1: { x: 84, y: 72 },
  },
  4: {
    4: { x: 16, y: 14 },
    3: { x: 48, y: 12 },
    2: { x: 78, y: 16 },
    5: { x: 24, y: 62 },
    6: { x: 52, y: 58 },
    1: { x: 88, y: 80 },
  },
  5: {
    4: { x: 18, y: 12 },
    3: { x: 52, y: 14 },
    2: { x: 80, y: 14 },
    5: { x: 30, y: 58 },
    6: { x: 68, y: 60 },
    1: { x: 86, y: 78 },
  },
  6: {
    4: { x: 20, y: 14 },
    3: { x: 50, y: 12 },
    2: { x: 78, y: 14 },
    5: { x: 32, y: 62 },
    6: { x: 58, y: 66 },
    1: { x: 84, y: 76 },
  },
};

/** Посрещане — стекове, трима в линия, разпределител скрит. */
const RECEIVE_XY = {
  1: {
    4: { x: 14, y: 10 },
    3: { x: 42, y: 9 },
    2: { x: 78, y: 42 },
    5: { x: 28, y: 58 },
    6: { x: 52, y: 64 },
    1: { x: 74, y: 56 },
  },
  2: {
    4: { x: 18, y: 10 },
    3: { x: 48, y: 22 },
    2: { x: 72, y: 14 },
    5: { x: 22, y: 62 },
    6: { x: 50, y: 66 },
    1: { x: 78, y: 58 },
  },
  3: {
    4: { x: 36, y: 18 },
    3: { x: 58, y: 12 },
    2: { x: 82, y: 12 },
    5: { x: 24, y: 60 },
    6: { x: 48, y: 52 },
    1: { x: 76, y: 68 },
  },
  4: {
    4: { x: 22, y: 16 },
    3: { x: 44, y: 20 },
    2: { x: 70, y: 12 },
    5: { x: 30, y: 64 },
    6: { x: 56, y: 58 },
    1: { x: 82, y: 72 },
  },
  5: {
    4: { x: 16, y: 12 },
    3: { x: 40, y: 10 },
    2: { x: 68, y: 14 },
    5: { x: 42, y: 48 },
    6: { x: 58, y: 64 },
    1: { x: 80, y: 56 },
  },
  6: {
    4: { x: 14, y: 10 },
    3: { x: 46, y: 12 },
    2: { x: 74, y: 16 },
    5: { x: 26, y: 62 },
    6: { x: 54, y: 58 },
    1: { x: 78, y: 70 },
  },
};

const DEFENSE_XY = {
  1: {
    4: { x: 14, y: 14 },
    3: { x: 50, y: 12 },
    2: { x: 86, y: 14 },
    5: { x: 20, y: 64 },
    6: { x: 50, y: 72 },
    1: { x: 82, y: 64 },
  },
  2: {
    4: { x: 14, y: 14 },
    3: { x: 50, y: 12 },
    2: { x: 86, y: 14 },
    5: { x: 24, y: 66 },
    6: { x: 54, y: 54 },
    1: { x: 84, y: 70 },
  },
  3: {
    4: { x: 16, y: 14 },
    3: { x: 48, y: 14 },
    2: { x: 84, y: 12 },
    5: { x: 36, y: 56 },
    6: { x: 60, y: 66 },
    1: { x: 84, y: 68 },
  },
  4: {
    4: { x: 16, y: 14 },
    3: { x: 50, y: 12 },
    2: { x: 80, y: 16 },
    5: { x: 22, y: 66 },
    6: { x: 52, y: 60 },
    1: { x: 86, y: 74 },
  },
  5: {
    4: { x: 16, y: 14 },
    3: { x: 52, y: 14 },
    2: { x: 82, y: 14 },
    5: { x: 28, y: 62 },
    6: { x: 66, y: 64 },
    1: { x: 86, y: 72 },
  },
  6: {
    4: { x: 18, y: 14 },
    3: { x: 50, y: 12 },
    2: { x: 80, y: 14 },
    5: { x: 30, y: 64 },
    6: { x: 58, y: 68 },
    1: { x: 84, y: 70 },
  },
};

const PHASE_TABLE = {
  serve: SERVE_XY,
  receive: RECEIVE_XY,
  defense: DEFENSE_XY,
  grid: null,
};

function clampRot(rotation) {
  const r = Number(rotation) || 1;
  if (r < 1) return 1;
  if (r > 6) return ((r - 1) % 6) + 1;
  return r;
}

export function zonePosition({ zone, phase = "grid", rotation = 1 }) {
  const z = Number(zone);
  if (phase === "grid" || !PHASE_TABLE[phase]) {
    return { ...(GRID_ZONE_XY[z] || { x: 50, y: 50 }) };
  }
  const table = PHASE_TABLE[phase];
  const rot = clampRot(rotation);
  const row = table[rot] || table[1];
  return { ...(row[z] || BASE_ZONE_XY[z] || { x: 50, y: 50 }) };
}

export function allZonePositions({ phase = "grid", rotation = 1 }) {
  const out = {};
  for (const z of [1, 2, 3, 4, 5, 6]) {
    out[z] = zonePosition({ zone: z, phase, rotation });
  }
  return out;
}

/** Най-близка зона по % координати — за drag drop. */
export function nearestZone(xPct, yPct, { phase = "grid", rotation = 1 } = {}) {
  const positions = allZonePositions({ phase, rotation });
  let best = 1;
  let bestDist = Infinity;
  for (const [z, p] of Object.entries(positions)) {
    const d = (p.x - xPct) ** 2 + (p.y - yPct) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = Number(z);
    }
  }
  return best;
}
