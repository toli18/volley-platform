/** Правила за приоритет на тимов лист спрямо мача (синхрон с backend). */

export const ROSTER_GENERATE_WITHIN_DAYS = 10;
export const ROSTER_REVIEW_WITHIN_DAYS = 5;

export function daysUntilIso(dateIso, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!dateIso) return null;
  const a = new Date(`${todayIso}T12:00:00`);
  const b = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * generate — няма лист, ≤10 дни
 * review — има лист, ≤5 дни
 */
export function competitionRosterAction(item, todayIso) {
  if (!item || item.is_cancelled) return null;
  if (item.roster_action === "generate" || item.roster_action === "review") {
    return item.roster_action;
  }
  const days = item.days_until != null ? Number(item.days_until) : daysUntilIso(item.date, todayIso);
  if (days == null || days < 0) return null;
  const status = String(item.roster_status || (item.needs_roster ? "pending" : "")).toLowerCase();
  if ((status === "pending" || item.needs_roster) && days <= ROSTER_GENERATE_WITHIN_DAYS) {
    return "generate";
  }
  if ((status === "confirmed" || status === "locked") && days <= ROSTER_REVIEW_WITHIN_DAYS) {
    return "review";
  }
  return null;
}

export function competitionRosterPath(competitionId) {
  if (!competitionId) return "/coach/competitions";
  return `/coach/competitions?roster=${encodeURIComponent(competitionId)}`;
}

export function buildCompetitionRosterAlerts(scheduleItems, todayIso = new Date().toISOString().slice(0, 10)) {
  const alerts = [];
  for (const item of scheduleItems || []) {
    if (String(item.event_type || "").toLowerCase() !== "competition") continue;
    const action = competitionRosterAction(item, todayIso);
    if (!action || !item.competition_id) continue;
    const days = item.days_until != null ? Number(item.days_until) : daysUntilIso(item.date, todayIso);
    const when =
      days === 0 ? "днес" : days === 1 ? "утре" : days != null ? `след ${days} дни` : item.date;
    const label = item.competition_kind_label || "Състезание";
    const team = item.carded_team_label || item.team_name || "";
    if (action === "generate") {
      alerts.push({
        id: `roster-gen-${item.competition_id}`,
        kind: "roster_generate",
        tone: "danger",
        competition_id: item.competition_id,
        date: item.date,
        text: `Генерирай тимов лист: ${label}${team ? ` · ${team}` : ""} (${when})`,
        meta: item.location ? `${item.date} · ${item.location}` : item.date,
        to: competitionRosterPath(item.competition_id),
      });
    } else {
      const count = item.roster_count != null ? `${item.roster_count} в листа` : "състав готов";
      alerts.push({
        id: `roster-rev-${item.competition_id}`,
        kind: "roster_review",
        tone: "warn",
        competition_id: item.competition_id,
        date: item.date,
        text: `Провери тимовия лист: ${label}${team ? ` · ${team}` : ""} (${when})`,
        meta: `${count}${item.location ? ` · ${item.location}` : ""}`,
        to: competitionRosterPath(item.competition_id),
      });
    }
  }
  alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "roster_generate" ? -1 : 1;
    return String(a.date).localeCompare(String(b.date));
  });
  return alerts;
}
