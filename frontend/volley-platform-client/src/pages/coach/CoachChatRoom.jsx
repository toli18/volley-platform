import { useParams } from "react-router-dom";

import TeamPortalCoachChat from "../../components/teamPortal/TeamPortalCoachChat";
import useCoachTeams from "../../utils/useCoachTeams";

export default function CoachChatRoom() {
  const { teamId } = useParams();
  const { teams } = useCoachTeams();
  const team = teams.find((t) => Number(t.id) === Number(teamId)) || null;

  return (
    <div className="coachChatRoomMobile">
      <TeamPortalCoachChat teamId={Number(teamId)} teamName={team?.name} />
    </div>
  );
}
