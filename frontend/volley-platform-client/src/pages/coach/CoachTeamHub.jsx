import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import TeamPortalCoachChat from "../../components/teamPortal/TeamPortalCoachChat";
import TeamPortalCoachNews from "../../components/teamPortal/TeamPortalCoachNews";
import {
  TeamPortalHeroActions,
  TeamPortalTextModal,
  useTeamPortalCoach,
} from "../../components/teamPortal/TeamPortalCoachPanel";
import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { teamRoomLoginPath } from "../../utils/teamRoomAuth";
import { Button, EmptyState } from "../../components/ui";

const SECTIONS = [
  { id: "overview", label: "Преглед" },
  { id: "news", label: "Новини" },
  { id: "chat", label: "Чат" },
  { id: "roster", label: "Състав" },
];

export default function CoachTeamHub() {
  const { teamId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const teamIdNum = Number(teamId);

  const section = searchParams.get("tab") || "overview";
  const setSection = (id) => setSearchParams({ tab: id }, { replace: true });

  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);
  const isTeamCoach = Number(team?.coach_id) === currentUserId;
  const canManage = isHeadCoach || isTeamCoach;

  const portalCoach = useTeamPortalCoach(canManage ? teamIdNum : null);

  useEffect(() => {
    const load = async () => {
      if (!teamIdNum) return;
      try {
        setLoadError("");
        const [teamsRes, membersRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAMS_LIST),
          axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamIdNum)),
        ]);
        let list = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        if (!isHeadCoach) {
          list = list.filter((t) => Number(t?.coach_id) === currentUserId);
        }
        const found = list.find((t) => t.id === teamIdNum) || null;
        setTeam(found);
        if (!found) {
          setLoadError("Отборът не е намерен или нямате достъп.");
          return;
        }
        const mem = Array.isArray(membersRes.data?.members) ? membersRes.data.members : [];
        setMembers(mem);
      } catch {
        setLoadError("Неуспешно зареждане.");
      }
    };
    load();
  }, [teamIdNum, isHeadCoach, currentUserId]);

  const validSection = useMemo(() => SECTIONS.some((s) => s.id === section) ? section : "overview", [section]);

  if (loadError) {
    return <EmptyState title="Отбор" description={loadError} />;
  }

  if (!team) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  return (
    <div className="coachMobilePage coachMobilePage--hub">
      <h2 className="coachMobileHubTeamName">{team.name}</h2>

      <nav className="coachMobileSubNav" aria-label="Секции на отбора">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`coachMobileSubNavBtn${validSection === s.id ? " is-active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {validSection === "overview" ? (
        <section className="coachMobileHubSection">
          <p className="coachMobileMuted" style={{ marginTop: 0 }}>
            Състезатели: <Link to={teamRoomLoginPath()}>/room/login</Link>
          </p>
          {canManage ? (
            <>
              <TeamPortalHeroActions coach={portalCoach} />
              <div className="coachMobileHubLinks">
                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/teams/${teamIdNum}/attendance`)}>
                  Присъствие
                </Button>
                <Link to={`/teams/${teamIdNum}`} className="coachMobileQuickBtn" style={{ display: "inline-flex", alignItems: "center" }}>
                  Пълен профил (десктоп)
                </Link>
              </div>
            </>
          ) : (
            <p className="coachMobileMuted">Нямате права за публикуване към този отбор.</p>
          )}
        </section>
      ) : null}

      {validSection === "news" && canManage ? (
        <section className="coachMobileHubSection">
          <TeamPortalHeroActions coach={portalCoach} />
          <TeamPortalCoachNews items={portalCoach.items} busy={portalCoach.busy} deleteItem={portalCoach.deleteItem} />
          <input
            ref={portalCoach.fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={portalCoach.onImageSelected}
          />
          {portalCoach.textOpen ? (
            <TeamPortalTextModal
              busy={portalCoach.busy}
              textBody={portalCoach.textBody}
              setTextBody={portalCoach.setTextBody}
              postText={portalCoach.postText}
              setTextOpen={portalCoach.setTextOpen}
            />
          ) : null}
        </section>
      ) : null}

      {validSection === "chat" && canManage ? (
        <section className="coachMobileHubSection coachMobileHubSection--chat">
          <TeamPortalCoachChat teamId={teamIdNum} />
        </section>
      ) : null}

      {validSection === "roster" ? (
        <section className="coachMobileHubSection">
          {members.length === 0 ? (
            <EmptyState title="Празен състав" description="Добавете състезатели от пълния профил на отбора." />
          ) : (
            <ul className="coachMobileRosterList">
              {members.map((m) => (
                <li key={m.athlete_id}>
                  <Link to={`/teams/athletes/${m.athlete_id}`} className="coachMobileRosterRow">
                    <span>{m.athlete_name || m.name}</span>
                    <span className="coachMobileTeamChevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/teams/${teamIdNum}`} className="coachMobileQuickBtn" style={{ marginTop: 12, display: "inline-flex" }}>
            Управление на състав (десктоп)
          </Link>
        </section>
      ) : null}

      {!canManage && validSection !== "roster" ? (
        <p className="coachMobileMuted">Нямате права за тази секция.</p>
      ) : null}
    </div>
  );
}
