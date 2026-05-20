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
import { useToast } from "../../components/ToastProvider";
import { Button, EmptyState, Input } from "../../components/ui";

const genderSuffix = (g) => {
  if (g === "male") return " · М";
  if (g === "female") return " · Ж";
  return "";
};

const normalizeError = (err, fallback = "Грешка.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

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
  const toast = useToast();
  const { user } = useAuth();
  const teamIdNum = Number(teamId);

  const section = searchParams.get("tab") || "overview";
  const setSection = (id) => setSearchParams({ tab: id }, { replace: true });

  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);
  const isTeamCoach = Number(team?.coach_id) === currentUserId;
  const canManage = isHeadCoach || isTeamCoach;
  const canManageRoster = canManage && (isHeadCoach || athletes.length > 0);

  const portalCoach = useTeamPortalCoach(canManage ? teamIdNum : null);

  const rosterFrom = `/coach/teams/${teamIdNum}?tab=roster`;

  const loadMembers = async () => {
    const membersRes = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamIdNum));
    const mem = Array.isArray(membersRes.data?.members) ? membersRes.data.members : [];
    setMembers(mem);
    setMemberIds(mem.map((m) => m.athlete_id));
  };

  useEffect(() => {
    const load = async () => {
      if (!teamIdNum) return;
      try {
        setLoadError("");
        const [teamsRes, athletesRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAMS_LIST),
          axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST),
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
        const athleteList = Array.isArray(athletesRes.data) ? athletesRes.data : [];
        setAthletes(isHeadCoach ? athleteList : athleteList.filter((a) => Number(a?.coach_id) === currentUserId));
        await loadMembers();
      } catch {
        setLoadError("Неуспешно зареждане.");
      }
    };
    load();
  }, [teamIdNum, isHeadCoach, currentUserId]);

  const nonMembers = useMemo(() => {
    const teamGender = team?.gender;
    return athletes.filter((a) => {
      if (memberIds.includes(a.id)) return false;
      if (teamGender === "male" || teamGender === "female") {
        return a?.gender === teamGender;
      }
      return true;
    });
  }, [athletes, memberIds, team?.gender]);

  const visibleCandidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return nonMembers;
    return nonMembers.filter((a) => {
      const haystack = [a?.athlete_name, a?.parent_name, a?.birth_year, a?.athlete_phone]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [nonMembers, memberSearch]);

  const saveMembers = async (ids) => {
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_MEMBERS_SET(teamIdNum), { athlete_ids: ids });
      await loadMembers();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на състава."));
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (athleteId) => {
    const next = [...new Set([...memberIds, athleteId])];
    await saveMembers(next);
    setMemberSearch("");
    setAddOpen(false);
    toast.success("Състезателят е добавен в отбора.");
  };

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
                <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/coach/teams/${teamIdNum}/attendance-month`)}>
                  Присъствие (месец)
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
                  <Link
                    to={`/coach/athletes/${m.athlete_id}?from=${encodeURIComponent(rosterFrom)}`}
                    className="coachMobileRosterRow"
                  >
                    <span>{m.athlete_name || m.name}</span>
                    <span className="coachMobileTeamChevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {canManageRoster ? (
            <Button type="button" style={{ marginTop: 12 }} onClick={() => setAddOpen(true)}>
              + Добави състезател
            </Button>
          ) : null}
          <Link to={`/teams/${teamIdNum}`} className="coachMobileMuted" style={{ marginTop: 10, display: "inline-block", fontSize: 13 }}>
            Пълен състав (десктоп)
          </Link>

          {addOpen && canManageRoster ? (
            <div className="uiModalOverlay" onClick={() => !busy && setAddOpen(false)} role="presentation">
              <section className="uiModal uiModal--compact" onClick={(e) => e.stopPropagation()} role="dialog">
                <h3 className="uiModalTitle">Добави състезател</h3>
                <Input
                  placeholder="Търси по име или година..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
                <ul className="coachMobileAddAthleteList">
                  {visibleCandidates.length === 0 ? (
                    <li className="coachMobileMuted">Няма свободни състезатели.</li>
                  ) : (
                    visibleCandidates.slice(0, 20).map((a) => (
                      <li key={a.id}>
                        <button type="button" className="coachMobileAddAthleteRow" disabled={busy} onClick={() => addMember(a.id)}>
                          <span>
                            {a.athlete_name}
                            {genderSuffix(a.gender)}
                          </span>
                          <span className="coachMobileMuted">{a.birth_year || ""}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="uiModalActions" style={{ marginTop: 10 }}>
                  <Button variant="secondary" disabled={busy} onClick={() => setAddOpen(false)}>
                    Затвори
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {!canManage && validSection !== "roster" ? (
        <p className="coachMobileMuted">Нямате права за тази секция.</p>
      ) : null}
    </div>
  );
}
