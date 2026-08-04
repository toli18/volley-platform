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

  return (
    <>
      <div className="coachChatListHead">
        <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Чат</h2>
        <Link
          to="/coach/chat/parents"
          className="coachChatParentMsgBtn"
          title="Съобщения към родителите — текст и снимка"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 5h16v11H7l-3 3V5z" strokeLinejoin="round" />
            <path d="M8 9h8M8 12h5" strokeLinecap="round" />
          </svg>
          <span>Към родители</span>
        </Link>
      </div>
      <p className="coachMobileMuted" style={{ marginTop: 4 }}>
        Изберете група за чат със състезателите.
      </p>

      {teams.length === 0 ? (
        <EmptyState
          title="Няма групи"
          description="Все още нямате назначени тренировъчни групи, с които да чатите."
        />
      ) : (
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
      )}
    </>
  );
}
