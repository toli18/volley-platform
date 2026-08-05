/**
 * FIVB positional fault checks at contact (serve / serve-receive).
 * Court coords: x left→right %, y net(top)→endline(bottom) %.
 * Adjacent pairs only (7 checks).
 */

const PAIRS_LR = [
  [4, 3],
  [3, 2],
  [5, 6],
  [6, 1],
];

const PAIRS_FB = [
  [4, 5],
  [3, 6],
  [2, 1],
];

/** Margin (pct) — under this is "tight but legal". */
const TIGHT = 2.5;

function hasPos(map, z) {
  const p = map?.[z];
  return p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * @param {Record<number, {x:number,y:number}>} positionsByZone
 * @returns {{ legal: boolean, tight: boolean, faults: Array<{a:number,b:number,kind:string,gap:number}>, warnings: Array<{a:number,b:number,kind:string,gap:number}> }}
 */
export function checkFormationAlignment(positionsByZone) {
  const faults = [];
  const warnings = [];

  for (const [left, right] of PAIRS_LR) {
    if (!hasPos(positionsByZone, left) || !hasPos(positionsByZone, right)) continue;
    const a = positionsByZone[left];
    const b = positionsByZone[right];
    const gap = b.x - a.x;
    if (gap < 0) {
      faults.push({ a: left, b: right, kind: "lr", gap });
    } else if (gap < TIGHT) {
      warnings.push({ a: left, b: right, kind: "lr", gap });
    }
  }

  for (const [front, back] of PAIRS_FB) {
    if (!hasPos(positionsByZone, front) || !hasPos(positionsByZone, back)) continue;
    const a = positionsByZone[front];
    const b = positionsByZone[back];
    // Front must be closer to net → smaller y
    const gap = b.y - a.y;
    if (gap < 0) {
      faults.push({ a: front, b: back, kind: "fb", gap });
    } else if (gap < TIGHT) {
      warnings.push({ a: front, b: back, kind: "fb", gap });
    }
  }

  return {
    legal: faults.length === 0,
    tight: faults.length === 0 && warnings.length > 0,
    faults,
    warnings,
  };
}

export function alignmentStatusBg(result) {
  if (!result) return { tone: "ok", text: "—" };
  if (!result.legal) {
    return {
      tone: "bad",
      text: `Нелегална подредба (${result.faults.length})`,
    };
  }
  if (result.tight) {
    return { tone: "warn", text: "Легална, но стегната" };
  }
  return { tone: "ok", text: "Легална формация" };
}

export function clampCourtPct(x, y) {
  return {
    x: Math.min(94, Math.max(6, Number(x) || 50)),
    y: Math.min(72, Math.max(5, Number(y) || 50)),
  };
}
