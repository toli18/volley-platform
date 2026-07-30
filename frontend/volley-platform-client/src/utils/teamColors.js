/** Стабилен цвят по team_id — същата палитра като месечния график / dashboard. */
export const teamColorPalette = [
  { text: "#0c4a6e", border: "#7dd3fc", bg: "#e0f2fe" },
  { text: "#14532d", border: "#86efac", bg: "#dcfce7" },
  { text: "#78350f", border: "#fcd34d", bg: "#fef3c7" },
  { text: "#4c1d95", border: "#c4b5fd", bg: "#ede9fe" },
  { text: "#7f1d1d", border: "#fca5a5", bg: "#fee2e2" },
  { text: "#164e63", border: "#67e8f9", bg: "#cffafe" },
  { text: "#701a75", border: "#e879f9", bg: "#fae8ff" },
  { text: "#365314", border: "#bef264", bg: "#ecfccb" },
];

export function teamColorsForId(teamId) {
  const n = Number(teamId || 0);
  const idx = Math.abs(Number.isFinite(n) ? n : 0) % teamColorPalette.length;
  return teamColorPalette[idx];
}
