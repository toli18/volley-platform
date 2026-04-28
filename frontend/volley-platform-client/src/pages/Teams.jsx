import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const normalizeError = (err, fallback = "Грешка при работа с отборите.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function Teams() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: "", age_group: "", season: "", is_active: true });
  const [editTeam, setEditTeam] = useState(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: "", age_group: "", season: "", is_active: true });

  const [athletes, setAthletes] = useState([]);
  const [memberIds, setMemberIds] = useState([]);

  const [attendanceDate, setAttendanceDate] = useState(todayKey());
  const [attendanceTitle, setAttendanceTitle] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [reportPeriod, setReportPeriod] = useState({ from_date: todayKey(), to_date: todayKey() });
  const [attendanceReport, setAttendanceReport] = useState(null);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) || null, [teams, selectedTeamId]);

  const loadTeams = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeams(list);
    if (!selectedTeamId && list.length > 0) {
      setSelectedTeamId(list[0].id);
    } else if (selectedTeamId && !list.some((x) => x.id === selectedTeamId)) {
      setSelectedTeamId(list[0]?.id || null);
    }
  };

  const loadAthletes = async () => {
    const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST);
    setAthletes(Array.isArray(res.data) ? res.data : []);
  };

  const loadMembers = async (teamId) => {
    if (!teamId) {
      setMemberIds([]);
      return;
    }
    const res = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamId));
    const ids = (res.data?.members || []).map((m) => m.athlete_id);
    setMemberIds(ids);
  };

  const loadAttendance = async (teamId, date) => {
    if (!teamId || !date) {
      setAttendanceRows([]);
      setAttendanceTitle("");
      return;
    }
    const res = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_GET(teamId), { params: { date } });
    setAttendanceRows(Array.isArray(res.data?.items) ? res.data.items : []);
    setAttendanceTitle(res.data?.title || "");
  };

  const loadAttendanceReport = async (teamId, fromDate, toDate) => {
    if (!teamId || !fromDate || !toDate) {
      setAttendanceReport(null);
      return;
    }
    const res = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_REPORT(teamId), {
      params: { from_date: fromDate, to_date: toDate },
    });
    setAttendanceReport(res.data || null);
  };

  const bootstrap = async () => {
    try {
      setBusy(true);
      await Promise.all([loadTeams(), loadAthletes()]);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    const run = async () => {
      try {
        setBusy(true);
        await Promise.all([
          loadMembers(selectedTeamId),
          loadAttendance(selectedTeamId, attendanceDate),
          loadAttendanceReport(selectedTeamId, reportPeriod.from_date, reportPeriod.to_date),
        ]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId || !attendanceDate) return;
    const run = async () => {
      try {
        await loadAttendance(selectedTeamId, attendanceDate);
      } catch (err) {
        toast.error(normalizeError(err, "Грешка при зареждане на присъствието."));
      }
    };
    run();
  }, [attendanceDate]);

  useEffect(() => {
    if (!selectedTeamId || !reportPeriod.from_date || !reportPeriod.to_date) return;
    const run = async () => {
      try {
        await loadAttendanceReport(selectedTeamId, reportPeriod.from_date, reportPeriod.to_date);
      } catch (err) {
        toast.error(normalizeError(err, "Грешка при зареждане на отчета."));
      }
    };
    run();
  }, [selectedTeamId, reportPeriod.from_date, reportPeriod.to_date]);

  const createTeam = async () => {
    const payload = {
      name: teamForm.name.trim(),
      age_group: teamForm.age_group.trim() || null,
      season: teamForm.season.trim() || null,
      is_active: Boolean(teamForm.is_active),
    };
    if (!payload.name) {
      toast.error("Името на отбора е задължително.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_CREATE, payload);
      await loadTeams();
      setTeamForm({ name: "", age_group: "", season: "", is_active: true });
      setSelectedTeamId(res.data?.id || null);
      toast.success("Отборът е създаден.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване на отбор."));
    } finally {
      setBusy(false);
    }
  };

  const saveMembers = async () => {
    if (!selectedTeamId) return;
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_MEMBERS_SET(selectedTeamId), { athlete_ids: memberIds });
      await loadAttendance(selectedTeamId, attendanceDate);
      toast.success("Съставът е запазен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на състава."));
    } finally {
      setBusy(false);
    }
  };

  const saveAttendance = async () => {
    if (!selectedTeamId || !attendanceDate) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.TEAM_ATTENDANCE_SAVE(selectedTeamId), {
        date: attendanceDate,
        title: attendanceTitle || null,
        items: attendanceRows.map((r) => ({
          athlete_id: r.athlete_id,
          status: r.status || "present",
          note: r.note || null,
        })),
      });
      toast.success("Присъствието е запазено.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на присъствието."));
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
      is_active: Boolean(team.is_active),
    });
  };

  const saveEditTeam = async () => {
    if (!editTeam) return;
    const payload = {
      name: editTeamForm.name.trim(),
      age_group: editTeamForm.age_group.trim() || null,
      season: editTeamForm.season.trim() || null,
      is_active: Boolean(editTeamForm.is_active),
    };
    if (!payload.name) {
      toast.error("Името на отбора е задължително.");
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

  return (
    <div className="uiPage">
      <PageHero
        title="Отбори"
        subtitle="Създавай отбори, избирай състезатели и води присъствие по дата."
      />

      <Card title="Нов отбор">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Input placeholder="Име на отбор" value={teamForm.name} onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Възрастова група (пример: U14)" value={teamForm.age_group} onChange={(e) => setTeamForm((p) => ({ ...p, age_group: e.target.value }))} />
          <Input placeholder="Сезон (пример: 2025/2026)" value={teamForm.season} onChange={(e) => setTeamForm((p) => ({ ...p, season: e.target.value }))} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={teamForm.is_active} onChange={(e) => setTeamForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Активен отбор
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={createTeam}>Създай отбор</Button>
          </div>
        </div>
      </Card>

      <Card title="Списък отбори">
        {teams.length === 0 ? (
          <EmptyState title="Няма създадени отбори" description="Създай първия отбор от формата по-горе." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Име</TableHead>
                <TableHead>Група</TableHead>
                <TableHead>Сезон</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell><strong>{team.name}</strong></TableCell>
                  <TableCell>{team.age_group || "-"}</TableCell>
                  <TableCell>{team.season || "-"}</TableCell>
                  <TableCell>
                    <span className={`uiBadge ${team.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {team.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button size="sm" variant={selectedTeamId === team.id ? "secondary" : "primary"} onClick={() => setSelectedTeamId(team.id)}>
                        {selectedTeamId === team.id ? "Избран" : "Избери"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEditTeam(team)}>Редактирай</Button>
                      <Button size="sm" variant="danger" onClick={() => deleteTeam(team)}>Изтрий</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {selectedTeam && (
        <>
          <Card title={`Състав: ${selectedTeam.name}`}>
            {athletes.length === 0 ? (
              <EmptyState title="Няма състезатели" description="Добави състезатели в меню Месечни Такси." />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>В отбора</TableHead>
                      <TableHead>Състезател</TableHead>
                      <TableHead>Родител</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Профил</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {athletes.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={memberIds.includes(a.id)}
                            onChange={(e) => {
                              setMemberIds((prev) => {
                                if (e.target.checked) return [...new Set([...prev, a.id])];
                                return prev.filter((id) => id !== a.id);
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>{a.athlete_name}</TableCell>
                        <TableCell>{a.parent_name || "-"}</TableCell>
                        <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                        <TableCell>
                          <Link to={`/teams/athletes/${a.id}`}>
                            <Button size="sm" variant="ghost">Отвори</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div style={{ marginTop: 12 }}>
                  <Button disabled={busy} onClick={saveMembers}>Запази състав</Button>
                </div>
              </>
            )}
          </Card>

          <Card title={`Присъствие: ${selectedTeam.name}`}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
              <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
              <Input placeholder="Заглавие на тренировка (по желание)" value={attendanceTitle} onChange={(e) => setAttendanceTitle(e.target.value)} />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <Button disabled={busy || attendanceRows.length === 0} onClick={saveAttendance}>Запази присъствие</Button>
              </div>
            </div>
            {attendanceRows.length === 0 ? (
              <EmptyState title="Няма избрани състезатели" description="Добави състезатели в състава на отбора, за да отбелязваш присъствие." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Бележка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRows.map((row) => (
                    <TableRow key={row.athlete_id}>
                      <TableCell>{row.athlete_name}</TableCell>
                      <TableCell>
                        <select
                          className="uiInput"
                          value={row.status || "present"}
                          onChange={(e) =>
                            setAttendanceRows((prev) =>
                              prev.map((x) => (x.athlete_id === row.athlete_id ? { ...x, status: e.target.value } : x))
                            )
                          }
                        >
                          <option value="present">Присъства</option>
                          <option value="late">Закъсня</option>
                          <option value="absent">Отсъства</option>
                          <option value="excused">Извинен</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Бележка"
                          value={row.note || ""}
                          onChange={(e) =>
                            setAttendanceRows((prev) =>
                              prev.map((x) => (x.athlete_id === row.athlete_id ? { ...x, note: e.target.value } : x))
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card title={`Отчет присъствие: ${selectedTeam.name}`}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
              <Input
                type="date"
                value={reportPeriod.from_date}
                onChange={(e) => setReportPeriod((p) => ({ ...p, from_date: e.target.value }))}
              />
              <Input
                type="date"
                value={reportPeriod.to_date}
                onChange={(e) => setReportPeriod((p) => ({ ...p, to_date: e.target.value }))}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="uiBadge uiBadge--info">Тренировки: {attendanceReport?.sessions_count || 0}</span>
              </div>
            </div>
            {!attendanceReport || (attendanceReport.rows || []).length === 0 ? (
              <EmptyState title="Няма данни за периода" description="Промени периода или добави присъствия за избрания отбор." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Присъства</TableHead>
                    <TableHead>Закъсня</TableHead>
                    <TableHead>Отсъства</TableHead>
                    <TableHead>Извинен</TableHead>
                    <TableHead>Общо</TableHead>
                    <TableHead>% посещаемост</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(attendanceReport.rows || []).map((row) => (
                    <TableRow key={row.athlete_id}>
                      <TableCell>{row.athlete_name}</TableCell>
                      <TableCell>{row.present}</TableCell>
                      <TableCell>{row.late}</TableCell>
                      <TableCell>{row.absent}</TableCell>
                      <TableCell>{row.excused}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${row.attendance_rate_percent >= 80 ? "uiBadge--success" : row.attendance_rate_percent >= 60 ? "uiBadge--warning" : "uiBadge--danger"}`}>
                          {row.attendance_rate_percent}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

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
    </div>
  );
}
