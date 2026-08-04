/**
 * Координати 5-1 — фази Base / Serve / Serve-Receive.
 * x/y % · мрежа горе · attack line ≈ 38
 *
 * Роли: A=S, O=OP, P1=OH1, P2=OH2, C1=MB2, C2=MB1, L
 */

export const BASE_ZONE_XY = {
  4: { x: 18, y: 16 },
  3: { x: 50, y: 14 },
  2: { x: 82, y: 16 },
  5: { x: 18, y: 62 },
  6: { x: 50, y: 60 },
  1: { x: 82, y: 64 },
};

export const GRID_ZONE_XY = { ...BASE_ZONE_XY };

export const ROLE_LABEL_BG = {
  A: "Р",
  O: "Д",
  P1: "П1",
  P2: "П2",
  C1: "Ц2",
  C2: "Ц1",
  S1: "Р1",
  S2: "Р2",
  S3: "Р3",
  L: "Л",
};

/** PDF / EN етикети */
export const ROLE_LABEL_PDF = {
  A: "S",
  O: "OP",
  P1: "OH1",
  P2: "OH2",
  C1: "MB2",
  C2: "MB1",
  S1: "S1",
  S2: "S2",
  S3: "S3",
  L: "L",
};

/** Легална предна линия (триъгълник). */
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
  return (FRONT_ROLES_BY_ROT[clampRot(rotation)] || []).includes(key);
}

export function roleChipLabel(role) {
  const key = String(role || "").toUpperCase();
  return ROLE_LABEL_BG[key] || ROLE_LABEL_PDF[key] || key || "";
}

/** circle | triangle | square | star — по позиция, не по предна/задна линия */
export function roleChipShape(role, _rotation = 1) {
  const key = String(role || "").toUpperCase();
  if (key === "L") return "star";
  if (key === "C1" || key === "C2") return "square"; // център
  if (key === "P1" || key === "P2") return "triangle"; // посрещач
  if (key === "A" || key === "O" || key === "S1" || key === "S2" || key === "S3") return "circle";
  return "circle";
}

/** Fallback когато няма роля — по код на позиция */
export function positionChipShape(position) {
  const key = String(position || "").toUpperCase();
  if (key === "L") return "star";
  if (key === "MB") return "square";
  if (key === "OH") return "triangle";
  if (key === "S" || key === "OPP") return "circle";
  return "circle";
}

/**
 * SERVE — PDF «Rotation N – Serve»
 * Стек при сервис; S често долу вдясно (serving).
 */
const SERVE_ROLE_XY = {
  1: {
    O: { x: 44, y: 24 },
    C1: { x: 54, y: 12 },
    P1: { x: 62, y: 34 },
    P2: { x: 16, y: 54 },
    C2: { x: 52, y: 82 },
    L: { x: 52, y: 82 },
    A: { x: 90, y: 88 },
  },
  2: {
    P2: { x: 18, y: 22 },
    O: { x: 46, y: 24 },
    C1: { x: 54, y: 12 },
    C2: { x: 52, y: 80 },
    L: { x: 52, y: 80 },
    A: { x: 78, y: 48 },
    P1: { x: 90, y: 88 },
  },
  3: {
    C2: { x: 42, y: 14 },
    L: { x: 90, y: 88 },
    P2: { x: 52, y: 22 },
    O: { x: 78, y: 20 },
    A: { x: 46, y: 52 },
    P1: { x: 52, y: 68 },
    C1: { x: 88, y: 78 },
  },
  4: {
    A: { x: 48, y: 28 },
    C2: { x: 52, y: 14 },
    L: { x: 52, y: 78 },
    P2: { x: 58, y: 36 },
    P1: { x: 18, y: 52 },
    C1: { x: 52, y: 58 },
    O: { x: 90, y: 88 },
  },
  5: {
    P1: { x: 18, y: 22 },
    A: { x: 48, y: 30 },
    C2: { x: 54, y: 14 },
    L: { x: 52, y: 76 },
    C1: { x: 52, y: 56 },
    O: { x: 76, y: 48 },
    P2: { x: 90, y: 88 },
  },
  6: {
    C1: { x: 54, y: 14 },
    P1: { x: 56, y: 32 },
    A: { x: 78, y: 14 },
    O: { x: 44, y: 52 },
    P2: { x: 52, y: 68 },
    C2: { x: 90, y: 88 },
    L: { x: 90, y: 88 },
  },
};

/**
 * RECEIVE — PDF «Serve Receive»
 * Посрещачи в линия; S скрит зад OH; OP/MB на мрежата.
 */
const RECEIVE_ROLE_XY = {
  1: {
    O: { x: 22, y: 20 },
    C1: { x: 50, y: 18 },
    P1: { x: 72, y: 54 },
    A: { x: 84, y: 72 },
    P2: { x: 22, y: 54 },
    C2: { x: 50, y: 56 },
    L: { x: 50, y: 56 },
  },
  2: {
    P2: { x: 22, y: 48 },
    O: { x: 72, y: 14 },
    C1: { x: 86, y: 34 },
    A: { x: 68, y: 24 },
    C2: { x: 50, y: 56 },
    L: { x: 50, y: 56 },
    P1: { x: 76, y: 56 },
  },
  3: {
    C2: { x: 20, y: 20 },
    L: { x: 52, y: 56 },
    P2: { x: 28, y: 52 },
    O: { x: 82, y: 18 },
    A: { x: 40, y: 36 },
    P1: { x: 58, y: 56 },
    C1: { x: 82, y: 72 },
  },
  4: {
    A: { x: 16, y: 14 },
    C2: { x: 22, y: 26 },
    L: { x: 42, y: 56 },
    P2: { x: 58, y: 56 },
    P1: { x: 30, y: 56 },
    C1: { x: 50, y: 40 },
    O: { x: 86, y: 78 },
  },
  5: {
    P1: { x: 20, y: 48 },
    A: { x: 62, y: 14 },
    C2: { x: 78, y: 20 },
    L: { x: 52, y: 76 },
    C1: { x: 50, y: 50 },
    O: { x: 58, y: 82 },
    P2: { x: 76, y: 56 },
  },
  6: {
    C1: { x: 20, y: 18 },
    P1: { x: 26, y: 52 },
    A: { x: 68, y: 14 },
    O: { x: 34, y: 80 },
    P2: { x: 50, y: 56 },
    C2: { x: 76, y: 56 },
    L: { x: 76, y: 56 },
  },
};

/** База: роля в центъра на легалната зона. */
function buildBaseRoleXy(zoneRoleByRot) {
  const out = {};
  for (const [rot, zones] of Object.entries(zoneRoleByRot)) {
    const row = {};
    for (const [zone, role] of Object.entries(zones)) {
      const xy = BASE_ZONE_XY[Number(zone)] || { x: 50, y: 50 };
      row[role] = { ...xy };
      // L заема мястото на C в задна зона при визуализация
      if (role === "C2" || role === "C1") {
        if ([1, 5, 6].includes(Number(zone))) row.L = { ...xy };
      }
    }
    out[rot] = row;
  }
  return out;
}

const ZONE_ROLE_BASE = {
  1: { 4: "O", 3: "C1", 2: "P1", 5: "P2", 6: "C2", 1: "A" },
  2: { 4: "P2", 3: "O", 2: "C1", 5: "C2", 6: "A", 1: "P1" },
  3: { 4: "C2", 3: "P2", 2: "O", 5: "A", 6: "P1", 1: "C1" },
  4: { 4: "A", 3: "C2", 2: "P2", 5: "P1", 6: "C1", 1: "O" },
  5: { 4: "P1", 3: "A", 2: "C2", 5: "C1", 6: "O", 1: "P2" },
  6: { 4: "C1", 3: "P1", 2: "A", 5: "O", 6: "P2", 1: "C2" },
};

const BASE_ROLE_XY = buildBaseRoleXy(ZONE_ROLE_BASE);

const PHASE_ROLE_TABLE = {
  base: BASE_ROLE_XY,
  serve: SERVE_ROLE_XY,
  receive: RECEIVE_ROLE_XY,
};

/** Зона → роля (огледало на backend formation). */
const FORMATION_ZONE_ROLE = {
  base: ZONE_ROLE_BASE,
  serve: ZONE_ROLE_BASE,
  receive: ZONE_ROLE_BASE,
};

export function playerCourtPosition({ role, zone, phase = "grid", rotation = 1, system = "5-1" }) {
  const sys = String(system || "5-1");
  // Custom role XY stacks are authored for 5-1; other systems use legal zone centers.
  if (sys !== "5-1" || phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(BASE_ZONE_XY[Number(zone)] || GRID_ZONE_XY[Number(zone)] || { x: 50, y: 50 }) };
  }
  const rot = clampRot(rotation);
  const table = PHASE_ROLE_TABLE[phase][rot] || PHASE_ROLE_TABLE[phase][1];
  const key = String(role || "").toUpperCase();
  if (key && table[key]) return { ...table[key] };
  if (key === "L" && table.C2) return { ...table.C2 };
  return zonePosition({ zone, phase, rotation: rot, system: sys });
}

export function zonePosition({ zone, phase = "grid", rotation = 1, system = "5-1" }) {
  const z = Number(zone);
  const sys = String(system || "5-1");
  if (sys !== "5-1" || phase === "grid" || !PHASE_ROLE_TABLE[phase]) {
    return { ...(BASE_ZONE_XY[z] || { x: 50, y: 50 }) };
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
