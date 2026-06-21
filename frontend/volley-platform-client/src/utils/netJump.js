/**
 * Чист отскок (net jump) — производен показател, важен за волейбола.
 *
 * Дефиниция (потвърдена с методиста): чист отскок = височина на отскока след
 * засилване (атака) минус разтега (standing reach), в сантиметри.
 *
 *   net = PHYS_JUMP_APPROACH − ANTH_REACH
 *
 * Изчислява се автоматично (не се въвежда ръчно и не се точкува отделно) и се
 * показва като справочна колона/ред в таблиците.
 */
export const NET_JUMP_APPROACH_CODE = "PHYS_JUMP_APPROACH";
export const NET_JUMP_REACH_CODE = "ANTH_REACH";

/** Парсва стойност (низ или число) към краен Number или null. */
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Връща чистия отскок (см) или null, ако липсва някоя от двете стойности.
 * @param {number|string} approach Отскок след засилване (см)
 * @param {number|string} reach Разтег (см)
 */
export function netJump(approach, reach) {
  const a = toNumber(approach);
  const r = toNumber(reach);
  if (a == null || r == null) return null;
  return Math.round((a - r) * 10) / 10;
}

/**
 * Удобен помощник: изчислява чист отскок от map { test_code: raw_value }.
 */
export function netJumpFromValues(byCode) {
  if (!byCode) return null;
  return netJump(byCode[NET_JUMP_APPROACH_CODE], byCode[NET_JUMP_REACH_CODE]);
}
