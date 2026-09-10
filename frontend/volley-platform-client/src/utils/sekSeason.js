/** СЕК Year = отваряща година на сезона: 2025 → сезон 2025/2026. */

export function sekSeasonLabel(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return "—";
  return `${y}/${y + 1}`;
}

/**
 * Подразбиране като в backend default_sek_season_year:
 * преди август — предишен сезон; от август — текущата календарна година като Year.
 */
export function defaultSekSeasonYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 8 ? y : y - 1;
}

export function formatSekYearField(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return "";
  return `${y} (${sekSeasonLabel(y)})`;
}

/**
 * Известни стартови дати за картотекиране по СЕК Year (от db.bvf.bg tooltip).
 * Ключ = Year (отваряща година).
 */
export const SEK_CARDING_START_BY_YEAR = {
  2026: "2026-09-15",
};

function parseIsoDateLocal(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** @returns {{ open: boolean, startIso: string|null, startLabel: string|null, message: string|null }} */
export function sekCardingWindowForYear(year, now = new Date()) {
  const y = Number(year);
  const startIso = SEK_CARDING_START_BY_YEAR[y] || null;
  if (!startIso) {
    return { open: true, startIso: null, startLabel: null, message: null };
  }
  const start = parseIsoDateLocal(startIso);
  if (!start) {
    return { open: true, startIso, startLabel: null, message: null };
  }
  const startLabel = `${String(start.getDate()).padStart(2, "0")}.${String(start.getMonth() + 1).padStart(2, "0")}.${start.getFullYear()}`;
  const open = startOfToday(now) >= start;
  if (open) {
    return { open: true, startIso, startLabel, message: null };
  }
  return {
    open: false,
    startIso,
    startLabel,
    message:
      `Картотекирането за сезон ${sekSeasonLabel(y)} (Year=${y}) започва на ${startLabel} г. ` +
      `Дотогава съставът остава само локално — можеш да го пълниш, но „Запиши в СЕК“ ще е активен след тази дата.`,
  };
}
