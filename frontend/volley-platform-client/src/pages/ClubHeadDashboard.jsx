import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const todayDate = () => new Date().toISOString().slice(0, 10);

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
  const [monthKey, setMonthKey] = useState(nowMonth());
  const [period, setPeriod] = useState({ from_date: todayDate(), to_date: todayDate() });
  const [overview, setOverview] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [coachFilter, setCoachFilter] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");
  const [assignmentSort, setAssignmentSort] = useState("newest");
  const [assignForm, setAssignForm] = useState({
    training_id: "",
    assignee_ids: [],
    due_date: "",
    note: "",
  });

  const coaches = useMemo(() => overview?.coaches || [], [overview]);
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
      />

      <Card title="Филтри и обновяване">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
          <Input type="date" value={period.from_date} onChange={(e) => setPeriod((p) => ({ ...p, from_date: e.target.value }))} />
          <Input type="date" value={period.to_date} onChange={(e) => setPeriod((p) => ({ ...p, to_date: e.target.value }))} />
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
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Състезател</TableHead>
                <TableHead>Треньор</TableHead>
                <TableHead>Родител</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {athletes.map((a) => {
                const coach = coaches.find((c) => c.id === a.coach_id);
                return (
                  <TableRow key={a.id}>
                    <TableCell>{a.athlete_name}</TableCell>
                    <TableCell>{coach?.name || `#${a.coach_id}`}</TableCell>
                    <TableCell>{a.parent_name || "-"}</TableCell>
                    <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                    <TableCell>
                      <span className={`uiBadge ${a.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                        {a.is_active ? "Активен" : "Неактивен"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

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
    </div>
  );
}
