import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const normalizeError = (err, fallback = "Грешка при работа с отборите.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

const teamGenderLabel = (gender) => {
  if (gender === "male") return "Мъжки";
  if (gender === "female") return "Женски";
  return "—";
};

export default function Teams() {
  const toast = useToast();
  const { user } = useAuth();
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

  const loadTeams = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeams(list);
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
      toast.error("Името на отбора е задължително.");
      return;
    }
    if (!payload.gender) {
      toast.error("Избери дали отборът е мъжки или женски.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_CREATE, payload);
      await loadTeams();
      setTeamForm({ name: "", age_group: "", season: "", gender: "", is_active: true });
      toast.success("Отборът е създаден.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване на отбор."));
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
      toast.success("Отборът е изтрит.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване на отбор."));
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
      toast.error("Името на отбора е задължително.");
      return;
    }
    if (!payload.gender) {
      toast.error("Избери дали отборът е мъжки или женски.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_UPDATE(editTeam.id), payload);
      setEditTeam(null);
      await loadTeams();
      toast.success("Отборът е обновен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна редакция на отбор."));
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
      toast.success("Треньорът на отбора е сменен. Състезателите са прехвърлени към него.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна смяна на треньор за отбора."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Отбори"
        subtitle="Първо избери отбор, после отвори отделния му екран."
      />

      <Card title="Списък отбори">
        {teams.length === 0 ? (
          <EmptyState title="Няма създадени отбори" description="Създай първия отбор от формата по-долу." />
        ) : (
          <>
            <div className="teamsMobileList" aria-label="Отбори (мобилен изглед)">
              {teams.map((team) => (
                <article
                  key={`m-${team.id}`}
                  className={`teamsMobileCard ${team.gender === "male" ? "teamsMobileCard--male" : team.gender === "female" ? "teamsMobileCard--female" : ""}`}
                >
                  <h3 className="teamsMobileCardTitle">{team.name}</h3>
                  <div className="teamsMobileMeta">
                    <span>Група: {team.age_group || "—"}</span>
                    <span>Сезон: {team.season || "—"}</span>
                    <span>Тип: {teamGenderLabel(team.gender)}</span>
                    <span className={`uiBadge ${team.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {team.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </div>
                  <div className="teamsMobileActions">
                    <Link to={`/teams/${team.id}`} style={{ display: "block" }}>
                      <Button size="sm" block>
                        Отвори
                      </Button>
                    </Link>
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
                    <TableHead>Група</TableHead>
                    <TableHead>Сезон</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
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
                      <TableCell>{team.age_group || "-"}</TableCell>
                      <TableCell>{team.season || "-"}</TableCell>
                      <TableCell>{teamGenderLabel(team.gender)}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${team.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                          {team.is_active ? "Активен" : "Неактивен"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link to={`/teams/${team.id}`}>
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

      <Card title="Нов отбор">
        <div className="feesFormGrid">
          <Input placeholder="Име на отбор" value={teamForm.name} onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Възрастова група (пример: U14)" value={teamForm.age_group} onChange={(e) => setTeamForm((p) => ({ ...p, age_group: e.target.value }))} />
          <Input placeholder="Сезон (пример: 2025/2026)" value={teamForm.season} onChange={(e) => setTeamForm((p) => ({ ...p, season: e.target.value }))} />
          <Input as="select" value={teamForm.gender} onChange={(e) => setTeamForm((p) => ({ ...p, gender: e.target.value }))}>
            <option value="">Избери тип на отбора</option>
            <option value="male">Мъжки</option>
            <option value="female">Женски</option>
          </Input>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={teamForm.is_active} onChange={(e) => setTeamForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Активен отбор
          </label>
          <div className="teamsCreateActions">
            <Button disabled={busy} onClick={createTeam} block className="teamsCreateBtn">
              Създай отбор
            </Button>
          </div>
        </div>
      </Card>

      {editTeam && (
        <div onClick={() => !busy && setEditTeam(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Редакция на отбор</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input
                placeholder="Име на отбор"
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
                <option value="">Избери тип на отбора</option>
                <option value="male">Мъжки</option>
                <option value="female">Женски</option>
              </Input>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editTeamForm.is_active}
                  onChange={(e) => setEditTeamForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Активен отбор
              </label>
              <div className="uiModalActions">
                <Button disabled={busy} onClick={saveEditTeam}>Запази</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setEditTeam(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {assignTeam && (
        <div onClick={() => !busy && setAssignTeam(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Назначи треньор на отбор</h3>
            <div style={{ color: "#607693", fontSize: 13 }}>
              Отбор: <strong>{assignTeam.name}</strong>
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
                Ще се смени треньорът на отбора и активните състезатели в този отбор ще бъдат прехвърлени към новия треньор.
              </div>
              <div className="uiModalActions">
                <Button disabled={busy} onClick={saveAssignCoach}>Запази</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setAssignTeam(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
