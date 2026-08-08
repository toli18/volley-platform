import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import useIsCoachMobileShell from "../hooks/useIsCoachMobileShell";
import { Button, Card, EmptyState, Input, Modal, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const teamGenderLabel = (gender) => {
  if (gender === "male") return "Мъжки";
  if (gender === "female") return "Женски";
  return "—";
};

export default function Teams() {
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const isCoachShell = location.pathname.startsWith("/coach/teams");
  const isMobileCoachShell = useIsCoachMobileShell();
  const [busy, setBusy] = useState(false);

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
      const res = await axiosInstance.post(API_PATHS.TEAM_CREATE, payload);
      await loadTeams();
      setTeamForm({ name: "", age_group: "", season: "", gender: "", is_active: true });
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
      toast.success("Треньорът на групата е сменен (график и присъствие). Таксите остават при отговорния треньор на всеки състезател.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна смяна на треньор за групата."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`uiPage ${isCoachShell ? "uiPage--coachTeams" : ""}`.trim()}>
      {isMobileCoachShell ? (
        <h2 className="coachMobileSectionTitle">Тренировъчни групи</h2>
      ) : (
        <PageHero
          title="Тренировъчни групи"
          subtitle="Първо избери група, после отвори отделния ѝ екран. Главният отваря групи за набиране с бутона „Отвори за набиране“."
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isHeadCoach ? (
                <Button as={Link} to="/coach/club-profile" variant="secondary">
                  Публична страница
                </Button>
              ) : null}
              <Button as={Link} to="/coach/athletes?tab=add" variant="secondary">
                Нов състезател
              </Button>
              <Link to="/coach/schedule">
                <Button>График</Button>
              </Link>
            </div>
          }
        />
      )}

      {isMobileCoachShell ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button as={Link} to="/coach/athletes?tab=add" variant="secondary" size="sm">
            Нов състезател
          </Button>
          <Button as={Link} to="/coach/schedule" size="sm">
            График
          </Button>
        </div>
      ) : null}

      <Card title="Списък тренировъчни групи">
        {teams.length === 0 ? (
          <EmptyState
            title="Няма създадени групи"
            description={
              isHeadCoach
                ? "Създай първата група от формата по-долу."
                : "Помолете главния треньор да ви назначи група или да създаде нова."
            }
          />
        ) : (
          <>
            <div className="teamsMobileList" aria-label="Тренировъчни групи (мобилен изглед)">
              {teams.map((team) => (
                <article
                  key={`m-${team.id}`}
                  className={`teamsMobileCard ${team.gender === "male" ? "teamsMobileCard--male" : team.gender === "female" ? "teamsMobileCard--female" : ""}`}
                >
                  <h3 className="teamsMobileCardTitle">{team.name}</h3>
                  <div className="teamsMobileMeta">
                    <span>Треньор: {team.coach_name || "—"}</span>
                    <span>Група: {team.age_group || "—"}</span>
                    <span>Сезон: {team.season || "—"}</span>
                    <span>Тип: {teamGenderLabel(team.gender)}</span>
                    <span className={`uiBadge ${team.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {team.is_active ? "Активен" : "Неактивен"}
                    </span>
                    {isHeadCoach ? (
                      <span
                        className={`uiBadge ${team.public_enrollment_open ? "uiBadge--success" : ""}`}
                        style={
                          team.public_enrollment_open
                            ? undefined
                            : { background: "#f1f5f9", color: "#64748b" }
                        }
                      >
                        {team.public_enrollment_open ? "Отворена за набиране" : "Затворена за набиране"}
                      </span>
                    ) : null}
                  </div>
                  <div className="teamsMobileActions">
                    <Link to={teamDetailPath(team.id)} style={{ display: "block" }}>
                      <Button size="sm" block>
                        Отвори
                      </Button>
                    </Link>
                    {isHeadCoach ? (
                      <Button
                        size="sm"
                        variant={team.public_enrollment_open ? "secondary" : "primary"}
                        block
                        disabled={busy || team.is_active === false}
                        onClick={() => toggleRecruitment(team)}
                      >
                        {team.public_enrollment_open ? "Затвори набиране" : "Отвори за набиране"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" block onClick={() => openEditTeam(team)}>
                      Редактирай
                    </Button>
                    {isHeadCoach ? (
                      <Button size="sm" variant="secondary" block onClick={() => openAssignCoach(team)}>
                        Назначи треньор
                      </Button>
                    ) : null}
                    <Button size="sm" variant="danger" block onClick={() => deleteTeam(team)}>
                      Изтрий
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <div className="teamsDesktopTable">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Име</TableHead>
                    <TableHead>Треньор</TableHead>
                    <TableHead>Група</TableHead>
                    <TableHead>Сезон</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    {isHeadCoach ? <TableHead>Набиране</TableHead> : null}
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow
                      key={team.id}
                      className={team.gender === "male" ? "teamsRow--male" : team.gender === "female" ? "teamsRow--female" : undefined}
                    >
                      <TableCell>
                        <strong>{team.name}</strong>
                      </TableCell>
                      <TableCell>{team.coach_name || "—"}</TableCell>
                      <TableCell>{team.age_group || "-"}</TableCell>
                      <TableCell>{team.season || "-"}</TableCell>
                      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${team.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                          {team.is_active ? "Активен" : "Неактивен"}
                        </span>
                      </TableCell>
                      {isHeadCoach ? (
                        <TableCell>
                          <Button
                            size="sm"
                            variant={team.public_enrollment_open ? "secondary" : "primary"}
                            disabled={busy || team.is_active === false}
                            onClick={() => toggleRecruitment(team)}
                          >
                            {team.public_enrollment_open ? "Отворена · затвори" : "Отвори за набиране"}
                          </Button>
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link to={teamDetailPath(team.id)}>
                            <Button size="sm">Отвори</Button>
                          </Link>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Card title="Нова тренировъчна група">
        <div className="feesFormGrid">
          <Input placeholder="Име на група" value={teamForm.name} onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Възрастова група (пример: U14)" value={teamForm.age_group} onChange={(e) => setTeamForm((p) => ({ ...p, age_group: e.target.value }))} />
          <Input placeholder="Сезон (пример: 2025/2026)" value={teamForm.season} onChange={(e) => setTeamForm((p) => ({ ...p, season: e.target.value }))} />
          <Input as="select" value={teamForm.gender} onChange={(e) => setTeamForm((p) => ({ ...p, gender: e.target.value }))}>
            <option value="">Избери тип на групата</option>
            <option value="male">Мъжки</option>
            <option value="female">Женски</option>
          </Input>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={teamForm.is_active} onChange={(e) => setTeamForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Активна група
          </label>
          <div className="teamsCreateActions">
            <Button disabled={busy} onClick={createTeam} block className="teamsCreateBtn">
              Създай група
            </Button>
          </div>
        </div>
      </Card>

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
          <Input as="select" value={editTeamForm.gender} onChange={(e) => setEditTeamForm((p) => ({ ...p, gender: e.target.value }))}>
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
            <Button disabled={busy} onClick={saveEditTeam}>Запази</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditTeam(null)}>Отказ</Button>
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
            Ще се смени треньорът на групата и активните състезатели в тази група ще бъдат прехвърлени към новия треньор.
          </div>
          <div className="uiModalActions">
            <Button disabled={busy} onClick={saveAssignCoach}>Запази</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAssignTeam(null)}>Отказ</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
