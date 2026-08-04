import { Link } from "react-router-dom";

import { EmptyState } from "../../components/ui";
import useCoachTeams from "../../utils/useCoachTeams";

/** Избор на група за съобщения към родителите (новини / портал). */
export default function CoachParentNewsList() {
  const { teams, loading, error } = useCoachTeams();

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (error) {
    return <EmptyState title="Грешка" description={error} />;
  }

  return (
    <>
      <div className="coachChatListHead">
        <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Към родители</h2>
        <Link to="/coach/chat" className="coachMobileMuted" style={{ fontSize: 13, textDecoration: "none" }}>
          ← Чат
        </Link>
      </div>
      <p className="coachMobileMuted" style={{ marginTop: 4 }}>
        Изберете група, за да пишете на родителите (текст или снимка) и да изтривате публикации.
      </p>
      {teams.length === 0 ? (
        <EmptyState title="Няма групи" description="Няма тренировъчни групи за съобщения към родители." />
      ) : (
        <ul className="coachMobileTeamList">
          {teams.map((team) => (
            <li key={team.id}>
              <Link to={`/coach/chat/parents/${team.id}`} className="coachMobileTeamCard">
                <span className="coachMobileTeamName">{team.name}</span>
                <span className="coachMobileMuted">
                  {[team.age_group, team.season].filter(Boolean).join(" · ") || "Отвори"}
                </span>
                <span className="coachMobileTeamChevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
