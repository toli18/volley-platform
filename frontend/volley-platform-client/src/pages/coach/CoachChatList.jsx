import { Link } from "react-router-dom";

import { EmptyState } from "../../components/ui";
import useCoachTeams from "../../utils/useCoachTeams";

export default function CoachChatList() {
  const { teams, loading, error } = useCoachTeams();

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (error) {
    return <EmptyState title="Грешка" description={error} />;
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        title="Няма отбори"
        description="Все още нямате назначени отбори, с които да чатите."
      />
    );
  }

  return (
    <>
      <h2 className="coachMobileSectionTitle">Чат</h2>
      <p className="coachMobileMuted" style={{ marginTop: -4 }}>
        Изберете отбор, за да отворите чата.
      </p>
      <ul className="coachMobileTeamList">
        {teams.map((team) => (
          <li key={team.id}>
            <Link to={`/coach/chat/${team.id}`} className="coachMobileTeamCard">
              <span className="coachMobileTeamName">{team.name}</span>
              <span className="coachMobileMuted">
                {[team.age_group, team.season].filter(Boolean).join(" · ") || "Отвори чата"}
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
