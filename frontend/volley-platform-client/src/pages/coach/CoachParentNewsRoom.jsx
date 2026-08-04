import { Link, useParams } from "react-router-dom";

import {
  TeamPortalHeroActions,
  TeamPortalTextModal,
  useTeamPortalCoach,
} from "../../components/teamPortal/TeamPortalCoachPanel";
import TeamPortalCoachNews from "../../components/teamPortal/TeamPortalCoachNews";
import useCoachTeams from "../../utils/useCoachTeams";

/** Мобилен екран: публикации към родителите (текст / снимка / изтриване). */
export default function CoachParentNewsRoom() {
  const { teamId } = useParams();
  const teamIdNum = Number(teamId);
  const { teams } = useCoachTeams();
  const team = teams.find((t) => Number(t.id) === teamIdNum) || null;
  const portalCoach = useTeamPortalCoach(teamIdNum);

  return (
    <div className="coachParentNewsRoom">
      <div className="coachChatListHead">
        <div>
          <Link to="/coach/chat/parents" className="coachMobileMuted" style={{ fontSize: 13, textDecoration: "none" }}>
            ← Групи
          </Link>
          <h2 className="coachMobileSectionTitle" style={{ marginTop: 6 }}>
            {team?.name || "Към родители"}
          </h2>
        </div>
      </div>
      <p className="coachMobileMuted" style={{ marginTop: -4, marginBottom: 10 }}>
        Публикациите стигат до родителския портал. Можете да добавяте текст/снимка и да изтривате.
      </p>
      <TeamPortalHeroActions coach={portalCoach} />
      <TeamPortalCoachNews
        items={portalCoach.items}
        busy={portalCoach.busy}
        deleteItem={portalCoach.deleteItem}
      />
      <input
        ref={portalCoach.fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={portalCoach.onImageSelected}
      />
      <TeamPortalTextModal
        open={portalCoach.textOpen}
        busy={portalCoach.busy}
        textBody={portalCoach.textBody}
        setTextBody={portalCoach.setTextBody}
        postText={portalCoach.postText}
        setTextOpen={portalCoach.setTextOpen}
      />
    </div>
  );
}
