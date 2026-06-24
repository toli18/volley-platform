import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const VALID_TABS = ["athletes", "tasks", "schedule", "method"];

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";
import CompetitionEventModal from "../components/schedule/CompetitionEventModal";
import ClubHeadMethodSection from "../components/clubHead/ClubHeadMethodSection";
import PlatformBrandBlock from "../components/shared/PlatformBrandBlock";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { AMOUNT_INPUT_PLACEHOLDER, formatMoney } from "../utils/currency";
import { COMPETITION_KIND_OPTIONS, competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";

const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const todayDate = () => new Date().toISOString().slice(0, 10);
const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayLabel = (w) => ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"][Number(w)] || "—";

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

const normalizeRole = (user) => {
  const r = user?.role;
  if (r == null || r === undefined) return "";
  if (typeof r === "object" && r !== null && "value" in r) return String(r.value).toLowerCase();
  return String(r).toLowerCase();
};

export default function ClubHeadDashboard() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const isHeadCoach = normalizeRole(user) === "club_head_coach";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t) ? t : "athletes";
  });
  const [monthKey, setMonthKey] = useState(nowMonth());
  const [period, setPeriod] = useState(() => monthRangeForKey(nowMonth()));
  const [overview, setOverview] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [coachFilter, setCoachFilter] = useState("");
  const [athleteQuery, setAthleteQuery] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [assignmentCoachFilter, setAssignmentCoachFilter] = useState("");
  const [assignmentUpdatedFrom, setAssignmentUpdatedFrom] = useState("");
  const [assignmentUpdatedTo, setAssignmentUpdatedTo] = useState("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");
  const [assignmentSort, setAssignmentSort] = useState("newest");
  const [expFeesFrom, setExpFeesFrom] = useState(nowMonth());
  const [expFeesTo, setExpFeesTo] = useState(nowMonth());
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
  const [teams, setTeams] = useState([]);
  const [scheduleRules, setScheduleRules] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [scheduleFrom, setScheduleFrom] = useState(todayDate());
  const [scheduleTo, setScheduleTo] = useState(addDays(todayDate(), 6));
  const [scheduleCoachFilter, setScheduleCoachFilter] = useState("");
  const [scheduleTeamFilter, setScheduleTeamFilter] = useState("");
  const [scheduleLocationFilter, setScheduleLocationFilter] = useState("");
  const [scheduleForm, setScheduleForm] = useState({
    team_id: "",
    coach_id: "",
    location: "",
    weekday: "0",
    start_time: "18:00",
    end_time: "19:30",
    effective_from: todayDate(),
    effective_to: "",
    is_active: true,
  });
  const [scheduleEditRuleId, setScheduleEditRuleId] = useState(null);
  const [compOpen, setCompOpen] = useState(false);
  const [compEditId, setCompEditId] = useState(null);
  const [compForm, setCompForm] = useState({
    team_id: "",
    coach_id: "",
    date: todayDate(),
    location: "",
    start_time: "10:00",
    end_time: "12:00",
    competition_kind: COMPETITION_KIND_OPTIONS[0].value,
    notes: "",
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

  const loadSchedule = async () => {
    const params = { from: scheduleFrom, to: scheduleTo };
    if (scheduleCoachFilter) params.coach_id = Number(scheduleCoachFilter);
    if (scheduleTeamFilter) params.team_id = Number(scheduleTeamFilter);
    if (scheduleLocationFilter.trim()) params.location = scheduleLocationFilter.trim();
    const [occRes, rulesRes, teamsRes] = await Promise.all([
      axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, { params }),
      axiosInstance.get(API_PATHS.SCHEDULE_RULES_LIST),
      axiosInstance.get(API_PATHS.TEAMS_LIST),
    ]);
    setScheduleItems(Array.isArray(occRes.data?.items) ? occRes.data.items : []);
    setScheduleRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
    setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
  };

  const load = async () => {
    try {
      setBusy(true);
      const assignParams = {};
      if (assignmentCoachFilter) assignParams.assigned_to = Number(assignmentCoachFilter);
      if (assignmentUpdatedFrom) assignParams.updated_from = assignmentUpdatedFrom;
      if (assignmentUpdatedTo) assignParams.updated_to = assignmentUpdatedTo;
      const [overviewRes, athletesRes, assignmentsRes] = await Promise.all([
        axiosInstance.get(API_PATHS.CLUB_OVERVIEW, {
          params: { month_key: monthKey, from_date: period.from_date, to_date: period.to_date },
        }),
        axiosInstance.get(API_PATHS.CLUB_ATHLETES, {
          params: coachFilter ? { coach_id: Number(coachFilter) } : {},
        }),
        axiosInstance.get(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_LIST, { params: assignParams }),
      ]);
      setOverview(overviewRes.data || null);
      setAthletes(Array.isArray(athletesRes.data) ? athletesRes.data : []);
      setAssignments(Array.isArray(assignmentsRes.data) ? assignmentsRes.data : []);
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isHeadCoach) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, isHeadCoach]);

  const downloadClubBlob = async (path, params, filename) => {
    try {
      setBusy(true);
      const res = await axiosInstance.get(path, { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Файлът е изтеглен.");
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при изтегляне на файла."));
    } finally {
      setBusy(false);
    }
  };

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

  const saveScheduleRule = async () => {
    const payload = {
      team_id: Number(scheduleForm.team_id),
      coach_id: Number(scheduleForm.coach_id),
      location: scheduleForm.location.trim(),
      weekday: Number(scheduleForm.weekday),
      start_time: scheduleForm.start_time,
      end_time: scheduleForm.end_time,
      effective_from: scheduleForm.effective_from,
      effective_to: scheduleForm.effective_to || null,
      is_active: Boolean(scheduleForm.is_active),
    };
    if (!payload.team_id || !payload.coach_id || !payload.location || !payload.effective_from) {
      toast.error("Попълни отбор, треньор, зала и начална дата.");
      return;
    }
    try {
      setBusy(true);
      if (scheduleEditRuleId) {
        await axiosInstance.put(API_PATHS.SCHEDULE_RULE_UPDATE(scheduleEditRuleId), payload);
        toast.success("Графикът е обновен.");
      } else {
        await axiosInstance.post(API_PATHS.SCHEDULE_RULES_CREATE, payload);
        toast.success("Графикът е създаден.");
      }
      setScheduleEditRuleId(null);
      setScheduleForm((prev) => ({ ...prev, location: "", team_id: "", coach_id: "" }));
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при запис на графика."));
    } finally {
      setBusy(false);
    }
  };

  const editScheduleRule = (r) => {
    setScheduleEditRuleId(r.id);
    setScheduleForm({
      team_id: String(r.team_id ?? ""),
      coach_id: String(r.coach_id ?? ""),
      location: r.location || "",
      weekday: String(r.weekday ?? 0),
      start_time: r.start_time || "18:00",
      end_time: r.end_time || "19:30",
      effective_from: r.effective_from || todayDate(),
      effective_to: r.effective_to || "",
      is_active: Boolean(r.is_active),
    });
  };

  const deleteScheduleRule = async (ruleId) => {
    if (!window.confirm("Да изтрия ли това правило от графика?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_RULE_DELETE(ruleId));
      toast.success("Графикът е изтрит.");
      if (scheduleEditRuleId === ruleId) {
        setScheduleEditRuleId(null);
      }
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при изтриване на графика."));
    } finally {
      setBusy(false);
    }
  };

  const saveCompetition = async () => {
    if (!compForm.team_id || !compForm.coach_id || !compForm.location.trim()) {
      toast.error("Попълни отбор, треньор и място.");
      return;
    }
    const payload = {
      team_id: Number(compForm.team_id),
      coach_id: Number(compForm.coach_id),
      date: compForm.date,
      location: compForm.location.trim(),
      start_time: compForm.start_time,
      end_time: compForm.end_time,
      competition_kind: compForm.competition_kind,
      notes: compForm.notes.trim() || null,
    };
    try {
      setBusy(true);
      if (compEditId) {
        await axiosInstance.put(API_PATHS.SCHEDULE_COMPETITION_UPDATE(compEditId), payload);
        toast.success("Състезанието е обновено.");
      } else {
        await axiosInstance.post(API_PATHS.SCHEDULE_COMPETITION_CREATE, payload);
        toast.success("Състезанието е добавено.");
      }
      setCompOpen(false);
      setCompEditId(null);
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при запис на състезание."));
    } finally {
      setBusy(false);
    }
  };

  const editCompetitionOccurrence = (it) => {
    setCompEditId(Number(it.competition_id));
    setCompForm({
      team_id: String(it.team_id || ""),
      coach_id: String(it.coach_id || ""),
      date: it.date,
      location: it.location || "",
      start_time: it.start_time || "10:00",
      end_time: it.end_time || "12:00",
      competition_kind: it.competition_kind || COMPETITION_KIND_OPTIONS[0].value,
      notes: "",
    });
    setCompOpen(true);
  };

  const deleteCompetition = async () => {
    if (!compEditId || !window.confirm("Да изтрия ли състезанието?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_COMPETITION_DELETE(compEditId));
      toast.success("Състезанието е изтрито.");
      setCompOpen(false);
      setCompEditId(null);
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при изтриване."));
    } finally {
      setBusy(false);
    }
  };

  const cancelOccurrence = async (item) => {
    if (isCompetitionEvent(item)) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(item.rule_id), {
        date: item.date,
        kind: "cancelled",
      });
      toast.success("Тренировката за избраната дата е отменена.");
      await loadSchedule();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при отмяна на тренировка."));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="uiPage">
        <PageHero title="Главен треньор" subtitle="Зареждане на профил…" />
      </div>
    );
  }

  if (!isHeadCoach) {
    return (
      <div className="uiPage">
        <PageHero title="Главен треньор" subtitle="Нямате достъп до този модул." />
        <EmptyState
          title="Достъпът е ограничен"
          description="Тази страница е само за потребители с роля „Главен треньор на клуб“. Ако профилът ви е обновен наскоро, излезте и влезте отново."
        />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <header className="portalShellHeader portalShellHeader--embedded">
        <div className="portalShellHeaderInner">
          <PlatformBrandBlock subtitle="Главен треньор" />
        </div>
      </header>
      <PageHero
        title="Клубен панел"
        subtitle="Състезатели, такси, присъствие и тренировки."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant={tab === "athletes" ? "primary" : "secondary"} onClick={() => setTab("athletes")}>
              Състезатели
            </Button>
            <Button variant={tab === "tasks" ? "primary" : "secondary"} onClick={() => setTab("tasks")}>
              Задачи
            </Button>
            <Button variant={tab === "schedule" ? "primary" : "secondary"} onClick={() => setTab("schedule")}>
              График
            </Button>
            <Button variant={tab === "method" ? "primary" : "secondary"} onClick={() => setTab("method")}>
              Методика БФВ
            </Button>
          </div>
        }
      />

      {tab === "athletes" && (
        <>
          <Card title="Филтри и обновяване">
            <div className="clubHeadFilterGrid">
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
              <div className="clubHeadFilterActions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <Button onClick={load} disabled={busy} className="clubHeadRefreshBtn">
                  {busy ? "Обновяване..." : "Обнови"}
                </Button>
              </div>
            </div>
          </Card>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Card title="Месечни такси">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="uiBadge">Общо: {overview?.fees?.total_athletes || 0}</span>
                <span className="uiBadge uiBadge--success">Платили: {overview?.fees?.paid_athletes || 0}</span>
                <span className="uiBadge uiBadge--danger">Неплатили: {overview?.fees?.unpaid_athletes || 0}</span>
                <span className="uiBadge uiBadge--info">Сума: {formatMoney(overview?.fees?.total_paid_amount)}</span>
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

          <Card title="Експорт за клуба">
            <p style={{ margin: "0 0 10px", color: "#475569", fontSize: 14 }}>
              Изтегляне на Excel или PDF за избран период (само за главен треньор).
            </p>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>Месечни такси</strong>
                <Input type="month" value={expFeesFrom} onChange={(e) => setExpFeesFrom(e.target.value)} />
                <Input type="month" value={expFeesTo} onChange={(e) => setExpFeesTo(e.target.value)} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      downloadClubBlob(API_PATHS.CLUB_REPORT_FEES_XLSX, { from_month: expFeesFrom, to_month: expFeesTo }, `klub_taksi_${expFeesFrom}_${expFeesTo}.xlsx`)
                    }
                  >
                    Такси Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      downloadClubBlob(API_PATHS.CLUB_REPORT_FEES_PDF, { from_month: expFeesFrom, to_month: expFeesTo }, `klub_taksi_${expFeesFrom}_${expFeesTo}.pdf`)
                    }
                  >
                    Такси PDF
                  </Button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <strong style={{ fontSize: 13 }}>Присъствие</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  Ползва периода от таблото: {period.from_date} – {period.to_date} (вързан с избрания месец по-горе).
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      downloadClubBlob(
                        API_PATHS.CLUB_REPORT_ATTENDANCE_XLSX,
                        { from_date: period.from_date, to_date: period.to_date },
                        `klub_prisastvie_${period.from_date}_${period.to_date}.xlsx`
                      )
                    }
                  >
                    Присъствие Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      downloadClubBlob(
                        API_PATHS.CLUB_REPORT_ATTENDANCE_PDF,
                        { from_date: period.from_date, to_date: period.to_date },
                        `klub_prisastvie_${period.from_date}_${period.to_date}.pdf`
                      )
                    }
                  >
                    Присъствие PDF
                  </Button>
                </div>
              </div>
            </div>
          </Card>

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
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 12 }}>
              <Input as="select" value={assignmentCoachFilter} onChange={(e) => setAssignmentCoachFilter(e.target.value)}>
                <option value="">Всички треньори (към)</option>
                {coaches
                  .filter((c) => ["coach", "club_head_coach"].includes(String(c?.role || "").toLowerCase()))
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
              </Input>
              <Input type="date" value={assignmentUpdatedFrom} onChange={(e) => setAssignmentUpdatedFrom(e.target.value)} />
              <Input type="date" value={assignmentUpdatedTo} onChange={(e) => setAssignmentUpdatedTo(e.target.value)} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <Button size="sm" variant="secondary" onClick={() => load()} disabled={busy}>
                  Обнови списъка
                </Button>
              </div>
            </div>
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
                    <TableHead>Отчет (готово)</TableHead>
                    <TableHead>Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link to={`/trainings/${a.training_id}`} style={{ fontWeight: 700 }}>
                          {a.training_title || `#${a.training_id}`}
                        </Link>
                      </TableCell>
                      <TableCell>{a.assigned_to_name || `#${a.assigned_to}`}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${a.status === "done" ? "uiBadge--success" : a.status === "in_progress" ? "uiBadge--warning" : "uiBadge--secondary"}`}>
                          {a.status === "done" ? "Готово" : a.status === "in_progress" ? "В процес" : "Нова"}
                        </span>
                      </TableCell>
                      <TableCell>{a.due_date || "-"}</TableCell>
                      <TableCell>{a.note || "-"}</TableCell>
                      <TableCell>{a.completion_note || "—"}</TableCell>
                      <TableCell>
                        <Button as={Link} to={`/trainings/${a.training_id}`} size="sm" variant="secondary">
                          Преглед
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "schedule" && (
        <>
          <Card title="Филтри за календара">
            <div className="clubHeadFilterGrid">
              <Input type="date" value={scheduleFrom} onChange={(e) => setScheduleFrom(e.target.value)} />
              <Input type="date" value={scheduleTo} onChange={(e) => setScheduleTo(e.target.value)} />
              <Input as="select" value={scheduleCoachFilter} onChange={(e) => setScheduleCoachFilter(e.target.value)}>
                <option value="">Всички треньори</option>
                {coaches.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </Input>
              <Input as="select" value={scheduleTeamFilter} onChange={(e) => setScheduleTeamFilter(e.target.value)}>
                <option value="">Всички отбори</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </Input>
              <Input
                placeholder="Филтър по зала"
                value={scheduleLocationFilter}
                onChange={(e) => setScheduleLocationFilter(e.target.value)}
              />
              <div className="clubHeadFilterActions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <Button variant="secondary" disabled={busy} onClick={loadSchedule}>Покажи</Button>
              </div>
            </div>
          </Card>

          <Card title={scheduleEditRuleId ? "Редакция на правило" : "Ново правило за графика"}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <Input as="select" value={scheduleForm.team_id} onChange={(e) => setScheduleForm((p) => ({ ...p, team_id: e.target.value }))}>
                <option value="">Избери отбор</option>
                {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </Input>
              <Input as="select" value={scheduleForm.coach_id} onChange={(e) => setScheduleForm((p) => ({ ...p, coach_id: e.target.value }))}>
                <option value="">Избери треньор</option>
                {coaches.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </Input>
              <Input placeholder="Зала" value={scheduleForm.location} onChange={(e) => setScheduleForm((p) => ({ ...p, location: e.target.value }))} />
              <Input as="select" value={scheduleForm.weekday} onChange={(e) => setScheduleForm((p) => ({ ...p, weekday: e.target.value }))}>
                <option value="0">Понеделник</option>
                <option value="1">Вторник</option>
                <option value="2">Сряда</option>
                <option value="3">Четвъртък</option>
                <option value="4">Петък</option>
                <option value="5">Събота</option>
                <option value="6">Неделя</option>
              </Input>
              <Input type="time" value={scheduleForm.start_time} onChange={(e) => setScheduleForm((p) => ({ ...p, start_time: e.target.value }))} />
              <Input type="time" value={scheduleForm.end_time} onChange={(e) => setScheduleForm((p) => ({ ...p, end_time: e.target.value }))} />
              <Input type="date" value={scheduleForm.effective_from} onChange={(e) => setScheduleForm((p) => ({ ...p, effective_from: e.target.value }))} />
              <Input type="date" value={scheduleForm.effective_to} onChange={(e) => setScheduleForm((p) => ({ ...p, effective_to: e.target.value }))} />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={scheduleForm.is_active}
                  onChange={(e) => setScheduleForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Активно правило
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                <Button onClick={saveScheduleRule} disabled={busy}>{scheduleEditRuleId ? "Запази" : "Създай"}</Button>
                {scheduleEditRuleId ? (
                  <Button variant="secondary" onClick={() => setScheduleEditRuleId(null)} disabled={busy}>Отказ</Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card
            title="Състезание"
            subtitle="Еднократно събитие — първенство, турнир, контролна или приятелска"
            actions={
              <Button
                onClick={() => {
                  setCompEditId(null);
                  setCompForm((p) => ({ ...p, date: scheduleFrom, team_id: "", coach_id: "", location: "" }));
                  setCompOpen(true);
                }}
                disabled={busy}
              >
                + Ново състезание
              </Button>
            }
          >
            <p className="uiHint" style={{ margin: 0 }}>
              Състезанията се виждат в календара по-долу и в родителския портал (оранжеви блокове).
            </p>
          </Card>

          <Card title="Календар (тренировки и състезания)">
            {scheduleItems.length === 0 ? (
              <EmptyState title="Няма събития в периода" description="Промени филтъра или създай правило / състезание." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Ден</TableHead>
                    <TableHead>Час</TableHead>
                    <TableHead>Място</TableHead>
                    <TableHead>Треньор</TableHead>
                    <TableHead>Отбор / вид</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleItems.map((it, idx) => {
                    const isComp = isCompetitionEvent(it);
                    return (
                      <TableRow key={isComp ? `comp-${it.competition_id}-${idx}` : `${it.rule_id}-${it.date}-${it.start_time}`}>
                        <TableCell>{isComp ? "Състезание" : "Тренировка"}</TableCell>
                        <TableCell>{it.date}</TableCell>
                        <TableCell>{weekdayLabel(it.weekday)}</TableCell>
                        <TableCell>{it.start_time}–{it.end_time}</TableCell>
                        <TableCell>{it.location}</TableCell>
                        <TableCell>{it.coach_name || `#${it.coach_id}`}</TableCell>
                        <TableCell>{isComp ? competitionKindLabel(it) : it.team_name || `#${it.team_id}`}</TableCell>
                        <TableCell>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {isComp ? (
                              <Button size="sm" variant="secondary" onClick={() => editCompetitionOccurrence(it)} disabled={busy}>
                                Редакция
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => cancelOccurrence(it)} disabled={busy}>
                                Отмени за дата
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card title="Правила (редакция/изтриване)">
            {scheduleRules.length === 0 ? (
              <EmptyState title="Няма правила" description="Създай първото правило за графика." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ден</TableHead>
                    <TableHead>Час</TableHead>
                    <TableHead>Зала</TableHead>
                    <TableHead>Отбор</TableHead>
                    <TableHead>Треньор</TableHead>
                    <TableHead>Период</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{weekdayLabel(r.weekday)}</TableCell>
                      <TableCell>{r.start_time}–{r.end_time}</TableCell>
                      <TableCell>{r.location}</TableCell>
                      <TableCell>{teams.find((t) => Number(t.id) === Number(r.team_id))?.name || `#${r.team_id}`}</TableCell>
                      <TableCell>{coaches.find((c) => Number(c.id) === Number(r.coach_id))?.name || `#${r.coach_id}`}</TableCell>
                      <TableCell>{r.effective_from} → {r.effective_to || "без край"}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${r.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>{r.is_active ? "Активно" : "Неактивно"}</span>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button size="sm" variant="secondary" onClick={() => editScheduleRule(r)}>Редактирай</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteScheduleRule(r.id)} disabled={busy}>Изтрий</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "method" && <ClubHeadMethodSection teams={teams} coaches={transferCoaches} />}

      {payAthlete && (
        <div onClick={() => !busy && setPayAthlete(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Плащане: {payAthlete.athlete_name}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input type="month" value={payForm.month_key} onChange={(e) => setPayForm((p) => ({ ...p, month_key: e.target.value }))} />
              <Input
                type="number"
                step="0.01"
                placeholder={AMOUNT_INPUT_PLACEHOLDER}
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

      <CompetitionEventModal
        open={compOpen}
        busy={busy}
        isHeadCoach
        teams={teams}
        coaches={coaches}
        form={compForm}
        setForm={setCompForm}
        editId={compEditId}
        onClose={() => {
          if (!busy) {
            setCompOpen(false);
            setCompEditId(null);
          }
        }}
        onSave={saveCompetition}
        onDelete={deleteCompetition}
      />

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
