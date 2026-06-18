import { useEffect, useState } from "react";

import TeamPortalCoachChat from "../components/teamPortal/TeamPortalCoachChat";
import { EmptyState, PageHero } from "../components/ui";
import useCoachTeams from "../utils/useCoachTeams";

export default function CoachChat() {
  const { teams, loading, error } = useCoachTeams();
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (selectedId == null && teams.length > 0) {
      setSelectedId(Number(teams[0].id));
    }
  }, [teams, selectedId]);

  const selectedTeam = teams.find((t) => Number(t.id) === Number(selectedId)) || null;

  return (
    <div className="uiPage">
      <PageHero
        title="Чат"
        subtitle="Пишете на отборите си. Изберете отбор отляво, за да отворите чата."
      />

      {error ? <div className="uiAlert uiAlert--danger">{error}</div> : null}

      {loading ? (
        <p className="uiMuted">Зареждане...</p>
      ) : teams.length === 0 ? (
        <EmptyState
          title="Няма отбори"
          description="Все още нямате назначени отбори, с които да чатите."
        />
      ) : (
        <div className="coachChatLayout">
          <aside className="coachChatSidebar">
            <ul className="coachChatTeamList">
              {teams.map((team) => {
                const isActive = Number(team.id) === Number(selectedId);
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      className={`coachChatTeamItem${isActive ? " coachChatTeamItem--active" : ""}`}
                      onClick={() => setSelectedId(Number(team.id))}
                    >
                      <span className="coachChatTeamItemName">{team.name}</span>
                      <span className="coachChatTeamItemMeta">
                        {[team.age_group, team.season].filter(Boolean).join(" · ") || "Отвори чата"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <section className="coachChatMain">
            {selectedTeam ? (
              <TeamPortalCoachChat teamId={Number(selectedTeam.id)} teamName={selectedTeam.name} />
            ) : (
              <EmptyState title="Изберете отбор" description="Изберете отбор отляво, за да започнете чат." />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
