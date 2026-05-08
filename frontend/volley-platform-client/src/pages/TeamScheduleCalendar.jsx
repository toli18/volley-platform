import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../components/ui";

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKeyNow = () => todayKey().slice(0, 7);

const monthRange = (monthKey) => {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const t = todayKey();
    return { from: t, to: t };
  }
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(y, m, 0).getDate();
  const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
  return { from, to };
};

const weekdayLabel = (dateIso) => {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const map = ["Нед", "Пон", "Вт", "Ср", "Чет", "Пет", "Съб"];
  return map[day] || "";
};

const normalizeError = (err, fallback = "Грешка при работа с графика.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

const roleValue = (user) => {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
};

export default function TeamScheduleCalendar() {
  const toast = useToast();
  const { user } = useAuth();
  const role = roleValue(user);
  const isHeadCoach = role === "club_head_coach";

  const [busy, setBusy] = useState(false);
  const [monthKey, setMonthKey] = useState(monthKeyNow());
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    team_id: "",
    coach_id: "",
    date: todayKey(),
    location: "",
    start_time: "18:00",
    end_time: "19:30",
    repeat_weekly: false,
    repeat_to: "",
  });

  const [editOcc, setEditOcc] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    team_id: "",
    coach_id: "",
    location: "",
    start_time: "",
    end_time: "",
  });

  const currentUserId = Number(user?.id || 0);
  const effectiveCoachFilter = coachFilter || (!isHeadCoach && currentUserId > 0 ? String(currentUserId) : "");

  const groupedByDate = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const arr = map.get(it.date) || [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const canEditOccurrence = (it) => isHeadCoach || Number(it.coach_id) === currentUserId;

  const loadData = async () => {
    const { from, to } = monthRange(monthKey);
    const params = { from, to };
    if (effectiveCoachFilter) params.coach_id = Number(effectiveCoachFilter);
    if (teamFilter) params.team_id = Number(teamFilter);
    if (locationFilter.trim()) params.location = locationFilter.trim();
    const reqs = [
      axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, { params }),
      axiosInstance.get(API_PATHS.TEAMS_LIST),
    ];
    if (isHeadCoach) reqs.push(axiosInstance.get(API_PATHS.FEES_COACHES_LIST));
    const [occRes, teamsRes, coachesRes] = await Promise.all(reqs);
    setItems(Array.isArray(occRes.data?.items) ? occRes.data.items : []);
    setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
    setCoaches(Array.isArray(coachesRes?.data) ? coachesRes.data : []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setBusy(true);
        await loadData();
      } catch (err) {
        toast.error(normalizeError(err, "Неуспешно зареждане на месечния график."));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [monthKey, teamFilter, effectiveCoachFilter, locationFilter, isHeadCoach, currentUserId]);

  const openEdit = (it) => {
    setEditOcc(it);
    setEditForm({
      date: it.date,
      team_id: String(it.team_id || ""),
      coach_id: String(it.coach_id || ""),
      location: it.location || "",
      start_time: it.start_time || "18:00",
      end_time: it.end_time || "19:30",
    });
  };

  const saveOverride = async () => {
    if (!editOcc) return;
    if (!editForm.team_id || !editForm.coach_id || !editForm.location.trim()) {
      toast.error("Попълни отбор, треньор и зала.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(editOcc.rule_id), {
        date: editForm.date,
        kind: "override",
        team_id: Number(editForm.team_id),
        coach_id: Number(editForm.coach_id),
        location: editForm.location.trim(),
        start_time: editForm.start_time,
        end_time: editForm.end_time,
      });
      toast.success("Тренировката е коригирана.");
      setEditOcc(null);
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна корекция на тренировката."));
    } finally {
      setBusy(false);
    }
  };

  const cancelOccurrence = async (it) => {
    if (!window.confirm("Сигурни ли сте, че искате да отмените тази тренировка?")) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(it.rule_id), {
        date: it.date,
        kind: "cancelled",
      });
      toast.success("Тренировката е отменена.");
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна отмяна на тренировката."));
    } finally {
      setBusy(false);
    }
  };

  const restoreOccurrence = async (it) => {
    if (!it.exception_id) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_EXCEPTION_DELETE(it.exception_id));
      toast.success("Тренировката е възстановена.");
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно възстановяване."));
    } finally {
      setBusy(false);
    }
  };

  const addTraining = async () => {
    if (!addForm.team_id || !addForm.date || !addForm.location.trim()) {
      toast.error("Попълни отбор, дата и зала.");
      return;
    }
    const coachId = isHeadCoach ? Number(addForm.coach_id || 0) : currentUserId;
    if (!coachId) {
      toast.error("Избери треньор.");
      return;
    }
    const d = new Date(`${addForm.date}T00:00:00`);
    const jsDay = d.getDay(); // 0 Sun .. 6 Sat
    const weekday = jsDay === 0 ? 6 : jsDay - 1; // 0 Mon .. 6 Sun
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_RULES_CREATE, {
        team_id: Number(addForm.team_id),
        coach_id: coachId,
        location: addForm.location.trim(),
        weekday,
        start_time: addForm.start_time,
        end_time: addForm.end_time,
        effective_from: addForm.date,
        effective_to: addForm.repeat_weekly ? (addForm.repeat_to || null) : addForm.date,
        is_active: true,
      });
      toast.success("Тренировката е добавена.");
      setAddOpen(false);
      setAddForm({
        team_id: "",
        coach_id: isHeadCoach ? "" : String(currentUserId || ""),
        date: todayKey(),
        location: "",
        start_time: "18:00",
        end_time: "19:30",
        repeat_weekly: false,
        repeat_to: "",
      });
      await loadData();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне на тренировка."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Месечен график на тренировки"
        subtitle="Пълен график за избрания месец с действия: Присъствие, Корекция, Отмяна."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => setAddOpen(true)}>+ Добави тренировка</Button>
            <Link to="/teams">
              <Button variant="secondary">Назад към Отбори</Button>
            </Link>
          </div>
        }
      />

      <Card title="Филтри">
        <div className="feesFormGrid">
          <Input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
          <Input as="select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">Всички отбори</option>
            {teams.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </Input>
          {isHeadCoach ? (
            <Input as="select" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
              <option value="">Всички треньори</option>
              {coaches.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Input>
          ) : null}
          <Input placeholder="Търси по зала" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
        </div>
      </Card>

      <Card title="Календар (месечен списък)">
        {busy ? (
          <p>Зареждане...</p>
        ) : groupedByDate.length === 0 ? (
          <EmptyState title="Няма тренировки за този месец" description="Добави тренировка от бутона по-горе." />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {groupedByDate.map(([date, dayItems]) => (
              <section key={date} style={{ border: "1px solid #dbe6f3", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  {date} ({weekdayLabel(date)})
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {dayItems.map((it, idx) => (
                    <article key={`${it.rule_id}-${it.date}-${it.start_time}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{it.start_time} - {it.end_time}</div>
                          <div style={{ color: "#5b6f85", fontSize: 13 }}>
                            {it.team_name || `Отбор #${it.team_id}`} | {it.coach_name || `Треньор #${it.coach_id}`} | {it.location}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link to={`/teams/${it.team_id}/attendance?date=${it.date}&title=${encodeURIComponent(`Тренировка ${it.start_time}`)}`}>
                            <Button size="sm">Присъствие</Button>
                          </Link>
                          {canEditOccurrence(it) ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => openEdit(it)}>Коригирай</Button>
                              {it.exception_id ? (
                                <Button size="sm" variant="secondary" onClick={() => restoreOccurrence(it)}>Възстанови</Button>
                              ) : (
                                <Button size="sm" variant="danger" onClick={() => cancelOccurrence(it)}>Отмени</Button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      {addOpen ? (
        <div className="uiModalOverlay" onClick={() => !busy && setAddOpen(false)}>
          <section className="uiModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="uiModalTitle">Добавяне на тренировка</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input as="select" value={addForm.team_id} onChange={(e) => setAddForm((p) => ({ ...p, team_id: e.target.value }))}>
                <option value="">Избери отбор</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </Input>
              {isHeadCoach ? (
                <Input as="select" value={addForm.coach_id} onChange={(e) => setAddForm((p) => ({ ...p, coach_id: e.target.value }))}>
                  <option value="">Избери треньор</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </Input>
              ) : null}
              <Input type="date" value={addForm.date} onChange={(e) => setAddForm((p) => ({ ...p, date: e.target.value }))} />
              <Input placeholder="Зала" value={addForm.location} onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))} />
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <Input type="time" value={addForm.start_time} onChange={(e) => setAddForm((p) => ({ ...p, start_time: e.target.value }))} />
                <Input type="time" value={addForm.end_time} onChange={(e) => setAddForm((p) => ({ ...p, end_time: e.target.value }))} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(addForm.repeat_weekly)}
                  onChange={(e) => setAddForm((p) => ({ ...p, repeat_weekly: e.target.checked }))}
                />
                Повтаряй всяка седмица
              </label>
              {addForm.repeat_weekly ? (
                <Input
                  type="date"
                  value={addForm.repeat_to}
                  onChange={(e) => setAddForm((p) => ({ ...p, repeat_to: e.target.value }))}
                  placeholder="Повтаряй до"
                />
              ) : null}
              <div className="uiModalActions">
                <Button disabled={busy} onClick={addTraining}>Запази</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setAddOpen(false)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {editOcc ? (
        <div className="uiModalOverlay" onClick={() => !busy && setEditOcc(null)}>
          <section className="uiModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="uiModalTitle">Корекция на тренировка</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input type="date" value={editForm.date} onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))} />
              <Input as="select" value={editForm.team_id} onChange={(e) => setEditForm((p) => ({ ...p, team_id: e.target.value }))}>
                <option value="">Избери отбор</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </Input>
              <Input as="select" value={editForm.coach_id} onChange={(e) => setEditForm((p) => ({ ...p, coach_id: e.target.value }))}>
                <option value="">Избери треньор</option>
                {(isHeadCoach ? coaches : [{ id: currentUserId, name: user?.name || "Треньор" }]).map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </Input>
              <Input placeholder="Зала" value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} />
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <Input type="time" value={editForm.start_time} onChange={(e) => setEditForm((p) => ({ ...p, start_time: e.target.value }))} />
                <Input type="time" value={editForm.end_time} onChange={(e) => setEditForm((p) => ({ ...p, end_time: e.target.value }))} />
              </div>
              <div className="uiModalActions">
                <Button disabled={busy} onClick={saveOverride}>Запази корекция</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setEditOcc(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
