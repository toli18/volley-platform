import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const todayDate = () => new Date().toISOString().slice(0, 10);

const monthRangeForKey = (monthKey) => {
  if (!monthKey || typeof monthKey !== "string") return { from_date: todayDate(), to_date: todayDate() };
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return { from_date: todayDate(), to_date: todayDate() };

  const from_date = `${monthKey}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-12
  const to_date = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { from_date, to_date };
};

const normalizeError = (err, fallback = "Грешка при зареждане на таблото на главния треньор.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default function ClubHeadDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("athletes");
  const [monthKey, setMonthKey] = useState(nowMonth());
  const [period, setPeriod] = useState(() => monthRangeForKey(nowMonth()));
  const [overview, setOverview] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [coachFilter, setCoachFilter] = useState("");
  const [athleteQuery, setAthleteQuery] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");
  const [assignmentSort, setAssignmentSort] = useState("newest");
  const [payAthlete, setPayAthlete] = useState(null);
  const [payForm, setPayForm] = useState({ month_key: nowMonth(), amount: "", note: "" });
  const [transferAthlete, setTransferAthlete] = useState(null);
  const [transferCoachId, setTransferCoachId] = useState("");
  const [assignForm, setAssignForm] = useState({
    training_id: "",
    assignee_ids: [],
    due_date: "",
    note: "",
  });

  const coaches = useMemo(() => overview?.coaches || [], [overview]);
  // Backend transfer endpoint допуска целта да е и "coach", и "club_head_coach"
  const transferCoaches = useMemo(
    () => coaches.filter((c) => ["coach", "club_head_coach"].includes(String(c?.role || "").toLowerCase())),
    [coaches]
  );
  const filteredAssignments = useMemo(() => {
    let list = [...(assignments || [])];
    if (assignmentStatusFilter !== "all") {
      list = list.filter((a) => String(a?.status || "").toLowerCase() === assignmentStatusFilter);
    }
    if (assignmentSort === "due_asc") {
      list.sort((a, b) => String(a?.due_date || "9999-99-99").localeCompare(String(b?.due_date || "9999-99-99")));
    } else if (assignmentSort === "due_desc") {
      list.sort((a, b) => String(b?.due_date || "").localeCompare(String(a?.due_date || "")));
    } else if (assignmentSort === "status") {
      const order = { new: 0, in_progress: 1, done: 2 };
      list.sort((a, b) => (order[a?.status] ?? 99) - (order[b?.status] ?? 99));
    } else {
      list.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
    }
    return list;
  }, [assignments, assignmentStatusFilter, assignmentSort]);

  const visibleAthletes = useMemo(() => {
    const q = (athleteQuery || "").trim().toLowerCase();
    if (!q) return athletes;
    return (athletes || []).filter((a) => String(a?.athlete_name || "").toLowerCase().includes(q));
  }, [athletes, athleteQuery]);

  const load = async () => {
    try {
      setBusy(true);
      const [overviewRes, athletesRes, assignmentsRes] = await Promise.all([
        axiosInstance.get(API_PATHS.CLUB_OVERVIEW, {
          params: { month_key: monthKey, from_date: period.from_date, to_date: period.to_date },
        }),
        axiosInstance.get(API_PATHS.CLUB_ATHLETES, {
          params: coachFilter ? { coach_id: Number(coachFilter) } : {},
        }),
        axiosInstance.get(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_LIST),
      ]);
      setOverview(overviewRes.data || null);
      setAthletes(Array.isArray(athletesRes.data) ? athletesRes.data : []);
      setAssignments(Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    // UI вече не позволява избор на конкретни дати,
    // затова държим периода за месеца, който е активен в таблото.
    setPeriod(monthRangeForKey(monthKey));
  }, [monthKey]);

  const savePay = async () => {
    if (!payAthlete) return;
    const amount = Number(payForm.amount);
    if (!payForm.month_key || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Въведи валиден месец и сума.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_PAYMENT_SAVE(payAthlete.id), {
        month_key: payForm.month_key,
        amount,
        note: payForm.note?.trim() || null,
      });
      toast.success("Плащането е записано.");
      setPayAthlete(null);
      setPayForm({ month_key: nowMonth(), amount: "", note: "" });
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при запис на плащане."));
    } finally {
      setBusy(false);
    }
  };

  const transferAth = async () => {
    if (!transferAthlete || !transferCoachId) return;
    try {
      const athleteId = Number(transferAthlete.id);
      const coachId = Number(transferCoachId);

      if (!Number.isFinite(athleteId) || !Number.isFinite(coachId)) {
        toast.error(`Невалидни данни за прехвърляне (athlete_id=${transferAthlete?.id}, coach_id=${transferCoachId}).`);
        return;
      }

      setBusy(true);
      await axiosInstance.put(
        API_PATHS.FEES_ATHLETE_TRANSFER(athleteId),
        {},
        { params: { coach_id: coachId } }
      );
      toast.success("Състезателят е прехвърлен.");
      setTransferAthlete(null);
      setTransferCoachId("");
      await load();
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const msg = normalizeError(err, "Грешка при прехвърляне.");
      toast.error(
        `Прехвърляне неуспешно${status ? ` (HTTP ${status})` : ""}: ${detail || msg}`
      );
      // Помага ако искаш да видиш точния error и в DevTools Console.
      // eslint-disable-next-line no-console
      console.error("transferAth failed", {
        athlete_id: transferAthlete?.id,
        coach_id: transferCoachId,
        error: err,
      });
    } finally {
      setBusy(false);
    }
  };

  const assignTraining = async () => {
    const trainingId = Number(assignForm.training_id);
    const assignees = assignForm.assignee_ids || [];
    if (!trainingId || assignees.length === 0) {
      toast.error("Избери тренировка и поне един треньор.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_CREATE, {
        training_id: trainingId,
        assignee_ids: assignees.map((x) => Number(x)),
        due_date: assignForm.due_date || null,
        note: assignForm.note || null,
      });
      toast.success("Задачата е възложена.");
      setAssignForm({ training_id: "", assignee_ids: [], due_date: "", note: "" });
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при възлагане на задача."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Главен треньор"
        subtitle="Клубен контролен панел: състезатели, такси, присъствие и тренировки."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant={tab === "athletes" ? "primary" : "secondary"} onClick={() => setTab("athletes")}>
              Състезатели
            </Button>
            <Button variant={tab === "tasks" ? "primary" : "secondary"} onClick={() => setTab("tasks")}>
              Задачи
            </Button>
          </div>
        }
      />

      {tab === "athletes" && (
        <>
          <Card title="Филтри и обновяване">
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <Input
                placeholder="Търсене по име..."
                value={athleteQuery}
                onChange={(e) => setAthleteQuery(e.target.value)}
              />
              <Input as="select" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
                <option value="">Всички треньори</option>
                {coaches.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({c.role === "club_head_coach" ? "Главен треньор" : "Треньор"})
                  </option>
                ))}
              </Input>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <Button onClick={load} disabled={busy}>{busy ? "Обновяване..." : "Обнови"}</Button>
              </div>
            </div>
          </Card>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Card title="Месечни такси">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="uiBadge">Общо: {overview?.fees?.total_athletes || 0}</span>
                <span className="uiBadge uiBadge--success">Платили: {overview?.fees?.paid_athletes || 0}</span>
                <span className="uiBadge uiBadge--danger">Неплатили: {overview?.fees?.unpaid_athletes || 0}</span>
                <span className="uiBadge uiBadge--info">Сума: {Number(overview?.fees?.total_paid_amount || 0).toFixed(2)} лв.</span>
              </div>
            </Card>

            <Card title="Присъствие за период">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="uiBadge">Тренировки: {overview?.attendance?.sessions_count || 0}</span>
                <span className="uiBadge uiBadge--success">Присъства: {overview?.attendance?.present || 0}</span>
                <span className="uiBadge uiBadge--warning">Закъсня: {overview?.attendance?.late || 0}</span>
                <span className="uiBadge uiBadge--danger">Отсъства: {overview?.attendance?.absent || 0}</span>
                <span className="uiBadge uiBadge--secondary">Извинен: {overview?.attendance?.excused || 0}</span>
              </div>
            </Card>
          </div>

          <Card title="Състезатели в клуба">
            {loading ? (
              <p>Зареждане...</p>
            ) : athletes.length === 0 ? (
              <EmptyState title="Няма състезатели" description="Все още няма състезатели в избрания филтър." />
            ) : visibleAthletes.length === 0 ? (
              <EmptyState title="Няма резултати" description={athleteQuery ? `Няма съвпадения по "${athleteQuery}".` : "Опитай друга ключова дума."} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Треньор</TableHead>
                    <TableHead>Родител</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAthletes.map((a) => {
                    const coach = coaches.find((c) => c.id === a.coach_id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link to={`/teams/athletes/${a.id}`}>
                            <span style={{ fontWeight: 700, cursor: "pointer" }}>{a.athlete_name}</span>
                          </Link>
                        </TableCell>
                        <TableCell>{coach?.name || `#${a.coach_id}`}</TableCell>
                        <TableCell>{a.parent_name || "-"}</TableCell>
                        <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                        <TableCell>
                          <span className={`uiBadge ${a.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                            {a.is_active ? "Активен" : "Неактивен"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button size="sm" onClick={() => setPayAthlete(a)}>Плати</Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const nextCoach = transferCoaches.find((c) => String(c?.id) !== String(a?.coach_id));
                                setTransferAthlete(a);
                                setTransferCoachId(nextCoach ? String(nextCoach.id) : "");
                              }}
                            >
                              Прехвърли
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "tasks" && (
        <>
          <Card title="Последни тренировки в клуба">
            {(overview?.recent_trainings || []).length === 0 ? (
              <EmptyState title="Няма тренировки" description="Все още няма записани тренировки в клуба." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Заглавие</TableHead>
                    <TableHead>Треньор</TableHead>
                    <TableHead>Източник</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Създадена</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview?.recent_trainings || []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.title}</TableCell>
                      <TableCell>{t.coach_name || `#${t.coach_id}`}</TableCell>
                      <TableCell>{t.source}</TableCell>
                      <TableCell>{t.status}</TableCell>
                      <TableCell>{t.created_at ? new Date(t.created_at).toLocaleString("bg-BG") : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card title="Възлагане на тренировка като задача">
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <Input
                as="select"
                value={assignForm.training_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, training_id: e.target.value }))}
              >
                <option value="">Избери тренировка</option>
                {(overview?.recent_trainings || []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.title} ({t.coach_name || `#${t.coach_id}`})
                  </option>
                ))}
              </Input>
              <Input
                as="select"
                multiple
                value={assignForm.assignee_ids}
                onChange={(e) =>
                  setAssignForm((p) => ({
                    ...p,
                    assignee_ids: Array.from(e.target.selectedOptions).map((x) => x.value),
                  }))
                }
              >
                {coaches
                  .filter((c) => c.role === "coach")
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
              </Input>
              <Input
                type="date"
                value={assignForm.due_date}
                onChange={(e) => setAssignForm((p) => ({ ...p, due_date: e.target.value }))}
              />
              <Input
                placeholder="Бележка към задачата"
                value={assignForm.note}
                onChange={(e) => setAssignForm((p) => ({ ...p, note: e.target.value }))}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <Button onClick={assignTraining} disabled={busy}>Възложи</Button>
              </div>
            </div>
          </Card>

          <Card title="Възложени задачи">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Input as="select" value={assignmentStatusFilter} onChange={(e) => setAssignmentStatusFilter(e.target.value)}>
                <option value="all">Всички статуси</option>
                <option value="new">Нови</option>
                <option value="in_progress">В процес</option>
                <option value="done">Готови</option>
              </Input>
              <Input as="select" value={assignmentSort} onChange={(e) => setAssignmentSort(e.target.value)}>
                <option value="newest">Най-нови</option>
                <option value="due_asc">Срок (най-близък)</option>
                <option value="due_desc">Срок (най-далечен)</option>
                <option value="status">По статус</option>
              </Input>
            </div>
            {filteredAssignments.length === 0 ? (
              <EmptyState title="Няма възложени задачи" description="Възложи първата тренировка към треньорите." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тренировка</TableHead>
                    <TableHead>Към</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Краен срок</TableHead>
                    <TableHead>Бележка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.training_title || `#${a.training_id}`}</TableCell>
                      <TableCell>{a.assigned_to_name || `#${a.assigned_to}`}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${a.status === "done" ? "uiBadge--success" : a.status === "in_progress" ? "uiBadge--warning" : "uiBadge--secondary"}`}>
                          {a.status === "done" ? "Готово" : a.status === "in_progress" ? "В процес" : "Нова"}
                        </span>
                      </TableCell>
                      <TableCell>{a.due_date || "-"}</TableCell>
                      <TableCell>{a.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {payAthlete && (
        <div onClick={() => !busy && setPayAthlete(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Плащане: {payAthlete.athlete_name}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input type="month" value={payForm.month_key} onChange={(e) => setPayForm((p) => ({ ...p, month_key: e.target.value }))} />
              <Input
                type="number"
                step="0.01"
                placeholder="Сума"
                value={payForm.amount}
                onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
              />
              <Input
                placeholder="Бележка (по желание)"
                value={payForm.note}
                onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
              />
              <div className="uiModalActions">
                <Button disabled={busy} onClick={savePay}>Запиши</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setPayAthlete(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {transferAthlete && (
        <div onClick={() => !busy && setTransferAthlete(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Прехвърли: {transferAthlete.athlete_name}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input as="select" value={transferCoachId} onChange={(e) => setTransferCoachId(e.target.value)}>
                <option value="">Избери треньор</option>
                {transferCoaches
                  .filter((c) => String(c.id) !== String(transferAthlete.coach_id))
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
              </Input>
              <div className="uiModalActions">
                <Button disabled={busy || !transferCoachId} onClick={transferAth}>Прехвърли</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setTransferAthlete(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
