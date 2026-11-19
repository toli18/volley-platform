import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { monthBounds } from "../../utils/teamAttendanceMatrix";
import { EmptyState } from "../../components/ui";

function monthKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTeamSummary(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const athletes = rows.length;
  const sessions = Number(report?.sessions_count || 0);
  const withData = rows.filter((r) => Number(r?.total || 0) > 0);
  const avg =
    withData.length > 0
      ? Math.round(
          withData.reduce((sum, r) => sum + Number(r.attendance_rate_percent || 0), 0) / withData.length,
        )
      : null;

  if (athletes && avg != null) {
    return `${athletes} състезатели · ${avg}% присъствие`;
  }
  if (athletes && sessions) {
    return `${athletes} състезатели · ${sessions} сесии`;
  }
  if (athletes) {
    return `${athletes} състезатели · няма сесии този месец`;
  }
  if (sessions) {
    return `${sessions} сесии този месец`;
  }
  return "Няма записи за месеца";
}

export default function CoachAttendanceTeams() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [error, setError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);
  const monthKey = useMemo(() => monthKeyNow(), []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
        let list = Array.isArray(res.data) ? res.data : [];
        if (!isHeadCoach) {
          list = list.filter((t) => Number(t?.coach_id) === currentUserId);
        }
        list = list.filter((t) => t.is_active !== false);
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));
        if (!alive) return;
        setTeams(list);
        setLoading(false);

        const { from, to } = monthBounds(monthKey);
        const pairs = await Promise.all(
          list.map(async (team) => {
            try {
              const reportRes = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_REPORT(team.id), {
                params: { from_date: from, to_date: to },
              });
              return [team.id, formatTeamSummary(reportRes.data)];
            } catch {
              return [team.id, "Месечен преглед на присъствие"];
            }
          }),
        );
        if (!alive) return;
        setSummaries(Object.fromEntries(pairs));
      } catch (err) {
        const detail = err?.response?.data?.detail;
        if (alive) {
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на отборите.");
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [isHeadCoach, currentUserId, monthKey]);

  const activeTeams = useMemo(() => teams, [teams]);

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;
  if (activeTeams.length === 0) {
    return (
      <EmptyState
        title="Няма отбори"
        description="Няма активни отбори за преглед на присъствие."
      />
    );
  }

  return (
    <div className="coachMobilePage">
      <h2 className="coachMobileSectionTitle">Присъствие по отбори</h2>
      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Избери отбор — виждаш месечна таблица: тренировки × състезатели. Натисни клетка за редакция на деня.
      </p>
      <ul className="coachMobileTeamList">
        {activeTeams.map((team) => (
          <li key={team.id}>
            <Link
              to={`/coach/teams/${team.id}/attendance-month`}
              className="coachMobileTeamCard coachMobileTeamCard--row"
            >
              <span className="coachMobileTeamCardMain">
                <span className="coachMobileTeamName">{team.name}</span>
                <span className="coachMobileMuted">
                  {summaries[team.id] || "Зареждане на обобщение…"}
                </span>
              </span>
              <span className="coachMobileTeamChevron" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/coach/teams" className="coachMobileQuickBtn" style={{ marginTop: 12, display: "inline-flex" }}>
        Управление на отбори
      </Link>
    </div>
  );
}
