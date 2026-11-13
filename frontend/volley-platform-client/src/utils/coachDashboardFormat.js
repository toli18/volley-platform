/** Помощни форматирания за Coach Dashboard (PC + Mobile). */

const BAD_DRILL_TITLES = new Set([
  "задайте свой собствен пропуск",
  "set your own pass",
  "set your own skip",
]);

/**
 * Премахва повторения на града в адрес/зала.
 * „Троян, Троян, ул. Първомайска“ → „гр. Троян, ул. Първомайска“
 */
export function formatVenueLocation(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return text;

  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/^(гр\.|град|с\.|село)\s+/i, "")
      .replace(/[„“"']/g, "")
      .trim();

  const out = [];
  const seenCities = new Set();
  for (const part of parts) {
    const n = norm(part);
    const looksLikeStreet = /^(ул\.|улица|бул\.|булевард|пл\.|№|no\.?)/i.test(part);
    const looksLikeHall = /зала|ск\b|спорт/i.test(part);
    if (!looksLikeStreet && !looksLikeHall && seenCities.has(n)) continue;
    if (!looksLikeStreet && !looksLikeHall && n) seenCities.add(n);

    if (out.length === 0 && !looksLikeStreet && !looksLikeHall && !/^(гр\.|с\.)/i.test(part)) {
      out.push(`гр. ${part.replace(/^(град)\s+/i, "")}`);
    } else {
      out.push(part);
    }
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
  if (value == null || value === "") return "—";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("bg-BG");
}

export function sanitizeDrillTitle(title, fallbackId) {
  const t = String(title || "").trim();
  if (!t || BAD_DRILL_TITLES.has(t.toLowerCase())) {
    return fallbackId != null ? `Упражнение #${fallbackId}` : "Упражнение";
  }
  return t;
}

/** Известия за колоната „Последни известия“ — без празни и без roster/absence дубли. */
export function filterFeedNotifications(items) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item) return false;
    const kind = String(item.kind || "");
    if (kind === "absence" || kind === "roster_generate" || kind === "roster_review") return false;
    const text = String(item.text || "").trim();
    return Boolean(text);
  });
}
