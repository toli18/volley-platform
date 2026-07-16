/** Match / Rotations module — shared constants (BG labels). */

export const MATCH_MAX_ROSTER = 14;

export const MATCH_POSITIONS = [
  { code: "S", short: "Р", label: "Разпределител", color: "#e11d48" },
  { code: "OH", short: "П", label: "Посрещач", color: "#16a34a" },
  { code: "MB", short: "Ц", label: "Централен блокировач", color: "#ea580c" },
  { code: "OPP", short: "Д", label: "Диагонал", color: "#dc2626" },
  { code: "L", short: "Л", label: "Либеро", color: "#7c3aed" },
];

export const MATCH_SYSTEMS = [
  { code: "5-1", label: "5-1", enabled: true },
  { code: "6-2", label: "6-2", enabled: false },
  { code: "4-2", label: "4-2", enabled: false },
];

export const MATCH_STATUS_LABEL = {
  draft: "Чернова",
  ready: "Готов състав",
  live: "В ход",
  finished: "Приключен",
  cancelled: "Отменен",
};

export function positionLabel(code) {
  const row = MATCH_POSITIONS.find((p) => p.code === code);
  return row ? `${row.short} · ${row.label}` : code || "—";
}

export function positionShort(code) {
  const row = MATCH_POSITIONS.find((p) => p.code === code);
  return row?.short || code || "—";
}

export function positionColor(code) {
  const row = MATCH_POSITIONS.find((p) => p.code === code);
  return row?.color || "#64748b";
}

export function shortPlayerName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return parts[0];
}
