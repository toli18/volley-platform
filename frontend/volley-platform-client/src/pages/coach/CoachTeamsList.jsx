import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { EmptyState } from "../../components/ui";

export default function CoachTeamsList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  useEffect(() => {
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
        setTeams(list);
      } catch (err) {
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Неуспешно зареждане на отборите.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isHeadCoach, currentUserId]);

  const activeTeams = useMemo(() => teams, [teams]);

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (error) {
    return <EmptyState title="Грешка" description={error} />;
  }

  if (activeTeams.length === 0) {
    return (
      <EmptyState
        title="Няма отбори"
        description="Създайте отбор от десктоп версията или помолете главния треньор да ви назначи."
      />
    );
  }

  return (
    <>
      <h2 className="coachMobileSectionTitle">Отбори</h2>
      <ul className="coachMobileTeamList">
      {activeTeams.map((team) => (
        <li key={team.id}>
          <Link to={`/coach/teams/${team.id}`} className="coachMobileTeamCard">
            <span className="coachMobileTeamName">{team.name}</span>
            <span className="coachMobileMuted">
              {[team.age_group, team.season].filter(Boolean).join(" · ") || "Отвори отбора"}
            </span>
            <span className="coachMobileTeamChevron" aria-hidden>
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </>
  );
}
