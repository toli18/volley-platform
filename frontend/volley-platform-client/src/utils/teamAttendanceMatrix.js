import { API_PATHS } from "./apiPaths";

export function monthBounds(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay)}`,
    year: y,
    month: m,
    lastDay,
  };
}

function sessionLabel(date, title) {
  const day = String(date || "");
  const short = day.length >= 10 ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : day;
  const t = (title || "").trim();
  return t ? `${short} ${t}`.trim() : short;
}

/** Build matrix from per-day attendance (works when /attendance/matrix is not deployed). */
async function buildMatrixFromDailyAttendance(axiosInstance, teamId, monthKey) {
  const { from, to, year, month, lastDay } = monthBounds(monthKey);
  const pad = (n) => String(n).padStart(2, "0");

  const membersRes = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamId));
  const members = Array.isArray(membersRes.data?.members) ? membersRes.data.members : [];
  const athletes = members.map((m) => ({
    athlete_id: m.athlete_id,
    athlete_name: m.athlete_name,
  }));

  const sessions = [];
  const cells = [];
  const dates = [];
  for (let d = 1; d <= lastDay; d += 1) {
    dates.push(`${year}-${pad(month)}-${pad(d)}`);
  }

  const chunkSize = 6;
  for (let i = 0; i < dates.length; i += chunkSize) {
    const chunk = dates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((date) =>
        axiosInstance
          .get(API_PATHS.TEAM_ATTENDANCE_GET(teamId), { params: { date } })
          .then((res) => ({ date, data: res.data }))
          .catch(() => ({ date, data: null }))
      )
    );
    for (const { date, data } of results) {
      if (!data?.session_id) continue;
      const sessionId = data.session_id;
      sessions.push({
        session_id: sessionId,
        date,
        label: sessionLabel(date, data.title),
      });
      for (const item of data.items || []) {
        if (!item?.athlete_id || !item?.status) continue;
        cells.push({
          athlete_id: item.athlete_id,
          session_id: sessionId,
          status: item.status,
        });
      }
    }
  }

  sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.session_id - b.session_id);

  return {
    team_id: teamId,
    month: monthKey,
    from_date: from,
    to_date: to,
    athletes,
    sessions,
    cells,
    _fallback: true,
  };
}

/**
 * Loads monthly attendance matrix. Uses dedicated API when available;
 * otherwise builds from existing per-day attendance endpoints.
 */
export async function loadTeamAttendanceMatrix(axiosInstance, teamId, monthKey) {
  try {
    const res = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_MATRIX(teamId), {
      params: { month: monthKey },
    });
    return { matrix: res.data || null, usedFallback: false, error: null };
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 404 || (typeof detail === "string" && detail === "Not Found")) {
      try {
        const matrix = await buildMatrixFromDailyAttendance(axiosInstance, teamId, monthKey);
        return { matrix, usedFallback: true, error: null };
      } catch (fallbackErr) {
        const fbDetail = fallbackErr?.response?.data?.detail;
        return {
          matrix: null,
          usedFallback: false,
          error:
            typeof fbDetail === "string"
              ? fbDetail
              : "Неуспешно зареждане на присъствието. Опитай отново след обновяване на сървъра.",
        };
      }
    }
    const msg =
      typeof detail === "string"
        ? detail
        : status === 403
          ? "Нямаш достъп до този отбор."
          : "Грешка при зареждане на присъствието.";
    return { matrix: null, usedFallback: false, error: msg };
  }
}
