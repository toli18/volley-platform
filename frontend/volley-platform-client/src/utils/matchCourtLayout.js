/**
 * Координати по РОЛЯ — ROTACION SISTEMAS 5-1 (по-компактно поле, по-плътни стекове).
 * x/y %: мрежа y≈8–18 · attack ≈42 · задни посрещачи ≈52–68 · сервис ≈78–88
 *
 * Наша R ↔ испанска: R1→1, R2→6, R3→5, R4→4, R5→3, R6→2
 */

export const BASE_ZONE_XY = {
  4: { x: 18, y: 16 },
  3: { x: 50, y: 14 },
  2: { x: 82, y: 16 },
  5: { x: 18, y: 66 },
  6: { x: 50, y: 64 },
  1: { x: 82, y: 68 },
};

export const GRID_ZONE_XY = { ...BASE_ZONE_XY };

/** Легална предна линия по ротация (триъгълници на графиката). */
export const FRONT_ROLES_BY_ROT = {
  1: ["O", "C1", "P1"],
  2: ["P2", "O", "C1"],
  3: ["C2", "P2", "O"],
  4: ["A", "C2", "P2"],
  5: ["P1", "A", "C2"],
  6: ["C1", "P1", "A"],
};

function clampRot(rotation) {
  const r = Number(rotation) || 1;
  if (r < 1) return 1;
  if (r > 6) return ((r - 1) % 6) + 1;
  return r;
}

export function isFrontRole(role, rotation = 1) {
  const key = String(role || "").toUpperCase();
  if (!key || key === "L") return false;
  const front = FRONT_ROLES_BY_ROT[clampRot(rotation)] || [];
  return front.includes(key);
}

/** SAQUE — предните на мрежата, сервитьорът дълбоко дясно/зад. */
const SERVE_ROLE_XY = {
  1: {
    P1: { x: 15, y: 10 },
    C1: { x: 50, y: 8 },
    O: { x: 85, y: 10 },
    P2: { x: 20, y: 55 },
    C2: { x: 50, y: 58 },
    L: { x: 50, y: 58 },
    A: { x: 88, y: 84 },
  },
  2: {
    P2: { x: 15, y: 10 },
    C1: { x: 50, y: 8 },
    O: { x: 85, y: 10 },
    C2: { x: 24, y: 56 },
    L: { x: 24, y: 56 },
    A: { x: 55, y: 46 },
    P1: { x: 88, y: 80 },
  },
  3: {
    O: { x: 15, y: 10 },
    P2: { x: 48, y: 10 },
    C2: { x: 84, y: 10 },
    L: { x: 84, y: 10 },
    A: { x: 32, y: 50 },
    P1: { x: 56, y: 60 },
    C1: { x: 86, y: 78 },
  },
  4: {
    P2: { x: 15, y: 11 },
    C2: { x: 48, y: 9 },
    L: { x: 48, y: 9 },
    A: { x: 80, y: 12 },
    P1: { x: 22, y: 58 },
    C1: { x: 52, y: 54 },
    O: { x: 88, y: 82 },
  },
  5: {
    P1: { x: 15, y: 10 },
    C2: { x: 48, y: 10 },
    L: { x: 48, y: 10 },
    A: { x: 82, y: 12 },
    C1: { x: 28, y: 55 },
    O: { x: 64, y: 58 },
    P2: { x: 88, y: 80 },
  },
  6: {
    P1: { x: 16, y: 11 },
    C1: { x: 50, y: 9 },
    A: { x: 80, y: 12 },
    O: { x: 28, y: 58 },
    P2: { x: 56, y: 62 },
    C2: { x: 86, y: 78 },
    L: { x: 86, y: 78 },
  },
};

/**
 * RECEPCIÓN — плътни стекове (A почти до предния),
 * посрещачи в ясна W/линия, пунктирани зони на графиката.
 */
const RECEIVE_ROLE_XY = {
  1: {
    O: { x: 12, y: 9 },
    C1: { x: 38, y: 8 },
    P1: { x: 70, y: 11 },
    A: { x: 76, y: 22 },
    P2: { x: 26, y: 54 },
    C2: { x: 52, y: 60 },
    L: { x: 52, y: 60 },
  },
  2: {
    C1: { x: 16, y: 9 },
    O: { x: 42, y: 8 },
    P1: { x: 72, y: 12 },
    A: { x: 66, y: 24 },
    C2: { x: 24, y: 56 },
    L: { x: 24, y: 56 },
    P2: { x: 50, y: 62 },
  },
  3: {
    O: { x: 14, y: 9 },
    P2: { x: 46, y: 10 },
    C2: { x: 78, y: 10 },
    L: { x: 78, y: 10 },
    A: { x: 56, y: 24 },
    P1: { x: 26, y: 56 },
    C1: { x: 70, y: 60 },
  },
  4: {
    C2: { x: 18, y: 12 },
    L: { x: 18, y: 12 },
    P2: { x: 42, y: 10 },
    O: { x: 78, y: 10 },
    A: { x: 58, y: 28 },
    C1: { x: 26, y: 58 },
    P1: { x: 54, y: 62 },
  },
  5: {
    C2: { x: 14, y: 9 },
    L: { x: 14, y: 9 },
    O: { x: 40, y: 8 },
    P1: { x: 70, y: 11 },
    A: { x: 54, y: 26 },
    P2: { x: 28, y: 58 },
    C1: { x: 76, y: 56 },
  },
  6: {
    O: { x: 12, y: 9 },
    P1: { x: 44, y: 9 },
    C1: { x: 74, y: 10 },
    A: { x: 80, y: 22 },
    P2: { x: 26, y: 56 },
    C2: { x: 52, y: 62 },
    L: { x: 52, y: 62 },
  },
};

/** DEFENSA — предни на блок, задни в dig база. */
const DEFENSE_ROLE_XY = {
  1: {
    P1: { x: 13, y: 11 },
    C1: { x: 50, y: 9 },
    O: { x: 87, y: 11 },
    P2: { x: 18, y: 60 },
    A: { x: 50, y: 68 },
    C2: { x: 84, y: 60 },
    L: { x: 84, y: 60 },
  },
  2: {
    P2: { x: 13, y: 11 },
    C1: { x: 50, y: 9 },
    O: { x: 87, y: 11 },
    C2: { x: 22, y: 60 },
    L: { x: 22, y: 60 },
    A: { x: 52, y: 50 },
    P1: { x: 86, y: 68 },
  },
  3: {
    O: { x: 14, y: 11 },
    P2: { x: 48, y: 11 },
    C2: { x: 86, y: 10 },
    L: { x: 86, y: 10 },
    A: { x: 34, y: 52 },
    P1: { x: 58, y: 62 },
    C1: { x: 86, y: 68 },
  },
  4: {
    P2: { x: 14, y: 11 },
    C2: { x: 50, y: 9 },
    L: { x: 50, y: 9 },
    A: { x: 82, y: 12 },
    P1: { x: 20, y: 62 },
    C1: { x: 52, y: 56 },
    O: { x: 88, y: 76 },
  },
  5: {
    P1: { x: 14, y: 11 },
    C2: { x: 50, y: 11 },
    L: { x: 50, y: 11 },
    A: { x: 84, y: 12 },
    C1: { x: 26, y: 58 },
    O: { x: 64, y: 60 },
    P2: { x: 88, y: 74 },
  },
  6: {
    P1: { x: 16, y: 11 },
    C1: { x: 50, y: 9 },
    A: { x: 82, y: 12 },
    O: { x: 28, y: 60 },
    P2: { x: 56, y: 64 },
    C2: { x: 86, y: 70 },
    L: { x: 86, y: 70 },
  },
};

const PHASE_ROLE_TABLE = {
  serve: SERVE_ROLE_XY,
  receive: RECEIVE_ROLE_XY,
  defense: DEFENSE_ROLE_XY,
};

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

export function playerCourtPosition({ role, zone, phase = "grid", rotation = 1 }) {
  if (phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(GRID_ZONE_XY[Number(zone)] || { x: 50, y: 50 }) };
  }
  const rot = clampRot(rotation);
  const table = PHASE_ROLE_TABLE[phase][rot] || PHASE_ROLE_TABLE[phase][1];
  const key = String(role || "").toUpperCase();
  if (key && table[key]) return { ...table[key] };
  if (key === "L" && table.C2) return { ...table.C2 };
  return zonePosition({ zone, phase, rotation: rot });
}

export function zonePosition({ zone, phase = "grid", rotation = 1 }) {
  const z = Number(zone);
  if (phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(GRID_ZONE_XY[z] || { x: 50, y: 50 }) };
  }
  const rot = clampRot(rotation);
  const role = FORMATION_ZONE_ROLE[phase]?.[rot]?.[z];
  const table = PHASE_ROLE_TABLE[phase][rot] || PHASE_ROLE_TABLE[phase][1];
  if (role && table[role]) return { ...table[role] };
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
