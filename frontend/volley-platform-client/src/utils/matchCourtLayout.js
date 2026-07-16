/**
 * Координати по РОЛЯ от графиката ROTACION SISTEMAS 5-1.
 * x/y %: мрежа горе (y→0), крайна линия долу (y→100); ляво→дясно x.
 *
 * Наша R ↔ испанска Rotación (зона на A):
 * R1→1, R2→6, R3→5, R4→4, R5→3, R6→2
 */

export const BASE_ZONE_XY = {
  4: { x: 17, y: 18 },
  3: { x: 50, y: 15 },
  2: { x: 83, y: 18 },
  5: { x: 17, y: 70 },
  6: { x: 50, y: 68 },
  1: { x: 83, y: 72 },
};

export const GRID_ZONE_XY = { ...BASE_ZONE_XY };

/** SAQUE — специализирани атакуващи позиции */
const SERVE_ROLE_XY = {
  1: {
    P1: { x: 16, y: 11 },
    C1: { x: 50, y: 9 },
    O: { x: 84, y: 11 },
    P2: { x: 22, y: 58 },
    C2: { x: 50, y: 62 },
    L: { x: 50, y: 62 },
    A: { x: 86, y: 82 },
  },
  2: {
    P2: { x: 16, y: 11 },
    C1: { x: 50, y: 9 },
    O: { x: 84, y: 11 },
    C2: { x: 28, y: 60 },
    L: { x: 28, y: 60 },
    A: { x: 58, y: 48 },
    P1: { x: 86, y: 78 },
  },
  3: {
    O: { x: 16, y: 11 },
    P2: { x: 48, y: 12 },
    C2: { x: 82, y: 11 },
    L: { x: 82, y: 11 },
    A: { x: 34, y: 52 },
    P1: { x: 58, y: 64 },
    C1: { x: 84, y: 72 },
  },
  4: {
    P2: { x: 16, y: 12 },
    C2: { x: 48, y: 10 },
    L: { x: 48, y: 10 },
    A: { x: 78, y: 14 },
    P1: { x: 24, y: 62 },
    C1: { x: 52, y: 58 },
    O: { x: 88, y: 80 },
  },
  5: {
    P1: { x: 16, y: 11 },
    C2: { x: 48, y: 12 },
    L: { x: 48, y: 12 },
    A: { x: 80, y: 14 },
    C1: { x: 30, y: 58 },
    O: { x: 66, y: 60 },
    P2: { x: 86, y: 78 },
  },
  6: {
    P1: { x: 18, y: 12 },
    C1: { x: 50, y: 10 },
    A: { x: 78, y: 14 },
    O: { x: 30, y: 62 },
    P2: { x: 58, y: 66 },
    C2: { x: 84, y: 76 },
    L: { x: 84, y: 76 },
  },
};

/**
 * RECEPCIÓN — стекове като на графиката:
 * A скрит зад/до преден играч; трима в линия на посрещане.
 */
const RECEIVE_ROLE_XY = {
  1: {
    O: { x: 14, y: 10 },
    C1: { x: 40, y: 9 },
    P1: { x: 72, y: 14 },
    A: { x: 80, y: 28 },
    P2: { x: 28, y: 58 },
    C2: { x: 54, y: 64 },
    L: { x: 54, y: 64 },
  },
  2: {
    C1: { x: 18, y: 10 },
    O: { x: 44, y: 10 },
    P1: { x: 74, y: 16 },
    A: { x: 68, y: 32 },
    C2: { x: 26, y: 60 },
    L: { x: 26, y: 60 },
    P2: { x: 52, y: 66 },
  },
  3: {
    O: { x: 16, y: 11 },
    P2: { x: 48, y: 12 },
    C2: { x: 78, y: 12 },
    L: { x: 78, y: 12 },
    A: { x: 58, y: 30 },
    P1: { x: 28, y: 60 },
    C1: { x: 72, y: 64 },
  },
  4: {
    C2: { x: 20, y: 14 },
    L: { x: 20, y: 14 },
    P2: { x: 44, y: 12 },
    O: { x: 78, y: 12 },
    A: { x: 62, y: 36 },
    C1: { x: 28, y: 62 },
    P1: { x: 56, y: 66 },
  },
  5: {
    C2: { x: 16, y: 11 },
    L: { x: 16, y: 11 },
    O: { x: 42, y: 10 },
    P1: { x: 72, y: 14 },
    A: { x: 56, y: 34 },
    P2: { x: 30, y: 62 },
    C1: { x: 78, y: 60 },
  },
  6: {
    O: { x: 14, y: 10 },
    P1: { x: 46, y: 11 },
    C1: { x: 76, y: 12 },
    A: { x: 82, y: 28 },
    P2: { x: 28, y: 60 },
    C2: { x: 54, y: 66 },
    L: { x: 54, y: 66 },
  },
};

/** DEFENSA */
const DEFENSE_ROLE_XY = {
  1: {
    P1: { x: 14, y: 13 },
    C1: { x: 50, y: 11 },
    O: { x: 86, y: 13 },
    P2: { x: 20, y: 64 },
    A: { x: 50, y: 72 },
    C2: { x: 82, y: 64 },
    L: { x: 82, y: 64 },
  },
  2: {
    P2: { x: 14, y: 13 },
    C1: { x: 50, y: 11 },
    O: { x: 86, y: 13 },
    C2: { x: 24, y: 64 },
    L: { x: 24, y: 64 },
    A: { x: 54, y: 54 },
    P1: { x: 84, y: 70 },
  },
  3: {
    O: { x: 16, y: 13 },
    P2: { x: 48, y: 13 },
    C2: { x: 84, y: 12 },
    L: { x: 84, y: 12 },
    A: { x: 36, y: 56 },
    P1: { x: 60, y: 66 },
    C1: { x: 84, y: 68 },
  },
  4: {
    P2: { x: 16, y: 13 },
    C2: { x: 50, y: 11 },
    L: { x: 50, y: 11 },
    A: { x: 80, y: 15 },
    P1: { x: 22, y: 66 },
    C1: { x: 52, y: 60 },
    O: { x: 86, y: 74 },
  },
  5: {
    P1: { x: 16, y: 13 },
    C2: { x: 50, y: 13 },
    L: { x: 50, y: 13 },
    A: { x: 82, y: 14 },
    C1: { x: 28, y: 62 },
    O: { x: 66, y: 64 },
    P2: { x: 86, y: 72 },
  },
  6: {
    P1: { x: 18, y: 13 },
    C1: { x: 50, y: 11 },
    A: { x: 80, y: 14 },
    O: { x: 30, y: 64 },
    P2: { x: 58, y: 68 },
    C2: { x: 84, y: 70 },
    L: { x: 84, y: 70 },
  },
};

const PHASE_ROLE_TABLE = {
  serve: SERVE_ROLE_XY,
  receive: RECEIVE_ROLE_XY,
  defense: DEFENSE_ROLE_XY,
};

function clampRot(rotation) {
  const r = Number(rotation) || 1;
  if (r < 1) return 1;
  if (r > 6) return ((r - 1) % 6) + 1;
  return r;
}

/** Позиция за играч: предпочита роля от графиката, иначе зона. */
export function playerCourtPosition({ role, zone, phase = "grid", rotation = 1 }) {
  if (phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(GRID_ZONE_XY[Number(zone)] || { x: 50, y: 50 }) };
  }
  const rot = clampRot(rotation);
  const table = PHASE_ROLE_TABLE[phase][rot] || PHASE_ROLE_TABLE[phase][1];
  const key = String(role || "").toUpperCase();
  if (key && table[key]) return { ...table[key] };
  if (key === "L" && table.C2) return { ...table.C2 };
  // без роля — през zone→role огледало
  return zonePosition({ zone, phase, rotation: rot });
}

const FORMATION_ZONE_ROLE = {
  serve: {
    1: { 4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "C2", 1: "A" },
    2: { 4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1" },
    3: { 4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1" },
    4: { 4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O" },
    5: { 4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2" },
    6: { 4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2" },
  },
  receive: {
    1: { 4: "O", 3: "C1", 2: "P1", 5: "P2", 6: "C2", 1: "A" },
    2: { 4: "C1", 3: "O", 2: "P1", 5: "C2", 6: "P2", 1: "A" },
    3: { 4: "O", 3: "P2", 2: "C2", 5: "P1", 6: "A", 1: "C1" },
    4: { 4: "C2", 3: "P2", 2: "O", 5: "C1", 6: "P1", 1: "A" },
    5: { 4: "C2", 3: "O", 2: "P1", 5: "A", 6: "P2", 1: "C1" },
    6: { 4: "O", 3: "P1", 2: "C1", 5: "P2", 6: "C2", 1: "A" },
  },
  defense: {
    1: { 4: "P1", 3: "C1", 2: "O", 5: "P2", 6: "A", 1: "C2" },
    2: { 4: "P2", 3: "C1", 2: "O", 5: "C2", 6: "A", 1: "P1" },
    3: { 4: "O", 3: "P2", 2: "C2", 5: "A", 6: "P1", 1: "C1" },
    4: { 4: "P2", 3: "C2", 2: "A", 5: "P1", 6: "C1", 1: "O" },
    5: { 4: "P1", 3: "C2", 2: "A", 5: "C1", 6: "O", 1: "P2" },
    6: { 4: "P1", 3: "C1", 2: "A", 5: "O", 6: "P2", 1: "C2" },
  },
};

export function zonePosition({ zone, phase = "grid", rotation = 1 }) {
  const z = Number(zone);
  if (phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(GRID_ZONE_XY[z] || { x: 50, y: 50 }) };
  }
  const rot = clampRot(rotation);
  const role = FORMATION_ZONE_ROLE[phase]?.[rot]?.[z];
  const table = PHASE_ROLE_TABLE[phase][rot] || PHASE_ROLE_TABLE[phase][1];
  if (role && table[role]) return { ...table[role] };
  if (role === "C2" && table.L) return { ...table.L };
  return { ...(BASE_ZONE_XY[z] || { x: 50, y: 50 }) };
}

export function allZonePositions({ phase = "grid", rotation = 1 }) {
  const out = {};
  for (const z of [1, 2, 3, 4, 5, 6]) {
    out[z] = zonePosition({ zone: z, phase, rotation });
  }
  return out;
}

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
