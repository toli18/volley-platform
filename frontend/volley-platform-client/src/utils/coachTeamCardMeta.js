/** Подзаглавие за карта с група (без дублиране на името в age_group). */
export function coachTeamCardMeta(team, fallback = "Отвори чата") {
  if (!team) return fallback;
  const nameNorm = String(team.name || "")
    .trim()
    .toLowerCase();
  const age = String(team.age_group || "").trim();
  const season = String(team.season || "").trim();
  const parts = [];
  if (age && age.toLowerCase() !== nameNorm) parts.push(age);
  if (season) parts.push(season);
  return parts.length ? parts.join(" · ") : fallback;
}