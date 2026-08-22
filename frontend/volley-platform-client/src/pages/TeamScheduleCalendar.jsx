import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";
import CompetitionEventModal from "../components/schedule/CompetitionEventModal";
import MobileDrawer from "../components/shell/MobileDrawer";
import CoachSpeedFab from "../components/coachMobile/CoachSpeedFab";
import { Button, Card, EmptyState, Input, Modal, OverflowActionSheet, PageHero } from "../components/ui";
import { normalizeError } from "../utils/normalizeError";
import useMediaQuery from "../utils/useMediaQuery";
import {
  COMPETITION_KIND_OPTIONS,
  competitionBlockStyle,
  competitionKindLabel,
  isCompetitionEvent,
} from "../utils/competitionKinds";
import { normalizeCardIndexes } from "../utils/competitionFormHelpers";

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKeyNow = () => todayKey().slice(0, 7);

const shiftMonthKey = (monthKey, delta) => {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKeyNow();
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonthLabel = (monthKey) => {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "—";
  return new Date(y, m - 1, 1).toLocaleDateString("bg-BG", { month: "long", year: "numeric" });
};

const dayNames = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"];
const teamColorPalette = [
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#78350f" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d" },
  { bg: "#cffafe", border: "#67e8f9", text: "#164e63" },
  { bg: "#fae8ff", border: "#e879f9", text: "#701a75" },
  { bg: "#ecfccb", border: "#bef264", text: "#365314" },
];

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

const roleValue = (user) => {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
};

const buildCalendarCells = (monthKey) => {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
  const first = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const firstWeekdayMonday0 = (first.getDay() + 6) % 7; // Mon=0..Sun=6
  const total = Math.ceil((firstWeekdayMonday0 + lastDate) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const dayNum = i - firstWeekdayMonday0 + 1;
    if (dayNum < 1 || dayNum > lastDate) {
      cells.push({ isCurrentMonth: false, date: "", day: "" });
      continue;
    }
    const date = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    cells.push({ isCurrentMonth: true, date, day: dayNum });
  }
  return cells;
};

const teamColorFor = (teamId) => {
  const num = Number(teamId || 0);
  const idx = Math.abs(Number.isFinite(num) ? num : 0) % teamColorPalette.length;
  return teamColorPalette[idx];
};

const occurrenceAttendanceTo = (it) =>
  `/teams/${it.team_id}/attendance?date=${encodeURIComponent(it.date)}&title=${encodeURIComponent(`Тренировка ${it.start_time}`)}`;

const defaultCompetitionForm = (date, coachId) => ({
  team_id: "",
  card_index_id: "",
  coach_id: coachId ? String(coachId) : "",
  date: date || todayKey(),
  location: "",
  start_time: "10:00",
  end_time: "12:00",
  competition_kind: COMPETITION_KIND_OPTIONS[0].value,
  notes: "",
});

const occurrenceKey = (it, i) =>
  isCompetitionEvent(it)
    ? `comp-${it.competition_id}-${it.date}-${i}`
    : `rule-${it.rule_id}-${it.date}-${it.start_time}-${i}`;

const KIND_FILTER_STORAGE_KEY = "coachScheduleKindFilter";

function readStoredKindFilter() {
  try {
    const v = localStorage.getItem(KIND_FILTER_STORAGE_KEY);
    if (v === "training" || v === "match") return v;
  } catch {
    /* ignore */
  }
  return "";
}

export default function TeamScheduleCalendar() {
  const [searchParams] = useSearchParams();
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
  const [kindFilter, setKindFilter] = useState(readStoredKindFilter);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [calendarView, setCalendarView] = useState("list");
  const isCalendarShell = useMediaQuery("(max-width: 767px)");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState("");
  const calendarWrapRef = useRef(null);

  const [compOpen, setCompOpen] = useState(false);
  const [compEditId, setCompEditId] = useState(null);
  const [compForm, setCompForm] = useState(() => defaultCompetitionForm(todayKey(), ""));
  const [cardIndexes, setCardIndexes] = useState([]);

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
  /** За PUT на правило: оригинален effective_from и weekday от сървъра */
  const [editRuleMeta, setEditRuleMeta] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    team_id: "",
    coach_id: "",
    location: "",
    start_time: "",
    end_time: "",
    repeat_weekly: false,
    repeat_to: "",
  });

  const currentUserId = Number(user?.id || 0);
  const effectiveCoachFilter = coachFilter;

  useEffect(() => {
    try {
      if (kindFilter === "training" || kindFilter === "match") {
        localStorage.setItem(KIND_FILTER_STORAGE_KEY, kindFilter);
      } else {
        localStorage.removeItem(KIND_FILTER_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [kindFilter]);

  const visibleItems = useMemo(() => {
    if (kindFilter === "training") return items.filter((it) => !isCompetitionEvent(it));
    if (kindFilter === "match") return items.filter((it) => isCompetitionEvent(it));
    return items;
  }, [items, kindFilter]);

  const itemsByDate = useMemo(() => {
    const map = new Map();
    for (const it of visibleItems) {
      const arr = map.get(it.date) || [];
      arr.push(it);
      map.set(it.date, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return map;
  }, [visibleItems]);

  const calendarCells = useMemo(() => buildCalendarCells(monthKey), [monthKey]);
  const selectedDayItems = selectedDate ? (itemsByDate.get(selectedDate) || []) : [];

  const scheduleListSorted = useMemo(() => {
    return [...visibleItems].sort((a, b) => {
      const c = String(a.date).localeCompare(String(b.date));
      if (c !== 0) return c;
      return String(a.start_time).localeCompare(String(b.start_time));
    });
  }, [visibleItems]);

  const myTeamIds = useMemo(
    () => teams.filter((t) => Number(t.coach_id) === currentUserId).map((t) => Number(t.id)),
    [teams, currentUserId]
  );
  const teamsForCompetition = useMemo(
    () => (isHeadCoach ? teams : teams.filter((t) => myTeamIds.includes(Number(t.id)))),
    [teams, isHeadCoach, myTeamIds]
  );
  const canEditItem = (it) => {
    if (isCompetitionEvent(it)) return isHeadCoach;
    if (isHeadCoach) return true;
    return Number(it.coach_id) === currentUserId;
  };
  const canEditOccurrence = (it) => !isCompetitionEvent(it) && canEditItem(it);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (teamFilter) n += 1;
    if (coachFilter) n += 1;
    if (locationFilter.trim()) n += 1;
    if (kindFilter) n += 1;
    return n;
  }, [teamFilter, coachFilter, locationFilter, kindFilter]);

  const filterFields = (
    <>
      <Input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
      <Input as="select" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Тип събитие">
        <option value="">Тренировки и мачове</option>
        <option value="training">Само тренировки</option>
        <option value="match">Само мачове</option>
      </Input>
      <Input as="select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
        <option value="">Всички отбори</option>
        {teams.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.name}
          </option>
        ))}
      </Input>
      {coaches.length > 0 ? (
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
    </>
  );

  const loadMeta = async () => {
    const year = new Date().getFullYear();
    const [teamsRes, coachesRes, seasonRes, cardRes] = await Promise.all([
      axiosInstance.get(API_PATHS.TEAMS_LIST),
      axiosInstance.get(API_PATHS.FEES_COACHES_LIST),
      axiosInstance
        .get(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS, { params: { year } })
        .catch(() => ({ data: null })),
      axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_LOCAL).catch(() => ({ data: null })),
    ]);
    setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
    setCoaches(Array.isArray(coachesRes?.data) ? coachesRes.data : []);
    const fromSeason = normalizeCardIndexes(seasonRes?.data?.slots || seasonRes?.data);
    const fromLocal = normalizeCardIndexes(cardRes?.data);
    const byId = new Map();
    for (const row of [...fromSeason, ...fromLocal]) {
      byId.set(String(row.id), row);
    }
    setCardIndexes([...byId.values()]);
    setMetaLoaded(true);
  };

  const loadOccurrences = async () => {
    const { from, to } = monthRange(monthKey);
    const params = { from, to, include_cancelled: true };
    if (effectiveCoachFilter) params.coach_id = Number(effectiveCoachFilter);
    if (teamFilter) params.team_id = Number(teamFilter);
    if (locationFilter.trim()) params.location = locationFilter.trim();
    const occRes = await axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, { params });
    setItems(Array.isArray(occRes.data?.items) ? occRes.data.items : []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setBusy(true);
        await loadMeta();
      } catch (err) {
        toast.error(normalizeError(err, "Неуспешно зареждане на месечния график."));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [isHeadCoach]);

  useEffect(() => {
    const tid = searchParams.get("team_id");
    if (tid) setTeamFilter(String(tid));
  }, [searchParams]);

  useEffect(() => {
    if (!metaLoaded) return;
    const run = async () => {
      try {
        setBusy(true);
        await loadOccurrences();
      } catch (err) {
        toast.error(normalizeError(err, "Неуспешно зареждане на графика."));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [metaLoaded, monthKey, teamFilter, effectiveCoachFilter, locationFilter]);

  useEffect(() => {
    if (calendarView === "list") setSelectedDate("");
  }, [calendarView]);

  useEffect(() => {
    if (isCalendarShell && calendarView === "grid") setCalendarView("list");
  }, [isCalendarShell, calendarView]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    const onDocPointerDown = (event) => {
      const root = calendarWrapRef.current;
      if (!root) return;
      if (!root.contains(event.target)) {
        setSelectedDate("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [selectedDate]);

  const openEdit = async (it) => {
    setEditOcc(it);
    setEditRuleMeta(null);
    setEditForm({
      date: it.date,
      team_id: String(it.team_id || ""),
      coach_id: String(it.coach_id || ""),
      location: it.location || "",
      start_time: it.start_time || "18:00",
      end_time: it.end_time || "19:30",
      repeat_weekly: false,
      repeat_to: "",
    });
    try {
      const res = await axiosInstance.get(API_PATHS.SCHEDULE_RULES_LIST);
      const rules = Array.isArray(res.data) ? res.data : [];
      const r = rules.find((x) => Number(x.id) === Number(it.rule_id));
      if (r) {
        setEditRuleMeta({
          effective_from: r.effective_from || it.date,
          weekday: Number(r.weekday ?? it.weekday ?? 0),
        });
      } else {
        setEditRuleMeta({ effective_from: it.date, weekday: Number(it.weekday ?? 0) });
      }
    } catch {
      setEditRuleMeta({ effective_from: it.date, weekday: Number(it.weekday ?? 0) });
    }
  };

  const openAddForDate = (date) => {
    setAddForm((p) => ({ ...p, date }));
    setAddOpen(true);
  };

  const saveOverride = async () => {
    if (!editOcc) return;
    if (!editForm.team_id || !editForm.coach_id || !editForm.location.trim()) {
      toast.error("Попълни отбор, треньор и зала.");
      return;
    }
    const coachId = isHeadCoach ? Number(editForm.coach_id || 0) : currentUserId;
    if (!coachId) {
      toast.error("Избери треньор.");
      return;
    }
    const d = new Date(`${editForm.date}T00:00:00`);
    const jsDay = d.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;

    let repeatRuleUpdate = null;
    if (editForm.repeat_weekly) {
      const repeatTo = String(editForm.repeat_to || "").trim();
      if (!repeatTo) {
        toast.error("Въведи дата „Повтаряй до“ за повтарящите се тренировки.");
        return;
      }
      const meta = editRuleMeta || { effective_from: editOcc.date, weekday: Number(editOcc.weekday ?? 0) };
      const oldWd = Number(meta.weekday);
      let effective_from = String(meta.effective_from || editForm.date);
      if (weekday !== oldWd) {
        effective_from = editForm.date;
      } else if (editForm.date < effective_from) {
        effective_from = editForm.date;
      }
      if (repeatTo < effective_from) {
        toast.error("Датата „до“ трябва да е след или равна на началото на повторенията.");
        return;
      }
      repeatRuleUpdate = { effective_from, effective_to: repeatTo };
    }

    try {
      setBusy(true);
      if (repeatRuleUpdate) {
        const { effective_from, effective_to } = repeatRuleUpdate;
        if (editOcc.exception_id) {
          await axiosInstance.delete(API_PATHS.SCHEDULE_EXCEPTION_DELETE(editOcc.exception_id));
        }
        await axiosInstance.put(API_PATHS.SCHEDULE_RULE_UPDATE(editOcc.rule_id), {
          team_id: Number(editForm.team_id),
          coach_id: coachId,
          location: editForm.location.trim(),
          weekday,
          start_time: editForm.start_time,
          end_time: editForm.end_time,
          effective_from,
          effective_to,
          is_active: true,
        });
        toast.success("Графикът е обновен.");
      } else {
        await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(editOcc.rule_id), {
          date: editForm.date,
          kind: "override",
          team_id: Number(editForm.team_id),
          coach_id: coachId,
          location: editForm.location.trim(),
          start_time: editForm.start_time,
          end_time: editForm.end_time,
        });
        toast.success("Тренировката е коригирана.");
      }
      setEditOcc(null);
      await loadOccurrences();
    } catch (err) {
      toast.error(
        normalizeError(
          err,
          repeatRuleUpdate ? "Неуспешно обновяване на повтарящото се правило." : "Неуспешна корекция на тренировката.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelOccurrence = async (it) => {
    if (
      !window.confirm(
        `Да отменя ли тренировката на ${it.date} (${it.start_time}–${it.end_time})?\n\nСамо този ден — седмичното правило остава. Можете да я възстановите по-късно.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(it.rule_id), {
        date: it.date,
        kind: "cancelled",
      });
      toast.success("Тренировката е отменена за този ден.");
      await loadOccurrences();
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
      toast.success(it.is_cancelled ? "Тренировката е възстановена." : "Корекцията е премахната.");
      await loadOccurrences();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно възстановяване."));
    } finally {
      setBusy(false);
    }
  };

  const deleteScheduleRule = async (it) => {
    if (
      !window.confirm(
        `Да изтрия ли седмичното правило за „${it.team_name || "отбора"}“ (${it.start_time}–${it.end_time})?\n\nВсички повторения ще изчезнат от графика.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_RULE_DELETE(it.rule_id));
      toast.success("Правилото е изтрито от графика.");
      setSelectedDate("");
      await loadOccurrences();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване на правилото."));
    } finally {
      setBusy(false);
    }
  };

  const getTrainingOverflowActions = (it) => {
    if (!canEditOccurrence(it)) return [];
    const cancelled = Boolean(it.is_cancelled);
    const actions = [];
    if (!cancelled) {
      actions.push({
        key: "edit",
        label: "Коригирай",
        disabled: busy,
        onClick: () => openEdit(it),
      });
      actions.push({
        key: "cancel",
        label: "Отмени",
        disabled: busy,
        onClick: () => cancelOccurrence(it),
      });
      if (it.exception_id) {
        actions.push({
          key: "restore-original",
          label: "Възстанови оригинала",
          disabled: busy,
          onClick: () => restoreOccurrence(it),
        });
      }
    } else {
      actions.push({
        key: "restore",
        label: "Възстанови",
        disabled: busy,
        onClick: () => restoreOccurrence(it),
      });
    }
    actions.push({
      key: "delete",
      label: "Изтрий",
      variant: "danger",
      disabled: busy,
      onClick: () => deleteScheduleRule(it),
    });
    return actions;
  };

  const renderEventActionRow = (it) => {
    const cancelled = Boolean(it.is_cancelled);
    const overflowActions = [];
    if (isCompetitionEvent(it) && canEditItem(it)) {
      overflowActions.push({
        key: "comp-edit",
        label: "Редакция",
        onClick: () => openCompetitionEdit(it),
      });
    }
    overflowActions.push(...getTrainingOverflowActions(it));

    return (
      <>
        {!isCompetitionEvent(it) && !cancelled ? (
          <Link to={occurrenceAttendanceTo(it)}>
            <Button size="sm">Присъствие</Button>
          </Link>
        ) : null}
        {!isCompetitionEvent(it) && cancelled ? (
          <Button size="sm" variant="secondary" disabled title="Тренировката е отменена">
            Отменена
          </Button>
        ) : null}
        {overflowActions.length ? (
          <OverflowActionSheet label="Действия за събитие" actions={overflowActions} />
        ) : null}
      </>
    );
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
    const jsDay = d.getDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    if (addForm.repeat_weekly) {
      const repeatTo = String(addForm.repeat_to || "").trim();
      if (!repeatTo) {
        toast.error("Въведи дата „Повтаряй до“ за повтарящите се тренировки.");
        return;
      }
      if (repeatTo < addForm.date) {
        toast.error("Датата „до“ трябва да е след или равна на датата на тренировката.");
        return;
      }
    }
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
        effective_to: addForm.repeat_weekly ? String(addForm.repeat_to || "").trim() : addForm.date,
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
      await loadOccurrences();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне на тренировка."));
    } finally {
      setBusy(false);
    }
  };

  const openCompetitionForDate = (date) => {
    if (!isHeadCoach) {
      toast.error("Само главният треньор създава състезания. Тимовият лист е в меню Състезания.");
      return;
    }
    setCompEditId(null);
    setCompForm(defaultCompetitionForm(date, isHeadCoach ? "" : currentUserId));
    setCompOpen(true);
  };

  const openCompetitionEdit = (it) => {
    if (!isCompetitionEvent(it)) return;
    setCompEditId(Number(it.competition_id));
    setCompForm({
      team_id: String(it.team_id || ""),
      card_index_id: it.card_index_id ? String(it.card_index_id) : "",
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

  const saveCompetition = async () => {
    if (!compForm.team_id || !compForm.location.trim()) {
      toast.error("Попълни група и място.");
      return;
    }
    const coachId = isHeadCoach ? Number(compForm.coach_id || 0) : currentUserId;
    if (!coachId) {
      toast.error("Избери треньор.");
      return;
    }
    const payload = {
      team_id: Number(compForm.team_id),
      coach_id: coachId,
      date: compForm.date,
      location: compForm.location.trim(),
      start_time: compForm.start_time,
      end_time: compForm.end_time,
      competition_kind: compForm.competition_kind,
      notes: compForm.notes.trim() || null,
      card_index_id: compForm.card_index_id ? Number(compForm.card_index_id) : null,
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
      await loadOccurrences();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно записване на състезание."));
    } finally {
      setBusy(false);
    }
  };

  const deleteCompetition = async () => {
    if (!compEditId) return;
    if (!window.confirm("Изтриване на състезанието?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_COMPETITION_DELETE(compEditId));
      toast.success("Състезанието е изтрито.");
      setCompOpen(false);
      setCompEditId(null);
      await loadOccurrences();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване."));
    } finally {
      setBusy(false);
    }
  };

  const renderScheduleListItem = (it, i) => {
    const cancelled = Boolean(it.is_cancelled);
    return (
      <article
        key={occurrenceKey(it, i)}
        className={`calendarShellEvent${cancelled ? " calendarShellEvent--cancelled" : ""}${isCompetitionEvent(it) ? " calendarShellEvent--comp" : ""}`}
      >
        <div className="calendarShellEventHead">
          <div className={`calendarShellEventTime${cancelled ? " trainingAdjustStruck" : ""}`}>
            {it.date} · {it.start_time}–{it.end_time}
            {cancelled ? " · Отменена" : ""}
          </div>
          <span
            className="calendarShellEventTeam"
            style={{
              borderColor: teamColorFor(it.team_id).border,
              background: teamColorFor(it.team_id).bg,
              color: teamColorFor(it.team_id).text,
            }}
          >
            {isCompetitionEvent(it) ? competitionKindLabel(it) : it.team_name || `Отбор #${it.team_id}`}
          </span>
        </div>
        <div className="calendarShellEventMeta">
          {isCompetitionEvent(it) ? `${it.team_name || ""} · ` : ""}
          {it.location}
          {it.coach_name ? ` · ${it.coach_name}` : ""}
        </div>
        <div className="calendarShellEventActions">
          {renderEventActionRow(it)}
        </div>
      </article>
    );
  };

  const scheduleModals = (
    <>
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        dismissable={!busy}
        title="Добавяне на тренировка"
      >
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
      </Modal>

      <Modal
        open={Boolean(editOcc)}
        onClose={() => setEditOcc(null)}
        dismissable={!busy}
        title="Корекция на тренировка"
      >
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
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(editForm.repeat_weekly)}
              onChange={(e) => setEditForm((p) => ({ ...p, repeat_weekly: e.target.checked }))}
            />
            Повтаряй всяка седмица
          </label>
          {editForm.repeat_weekly ? (
            <Input
              type="date"
              value={editForm.repeat_to}
              onChange={(e) => setEditForm((p) => ({ ...p, repeat_to: e.target.value }))}
              placeholder="Повтаряй до"
            />
          ) : null}
          <div className="uiModalActions">
            <Button disabled={busy} onClick={saveOverride}>Запази корекция</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditOcc(null)}>Отказ</Button>
          </div>
        </div>
      </Modal>

      <CompetitionEventModal
        open={compOpen}
        busy={busy}
        isHeadCoach={isHeadCoach}
        teams={teamsForCompetition}
        coaches={coaches}
        cardIndexes={cardIndexes}
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
    </>
  );

  if (isCalendarShell) {
    return (
      <div className="calendarShell">
        <div className="calendarShellToolbar">
          <button type="button" className="calendarShellNavBtn" onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))} aria-label="Предишен месец">
            ‹
          </button>
          <div className="calendarShellMonth">
            <strong>{formatMonthLabel(monthKey)}</strong>
            <span className="calendarShellMonthCount">{scheduleListSorted.length} събития</span>
          </div>
          <button type="button" className="calendarShellNavBtn" onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))} aria-label="Следващ месец">
            ›
          </button>
          <button
            type="button"
            className={`calendarShellFilterBtn${activeFilterCount ? " is-active" : ""}`}
            onClick={() => setFiltersOpen(true)}
          >
            Филтри{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        <div className="calendarShellBody">
          {busy ? (
            <p className="calendarShellLoading">Зареждане...</p>
          ) : scheduleListSorted.length === 0 ? (
            <EmptyState title="Няма записи" description="Няма тренировки в графика за този месец с текущите филтри." />
          ) : (
            <div className="calendarShellList">{scheduleListSorted.map((it, i) => renderScheduleListItem(it, i))}</div>
          )}
        </div>

        <CoachSpeedFab
          actions={[
            {
              id: "training",
              label: "+ Тренировка",
              primary: true,
              onClick: () => openAddForDate(todayKey()),
            },
            {
              id: "competition",
              label: "+ Състезание",
              onClick: () => openCompetitionForDate(todayKey()),
            },
            { id: "competitions", label: "Състезания / тимов лист", to: "/coach/competitions" },
          ]}
        />

        <MobileDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Филтри на графика">
          <div className="calendarShellFilters">{filterFields}</div>
          <div className="calendarShellFilterActions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTeamFilter("");
                setCoachFilter("");
                setLocationFilter("");
                setKindFilter("");
              }}
            >
              Изчисти
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              Приложи
            </Button>
          </div>
        </MobileDrawer>

        {scheduleModals}
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Месечен график"
        subtitle="Тренировки и състезания. Тимовият лист и филтрите са в Състезания (Клуб & Групи)."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => openAddForDate(todayKey())}>+ Тренировка</Button>
            <Button variant="secondary" onClick={() => openCompetitionForDate(todayKey())}>+ Състезание</Button>
            <Link to="/coach/competitions">
              <Button variant="secondary">Състезания</Button>
            </Link>
          </div>
        }
      />

      <Card title="Филтри">
        <div className="feesFormGrid">{filterFields}</div>
        {activeFilterCount ? (
          <div style={{ marginTop: 10 }}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setTeamFilter("");
                setCoachFilter("");
                setLocationFilter("");
                setKindFilter("");
              }}
            >
              Изчисти филтри
            </Button>
          </div>
        ) : null}
      </Card>

      <Card
        title="Календар"
        subtitle={calendarView === "grid" ? "Месечна мрежа за избрания месец" : "Списък по дата и час за избрания месец"}
        actions={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button size="sm" variant={calendarView === "list" ? "primary" : "secondary"} type="button" onClick={() => setCalendarView("list")}>
              Списък
            </Button>
            <Button
              size="sm"
              variant={calendarView === "grid" ? "primary" : "secondary"}
              type="button"
              className="teamScheduleGridToggle"
              onClick={() => setCalendarView("grid")}
            >
              Мрежа
            </Button>
          </div>
        }
      >
        {busy ? (
          <p>Зареждане...</p>
        ) : calendarView === "list" ? (
          scheduleListSorted.length === 0 ? (
            <EmptyState title="Няма записи" description="Няма тренировки в графика за този месец с текущите филтри." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {scheduleListSorted.map((it, i) => {
                const cancelled = Boolean(it.is_cancelled);
                return (
                <article
                  key={occurrenceKey(it, i)}
                  className={cancelled ? "trainingAdjustCard trainingAdjustCard--cancelled" : undefined}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 12,
                    background: cancelled ? undefined : "#fff",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }} className={cancelled ? "trainingAdjustStruck" : undefined}>
                      {it.date} · {it.start_time}–{it.end_time}
                      {cancelled ? " · Отменена" : ""}
                    </div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 999,
                        border: `1px solid ${teamColorFor(it.team_id).border}`,
                        background: teamColorFor(it.team_id).bg,
                        color: teamColorFor(it.team_id).text,
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {isCompetitionEvent(it) ? competitionKindLabel(it) : it.team_name || `Отбор #${it.team_id}`}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>
                    {isCompetitionEvent(it) ? `${it.team_name || ""} · ` : ""}
                    {it.location}
                    {it.coach_name ? ` · ${it.coach_name}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {renderEventActionRow(it)}
                  </div>
                </article>
                );
              })}
            </div>
          )
        ) : calendarCells.length === 0 ? (
          <EmptyState title="Няма календар за показване" description="Избери валиден месец." />
        ) : (
          <div ref={calendarWrapRef} className="teamScheduleCalendarWrap" style={{ display: "grid", gap: 10 }}>
            <div className="teamScheduleCalendarCols" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 8 }}>
              {dayNames.map((name) => (
                <div key={name} style={{ fontWeight: 700, color: "#39516d", fontSize: 13, textAlign: "center" }}>
                  {name}
                </div>
              ))}
            </div>
            <div className="teamScheduleCalendarCols" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 8 }}>
              {calendarCells.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return <div key={`empty-${idx}`} style={{ minHeight: 110, borderRadius: 10, background: "#f5f7fb" }} />;
                }
                const dayItems = itemsByDate.get(cell.date) || [];
                return (
                  <div
                    key={cell.date}
                    onClick={() => setSelectedDate(cell.date)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDate(cell.date);
                      }
                    }}
                    style={{
                      position: "relative",
                      minHeight: 110,
                      borderRadius: 10,
                      border: selectedDate === cell.date ? "2px solid #0b8f69" : "1px solid #dbe6f3",
                      background: "#fff",
                      textAlign: "left",
                      padding: 8,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong>{cell.day}</strong>
                      <span style={{ fontSize: 11, color: "#6b7f96" }}>{dayItems.length || ""}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {dayItems.slice(0, 2).map((it, i) => {
                        const cancelled = Boolean(it.is_cancelled);
                        return (
                        <Link
                          key={occurrenceKey(it, i)}
                          to={isCompetitionEvent(it) ? "#" : occurrenceAttendanceTo(it)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCompetitionEvent(it)) {
                              e.preventDefault();
                              if (canEditItem(it)) openCompetitionEdit(it);
                            }
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className={cancelled ? "trainingAdjustStruck" : undefined}
                          style={
                            isCompetitionEvent(it)
                              ? { ...competitionBlockStyle, display: "block", fontSize: 11, lineHeight: 1.2, borderRadius: 6, padding: "2px 4px", textDecoration: "none" }
                              : {
                                  display: "block",
                                  fontSize: 11,
                                  lineHeight: 1.2,
                                  borderRadius: 6,
                                  border: `1px solid ${teamColorFor(it.team_id).border}`,
                                  background: teamColorFor(it.team_id).bg,
                                  color: teamColorFor(it.team_id).text,
                                  padding: "2px 4px",
                                  textDecoration: cancelled ? "line-through" : "none",
                                  opacity: cancelled ? 0.72 : 1,
                                }
                          }
                        >
                          <div>{it.start_time} {isCompetitionEvent(it) ? competitionKindLabel(it) : it.team_name || `#${it.team_id}`}{cancelled ? " (отм.)" : ""}</div>
                          <div style={{ opacity: 0.9 }}>{it.location}</div>
                        </Link>
                        );
                      })}
                      {dayItems.length > 2 ? <div style={{ fontSize: 11, color: "#0f766e" }}>+{dayItems.length - 2} още</div> : null}
                    </div>
                    {selectedDate === cell.date ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="teamScheduleDayPopover"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 20,
                          width: "min(360px, 92vw)",
                          border: "1px solid #cbd8e6",
                          borderRadius: 10,
                          background: "#ffffff",
                          boxShadow: "0 10px 26px rgba(15,23,42,0.18)",
                          padding: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <strong style={{ fontSize: 13 }}>Действия за {cell.date}</strong>
                          <Button size="sm" variant="secondary" onClick={() => setSelectedDate("")}>Затвори</Button>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <Button size="sm" onClick={() => openAddForDate(cell.date)}>Тренировка</Button>
                          <Button size="sm" variant="secondary" onClick={() => openCompetitionForDate(cell.date)}>Състезание</Button>
                        </div>
                        {selectedDayItems.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#64748b" }}>Няма събития в този ден.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
                            {selectedDayItems.map((it, i) => {
                              const cancelled = Boolean(it.is_cancelled);
                              return (
                              <article
                                key={occurrenceKey(it, i)}
                                className={cancelled && !isCompetitionEvent(it) ? "trainingAdjustCard trainingAdjustCard--cancelled" : undefined}
                                style={{
                                  border: isCompetitionEvent(it) ? "1px solid #f59e0b" : "1px solid #e2e8f0",
                                  borderRadius: 8,
                                  padding: 8,
                                  background: isCompetitionEvent(it) ? "#fffbeb" : cancelled ? undefined : "#fff",
                                }}
                              >
                                <div style={{ fontWeight: 700, fontSize: 12 }} className={cancelled ? "trainingAdjustStruck" : undefined}>
                                  {it.start_time} - {it.end_time}
                                  {cancelled ? " · Отменена" : ""}
                                </div>
                                <div style={{ color: "#5b6f85", fontSize: 12, marginTop: 2 }}>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      padding: "1px 6px",
                                      borderRadius: 999,
                                      border: `1px solid ${teamColorFor(it.team_id).border}`,
                                      background: teamColorFor(it.team_id).bg,
                                      color: teamColorFor(it.team_id).text,
                                      marginRight: 6,
                                    }}
                                  >
                                    {isCompetitionEvent(it) ? competitionKindLabel(it) : it.team_name || `Отбор #${it.team_id}`}
                                  </span>
                                  {it.location}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                                  {renderEventActionRow(it)}
                                </div>
                              </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {scheduleModals}
    </div>
  );
}
