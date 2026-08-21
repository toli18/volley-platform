/** Server timestamps are stored as naive UTC (no Z). Parse them as UTC for local display. */
export function parseServerUtcDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) {
    return Number.isNaN(iso.getTime()) ? null : iso;
  }
  const s = String(iso).trim();
  if (!s) return null;
  // Already timezone-aware
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // "2026-08-20T18:37:00" or with fractional seconds → treat as UTC
  const withZ = s.includes("T") ? `${s}Z` : s;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatServerUtcDateTime(iso, options = {}) {
  const d = parseServerUtcDate(iso);
  if (!d) return "";
  return d.toLocaleString("bg-BG", options);
}
