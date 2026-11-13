/** Помощни форматирания за Coach Dashboard (PC + Mobile). */

const BAD_DRILL_TITLES = new Set([
  "задайте свой собствен пропуск",
  "set your own pass",
  "set your own skip",
]);

function stripSettlementPrefix(s) {
  return String(s || "")
    .replace(/^(гр\.|град|с\.|село)\s+/i, "")
    .replace(/[„“"']/g, "")
    .trim();
}

function isStreetPart(part) {
  return /^(ул\.|улица|бул\.|булевард|пл\.|№|no\.?)/i.test(part);
}

function isHallPart(part) {
  const bare = stripSettlementPrefix(part);
  // Note: JS \\b is ASCII-only; use explicit separators for Cyrillic club prefixes.
  return (
    /зала|спорт|комплекс|арена|stadium|hall|плувен|басейн/i.test(bare) ||
    /^(ск|вс|вк|нса)(\s|\.|$)/i.test(bare)
  );
}

function isSettlementPart(part) {
  if (isStreetPart(part) || isHallPart(part)) return false;
  if (/^(гр\.|с\.)/i.test(part)) return true;
  const bare = stripSettlementPrefix(part);
  if (!bare || bare.length > 40) return false;
  if (/\d/.test(bare)) return false;
  return bare.split(/\s+/).length <= 3;
}

/**
 * Форматира зала/адрес. „гр.“ само пред населено място, никога пред зала.
 * „СК Георги Бенковски, Тетевен“ → „СК Георги Бенковски, гр. Тетевен“
 * „Троян, Троян, ул. Първомайска“ → „гр. Троян, ул. Първомайска“
 */
export function formatVenueLocation(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const out = [];
  const seenSettlements = new Set();

  for (const part of parts) {
    if (isHallPart(part) || isStreetPart(part)) {
      // Strip mistaken settlement prefix on halls (e.g. "гр. СК ...").
      out.push(
        isHallPart(part) && /^(гр\.|град|с\.|село)\s+/i.test(part)
          ? stripSettlementPrefix(part)
          : part,
      );
      continue;
    }

    if (isSettlementPart(part)) {
      const bare = stripSettlementPrefix(part);
      const key = bare.toLowerCase();
      if (!key || seenSettlements.has(key)) continue;
      seenSettlements.add(key);
      out.push(`гр. ${bare}`);
      continue;
    }

    out.push(part);
  }

  return out.join(", ");
}

/** Сортиране: дата → начален час → приоритет тимов лист. */
export function sortScheduleByDateTime(items, { rosterPriority = null } = {}) {
  const list = Array.isArray(items) ? [...items] : [];
  return list.sort((a, b) => {
    const d = String(a?.date || "").localeCompare(String(b?.date || ""));
    if (d !== 0) return d;
    const t = String(a?.start_time || "").localeCompare(String(b?.start_time || ""));
    if (t !== 0) return t;
    if (typeof rosterPriority === "function") {
      return rosterPriority(a) - rosterPriority(b);
    }
    return 0;
  });
}

/** Безопасно форматиране на дата/час (date-only не става 02:00). */
export function formatDashboardDateTime(value) {
  if (value == null || value === "") return "-";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("bg-BG");
}

export function sanitizeDrillTitle(title, fallbackId) {
  const t = String(title || "").trim();
  if (!t || BAD_DRILL_TITLES.has(t.toLowerCase())) {
    return fallbackId != null ? `Упражнение #${fallbackId}` : "Упражнение";
  }
  return t;
}

/** Известия за колоната „Последни известия“ - без празни и без roster/absence дубли. */
export function filterFeedNotifications(items) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item) return false;
    const kind = String(item.kind || "");
    if (kind === "absence" || kind === "roster_generate" || kind === "roster_review") return false;
    const text = String(item.text || "").trim();
    return Boolean(text);
  });
}
