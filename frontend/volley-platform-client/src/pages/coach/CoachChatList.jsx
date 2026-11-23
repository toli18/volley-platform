import { Link } from "react-router-dom";

import CoachChatModeTabs from "../../components/coachMobile/CoachChatModeTabs";
import { EmptyState } from "../../components/ui";
import { coachTeamCardMeta } from "../../utils/coachTeamCardMeta";
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
      <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Чат</h2>
      <CoachChatModeTabs />
      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Изберете група за чат със състезателите.
      </p>

      {teams.length === 0 ? (
        <EmptyState
          title="Няма групи"
          description="Все още нямате назначени тренировъчни групи, с които да чатите."
        />
      ) : (
        <ul className="coachMobileTeamList coachChatTeamList">
          {teams.map((team) => (
            <li key={team.id}>
              <Link to={`/coach/chat/${team.id}`} className="coachMobileTeamCard">
                <span className="coachMobileTeamName">{team.name}</span>
                <span className="coachMobileMuted">{coachTeamCardMeta(team)}</span>
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