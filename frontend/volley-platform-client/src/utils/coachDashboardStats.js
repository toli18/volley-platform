import { API_PATHS } from "./apiPaths";
import { loadTeamAttendanceMatrix, monthBounds } from "./teamAttendanceMatrix";

function shiftMonthKey(monthKey, delta) {
  const [y, m] = String(monthKey).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * За всеки отбор: последните N тренировки → present+late броене.
 * Обединява по athlete_id между отборите (запазва по-добрия резултат).
 */
export async function loadCoachAttendanceRegularity(axiosInstance, teams, { sessionLimit = 10 } = {}) {
  const activeTeams = (Array.isArray(teams) ? teams : []).filter((t) => t?.id && t.is_active !== false);
  if (!activeTeams.length) {
    return { top: [], bottom: [], sessionLimit, athletesCount: 0 };
  }

  const monthNow = currentMonthKey();
  const months = [shiftMonthKey(monthNow, -2), shiftMonthKey(monthNow, -1), monthNow];
  const byAthlete = new Map();

  await Promise.all(
    activeTeams.map(async (team) => {
      const teamId = Number(team.id);
      const sessionMap = new Map(); // session_id -> { date, session_id }
      const cellMap = new Map(); // `${athleteId}:${sessionId}` -> status
      const athleteNames = new Map();

      for (const month of months) {
        try {
          const { matrix } = await loadTeamAttendanceMatrix(axiosInstance, teamId, month);
          if (!matrix) continue;
          for (const a of matrix.athletes || []) {
            if (a?.athlete_id != null) athleteNames.set(Number(a.athlete_id), a.athlete_name || `Състезател #${a.athlete_id}`);
          }
          for (const s of matrix.sessions || []) {
            if (s?.session_id == null) continue;
            sessionMap.set(Number(s.session_id), {
              session_id: Number(s.session_id),
              date: String(s.date || ""),
            });
          }
          for (const c of matrix.cells || []) {
            if (c?.athlete_id == null || c?.session_id == null) continue;
            cellMap.set(`${Number(c.athlete_id)}:${Number(c.session_id)}`, String(c.status || "").toLowerCase());
          }
        } catch {
          /* един отбор може да няма данни */
        }
      }

      const lastSessions = Array.from(sessionMap.values())
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.session_id - a.session_id)
        .slice(0, sessionLimit);

      if (!lastSessions.length || !athleteNames.size) return;

      const total = lastSessions.length;
      for (const [athleteId, name] of athleteNames.entries()) {
        let attended = 0;
        for (const s of lastSessions) {
          const st = cellMap.get(`${athleteId}:${s.session_id}`);
          if (st === "present" || st === "late") attended += 1;
        }
        const next = {
          athlete_id: athleteId,
          athlete_name: name,
          attended,
          total,
          ratio: total ? attended / total : 0,
          label: `${attended}/${total}`,
        };
        const prev = byAthlete.get(athleteId);
        if (!prev || next.total > prev.total || (next.total === prev.total && next.ratio > prev.ratio)) {
          byAthlete.set(athleteId, next);
        }
      }
    }),
  );

  const ranked = Array.from(byAthlete.values())
    .filter((r) => r.total > 0)
    .sort((a, b) => b.ratio - a.ratio || b.attended - a.attended || String(a.athlete_name).localeCompare(String(b.athlete_name), "bg"));

  const top = ranked.slice(0, 3);
  // Bottom: най-ниска редовност; при еднакви — по-малко посещения.
  const bottom = [...ranked]
    .sort((a, b) => a.ratio - b.ratio || a.attended - b.attended || String(a.athlete_name).localeCompare(String(b.athlete_name), "bg"))
    .slice(0, 3);

  return {
    top,
    bottom,
    sessionLimit,
    athletesCount: ranked.length,
  };
}

/** Падеж = 10-о число на месеца на таксата (month_key YYYY-MM). */
export function feeDueDate(monthKey) {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 10);
}

export function feeDaysOverdue(monthKey, now = new Date()) {
  const due = feeDueDate(monthKey);
  if (!due) return 0;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = startOfToday.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86400000);
}

/**
 * От period report rows → три списъка:
 * - 10–29 дни след падеж (10-о число)
 * - 30+ дни
 * - над 2 неплатени такси (само месеци с изтекъл падеж)
 */
export function buildFeeOverdueLists(periodRows, { now = new Date() } = {}) {
  const late10 = [];
  const late30 = [];
  const overTwo = [];

  for (const row of Array.isArray(periodRows) ? periodRows : []) {
    const unpaidPastDue = [];
    for (const m of Array.isArray(row.months) ? row.months : []) {
      if (!m || m.paid) continue;
      const days = feeDaysOverdue(m.month_key, now);
      if (days <= 0) continue;
      unpaidPastDue.push({ month_key: m.month_key, days });
    }
    if (!unpaidPastDue.length) continue;

    unpaidPastDue.sort((a, b) => b.days - a.days);
    const maxDays = unpaidPastDue[0].days;
    const worstMonth = unpaidPastDue[0].month_key;

    const entry = {
      athlete_id: row.athlete_id,
      athlete_name: row.athlete_name || `Състезател #${row.athlete_id}`,
      unpaid_months: unpaidPastDue.length,
      days_overdue: maxDays,
      worst_month: worstMonth,
    };

    if (maxDays >= 30) late30.push(entry);
    else if (maxDays >= 10) late10.push(entry);

    if (unpaidPastDue.length > 2) overTwo.push(entry);
  }

  const byDaysDesc = (a, b) => b.days_overdue - a.days_overdue || String(a.athlete_name).localeCompare(String(b.athlete_name), "bg");
  const byUnpaidDesc = (a, b) => b.unpaid_months - a.unpaid_months || byDaysDesc(a, b);

  late10.sort(byDaysDesc);
  late30.sort(byDaysDesc);
  overTwo.sort(byUnpaidDesc);

  return { late10, late30, overTwo };
}

/** От кой месец да теглим period report (12 месеца назад). */
export function feesLookbackFromMonth(toMonth = currentMonthKey(), monthsBack = 11) {
  return shiftMonthKey(toMonth, -monthsBack);
}

// re-export for callers that already import month helpers
export { monthBounds, currentMonthKey, shiftMonthKey };
