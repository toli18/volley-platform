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
  { code: "5-1", label: "5-1", enabled: true, hint: "1 разпределител · 1 диагонал · 2 посрещача · 2 центъра" },
  { code: "6-2", label: "6-2", enabled: true, hint: "2 разпределителя (задава задният) · винаги 3 предни атакуващи" },
  { code: "4-2", label: "4-2", enabled: true, hint: "2 разпределителя (задава предният, зона 2)" },
  { code: "6-3", label: "6-3", enabled: true, hint: "3 разпределителя, редуват се · 2 посрещача · 1 център" },
];

export const SYSTEM_LINEUP_HINT = {
  "5-1": "За 5-1 по гайда: 1=S(Р), 2=OH1(П), 3=MB2(Ц), 4=OPP(Д), 5=OH2(П), 6=MB1(Ц).",
  "6-2": "За 6-2: 1=S1(Р1 зад, задава), 2=OH1(П), 3=MB(Ц), 4=S2(Р2 пред, атакува), 5=OH2(П), 6=MB(Ц).",
  "4-2": "За 4-2: 2=S1(Р1 пред, задава), 5=S2(Р2 зад), 4=OH(П), 3=MB(Ц), 1=OH(П), 6=MB(Ц).",
  "6-3": "За 6-3: 1=S1, 2=OH, 3=S2, 4=OH, 5=S3, 6=MB — три разпределителя през една зона.",
};

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
