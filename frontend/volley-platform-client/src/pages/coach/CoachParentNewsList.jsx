import { Link } from "react-router-dom";

import CoachChatModeTabs from "../../components/coachMobile/CoachChatModeTabs";
import { EmptyState } from "../../components/ui";
import { coachTeamCardMeta } from "../../utils/coachTeamCardMeta";
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
      <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Чат</h2>
      <CoachChatModeTabs />
      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Изберете група, за да пишете на родителите (текст или снимка) и да изтривате публикации.
      </p>
      {teams.length === 0 ? (
        <EmptyState title="Няма групи" description="Няма тренировъчни групи за съобщения към родители." />
      ) : (
        <ul className="coachMobileTeamList coachChatTeamList">
          {teams.map((team) => (
            <li key={team.id}>
              <Link to={`/coach/chat/parents/${team.id}`} className="coachMobileTeamCard">
                <span className="coachMobileTeamName">{team.name}</span>
                <span className="coachMobileMuted">{coachTeamCardMeta(team, "Отвори")}</span>
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