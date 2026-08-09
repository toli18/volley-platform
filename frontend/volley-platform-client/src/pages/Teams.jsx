import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import useIsCoachMobileShell from "../hooks/useIsCoachMobileShell";
import CoachSpeedFab from "../components/coachMobile/CoachSpeedFab";
import { CoachHubPage, MenuGroup } from "../components/coachMobile/CoachMenuParts";
import { NavIcon } from "../navigation/navIcons";
import { Button, EmptyState, Input, Modal } from "../components/ui";

const teamGenderLabel = (gender) => {
  if (gender === "male") return "Мъжки";
  if (gender === "female") return "Женски";
  return "—";
};

function teamHint(team, { isHeadCoach }) {
  const parts = [
    team.coach_name || "Без треньор",
    team.age_group || null,
    teamGenderLabel(team.gender),
    team.season || null,
    team.is_active === false ? "Неактивна" : null,
  ];
  if (isHeadCoach) {
    parts.push(team.public_enrollment_open ? "Отворена за набиране" : "Затворена за набиране");
  }
  return parts.filter(Boolean).join(" · ");
}

export default function Teams() {
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const isCoachShell = location.pathname.startsWith("/coach/teams");
  const isMobileCoachShell = useIsCoachMobileShell();
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [teams, setTeams] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [teamForm, setTeamForm] = useState({ name: "", age_group: "", season: "", gender: "", is_active: true });
  const [editTeam, setEditTeam] = useState(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: "", age_group: "", season: "", gender: "", is_active: true });
  const [assignTeam, setAssignTeam] = useState(null);
  const [assignCoachId, setAssignCoachId] = useState("");

  const roleRaw = user?.role;
  const roleValue = typeof roleRaw === "object" && roleRaw && "value" in roleRaw ? roleRaw.value : roleRaw;
  const isHeadCoach = String(roleValue || "").toLowerCase() === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const normalizeTeamsList = (list) => {
    let out = Array.isArray(list) ? [...list] : [];
    if (!isHeadCoach) {
      out = out.filter((t) => Number(t?.coach_id) === currentUserId);
      out = out.filter((t) => t.is_active !== false);
    }
    out.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));
    return out;
  };

  const teamDetailPath = (teamId) => `/coach/teams/${teamId}`;

  const loadTeams = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeams(normalizeTeamsList(list));
  };

  const loadCoaches = async () => {
    const res = await axiosInstance.get(API_PATHS.FEES_COACHES_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setCoaches(list);
  };

  const bootstrap = async () => {
    try {
      setBusy(true);
      if (isHeadCoach) {
        await Promise.all([loadTeams(), loadCoaches()]);
      } else {
        await loadTeams();
      }
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, [isHeadCoach]);

  const openCreate = () => {
    setCreateOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("teams-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const createTeam = async () => {
    const payload = {
      name: teamForm.name.trim(),
      age_group: teamForm.age_group.trim() || null,
      season: teamForm.season.trim() || null,
      gender: teamForm.gender || null,
      is_active: Boolean(teamForm.is_active),
    };
    if (!payload.name) {
      toast.error("Името на групата е задължително.");
      return;
    }
    if (!payload.gender) {
      toast.error("Избери дали групата е мъжка или женска.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.TEAM_CREATE, payload);
      await loadTeams();
      setTeamForm({ name: "", age_group: "", season: "", gender: "", is_active: true });
      setCreateOpen(false);
      toast.success("Групата е създадена.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване на група."));
    } finally {
      setBusy(false);
    }
  };

  const deleteTeam = async (team) => {
    if (!window.confirm(`Сигурни ли сте, че искате да изтриете "${team.name}"?`)) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.TEAM_DELETE(team.id));
      await loadTeams();
      toast.success("Групата е изтрита.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване на група."));
    } finally {
      setBusy(false);
    }
  };

  const openEditTeam = (team) => {
    setEditTeam(team);
    setEditTeamForm({
      name: team.name || "",
      age_group: team.age_group || "",
      season: team.season || "",
      gender: team.gender || "",
      is_active: Boolean(team.is_active),
    });
  };

  const toggleRecruitment = async (team) => {
    if (!isHeadCoach) return;
    const next = !Boolean(team.public_enrollment_open);
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.TEAM_UPDATE(team.id), {
        public_enrollment_open: next,
      });
      setTeams((prev) =>
        normalizeTeamsList(prev.map((t) => (Number(t.id) === Number(team.id) ? { ...t, ...res.data } : t))),
      );
      toast.success(
        next
          ? `„${team.name}“ е отворена за набиране на публичната страница.`
          : `„${team.name}“ е затворена за набиране.`,
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна промяна на набирането."));
    } finally {
      setBusy(false);
    }
  };

  const saveEditTeam = async () => {
    if (!editTeam) return;
    const payload = {
      name: editTeamForm.name.trim(),
      age_group: editTeamForm.age_group.trim() || null,
      season: editTeamForm.season.trim() || null,
      gender: editTeamForm.gender || null,
      is_active: Boolean(editTeamForm.is_active),
    };
    if (!payload.name) {
      toast.error("Името на групата е задължително.");
      return;
    }
    if (!payload.gender) {
      toast.error("Избери дали групата е мъжка или женска.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_UPDATE(editTeam.id), payload);
      setEditTeam(null);
      await loadTeams();
      toast.success("Групата е обновена.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна редакция на група."));
    } finally {
      setBusy(false);
    }
  };

  const openAssignCoach = (team) => {
    setAssignTeam(team);
    setAssignCoachId(String(team?.coach_id || ""));
  };

  const saveAssignCoach = async () => {
    if (!assignTeam) return;
    const nextCoachId = Number(assignCoachId);
    if (!Number.isFinite(nextCoachId) || nextCoachId <= 0) {
      toast.error("Избери треньор.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_ASSIGN_COACH(assignTeam.id), { coach_id: nextCoachId });
      setAssignTeam(null);
      await Promise.all([loadTeams(), loadCoaches()]);
      toast.success(
        "Треньорът на групата е сменен (график и присъствие). Таксите остават при отговорния треньор на всеки състезател.",
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна смяна на треньор за групата."));
    } finally {
      setBusy(false);
    }
  };

  const page = (
    <CoachHubPage
      title="Групи"
      subtitle={
        isHeadCoach
          ? "Избери група за работа. Набирането се отваря от бутона под реда."
          : "Избери група, после отвори отделния ѝ екран."
      }
      roleLabel={isHeadCoach ? "Главен треньор" : undefined}
    >
      <MenuGroup title="Тренировъчни групи">
        {teams.length === 0 ? (
          <li>
            <EmptyState
              title="Няма създадени групи"
              description={
                isHeadCoach
                  ? "Създай първата група с бутона + или формата по-долу."
                  : "Помолете главния треньор да ви назначи група или да създаде нова."
              }
            />
          </li>
        ) : (
          teams.map((team) => (
            <li
              key={team.id}
              className={`teamsHubItem${team.gender === "male" ? " teamsHubItem--male" : team.gender === "female" ? " teamsHubItem--female" : ""}`}
            >
              <Link to={teamDetailPath(team.id)} className="coachMobileMenuRow">
                <span className="coachMobileMenuIconWrap">
                  <NavIcon name="teams" size={18} />
                </span>
                <span className="coachMobileMenuRowBody">
                  <span className="coachMobileMenuLabel">{team.name}</span>
                  <span className="coachMobileMuted coachMobileMenuHint">
                    {teamHint(team, { isHeadCoach })}
                  </span>
                </span>
                <span className="coachMobileTeamChevron" aria-hidden>
                  ›
                </span>
              </Link>
              <div className="teamsHubItemActions">
                {isHeadCoach ? (
                  <Button
                    size="sm"
                    variant={team.public_enrollment_open ? "secondary" : "primary"}
                    disabled={busy || team.is_active === false}
                    onClick={() => toggleRecruitment(team)}
                  >
                    {team.public_enrollment_open ? "Затвори набиране" : "Отвори за набиране"}
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => openEditTeam(team)}>
                  Редактирай
                </Button>
                {isHeadCoach ? (
                  <Button size="sm" variant="secondary" onClick={() => openAssignCoach(team)}>
                    Назначи треньор
                  </Button>
                ) : null}
                <Button size="sm" variant="danger" onClick={() => deleteTeam(team)}>
                  Изтрий
                </Button>
              </div>
            </li>
          ))
        )}
      </MenuGroup>

      {(createOpen || !isMobileCoachShell) && (isHeadCoach || teams.length === 0) ? (
        <section className="teamsHubCreate" id="teams-create">
          <h2 className="coachMobileSectionTitle">Нова група</h2>
          <div className="teamsHubCreateCard">
            <div className="feesFormGrid">
              <Input
                placeholder="Име на група"
                value={teamForm.name}
                onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                placeholder="Възрастова група (пример: U14)"
                value={teamForm.age_group}
                onChange={(e) => setTeamForm((p) => ({ ...p, age_group: e.target.value }))}
              />
              <Input
                placeholder="Сезон (пример: 2025/2026)"
                value={teamForm.season}
                onChange={(e) => setTeamForm((p) => ({ ...p, season: e.target.value }))}
              />
              <Input
                as="select"
                value={teamForm.gender}
                onChange={(e) => setTeamForm((p) => ({ ...p, gender: e.target.value }))}
              >
                <option value="">Избери тип на групата</option>
                <option value="male">Мъжки</option>
                <option value="female">Женски</option>
              </Input>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={teamForm.is_active}
                  onChange={(e) => setTeamForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Активна група
              </label>
              <div className="teamsCreateActions">
                <Button disabled={busy} onClick={createTeam} block className="teamsCreateBtn">
                  Създай група
                </Button>
                {isMobileCoachShell ? (
                  <Button variant="secondary" block disabled={busy} onClick={() => setCreateOpen(false)}>
                    Скрий
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {isMobileCoachShell ? (
        <CoachSpeedFab
          actions={[
            isHeadCoach
              ? {
                  id: "create-team",
                  label: "Нова група",
                  primary: true,
                  onClick: openCreate,
                }
              : null,
            {
              id: "athlete",
              label: "Нов състезател",
              primary: !isHeadCoach,
              to: "/coach/athletes?tab=add",
            },
            { id: "schedule", label: "График", to: "/coach/schedule" },
          ].filter(Boolean)}
        />
      ) : null}

      <Modal
        open={Boolean(editTeam)}
        onClose={() => setEditTeam(null)}
        dismissable={!busy}
        title="Редакция на група"
        size="compact"
      >
        <div style={{ display: "grid", gap: 8 }}>
          <Input
            placeholder="Име на група"
            value={editTeamForm.name}
            onChange={(e) => setEditTeamForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="Възрастова група"
            value={editTeamForm.age_group}
            onChange={(e) => setEditTeamForm((p) => ({ ...p, age_group: e.target.value }))}
          />
          <Input
            placeholder="Сезон"
            value={editTeamForm.season}
            onChange={(e) => setEditTeamForm((p) => ({ ...p, season: e.target.value }))}
          />
          <Input
            as="select"
            value={editTeamForm.gender}
            onChange={(e) => setEditTeamForm((p) => ({ ...p, gender: e.target.value }))}
          >
            <option value="">Избери тип на групата</option>
            <option value="male">Мъжки</option>
            <option value="female">Женски</option>
          </Input>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={editTeamForm.is_active}
              onChange={(e) => setEditTeamForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Активна група
          </label>
          <div className="uiModalActions">
            <Button disabled={busy} onClick={saveEditTeam}>
              Запази
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditTeam(null)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(assignTeam)}
        onClose={() => setAssignTeam(null)}
        dismissable={!busy}
        title="Назначи треньор на група"
        size="compact"
      >
        <div style={{ color: "#607693", fontSize: 13 }}>
          Група: <strong>{assignTeam?.name}</strong>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <Input as="select" value={assignCoachId} onChange={(e) => setAssignCoachId(e.target.value)}>
            <option value="">Избери треньор</option>
            {coaches.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} {c.email ? `(${c.email})` : ""}
              </option>
            ))}
          </Input>
          <div style={{ color: "#607693", fontSize: 12 }}>
            Ще се смени треньорът на групата и активните състезатели в тази група ще бъдат прехвърлени към новия
            треньор.
          </div>
          <div className="uiModalActions">
            <Button disabled={busy} onClick={saveAssignCoach}>
              Запази
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAssignTeam(null)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>
    </CoachHubPage>
  );

  if (isCoachShell) return page;

  return <div className="uiPage">{page}</div>;
}
