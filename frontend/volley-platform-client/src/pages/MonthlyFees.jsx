import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { AMOUNT_INPUT_PLACEHOLDER, formatMoney } from "../utils/currency";
import { filterFeesAthletes } from "../utils/feesAthleteSearch";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при обработка на месечните такси.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при обработка на месечните такси.";
};

const currentMonthKey = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const formatGenderLabel = (v) => {
  if (v === "male") return "Мъж";
  if (v === "female") return "Жена";
  return "—";
};

const lastMonths = (count = 3) => {
  const now = new Date();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

export default function MonthlyFees() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [clubCoaches, setClubCoaches] = useState([]);
  const importInputRef = useRef(null);

  const [athleteForm, setAthleteForm] = useState({
    athlete_name: "",
    athlete_phone: "",
    parent_name: "",
    parent_phone: "",
    birth_year: "",
    gender: "",
    notes: "",
    is_active: true,
  });
  const [editAthlete, setEditAthlete] = useState(null);
  const [editForm, setEditForm] = useState({
    athlete_name: "",
    athlete_phone: "",
    parent_name: "",
    parent_phone: "",
    birth_year: "",
    gender: "",
    notes: "",
    is_active: true,
  });

  const [payAthlete, setPayAthlete] = useState(null);
  const [payForm, setPayForm] = useState({
    month_key: currentMonthKey(),
    amount: "",
    note: "",
  });
  const [monthAlreadyPaid, setMonthAlreadyPaid] = useState(false);
  const [checkingMonthPaid, setCheckingMonthPaid] = useState(false);

  const [reportAthlete, setReportAthlete] = useState(null);
  const [athleteReport, setAthleteReport] = useState(null);
  const [reportPeriod, setReportPeriod] = useState({
    from_month: currentMonthKey(),
    to_month: currentMonthKey(),
  });
  const [periodReport, setPeriodReport] = useState(null);
  const [transferAthlete, setTransferAthlete] = useState(null);
  const [targetCoachId, setTargetCoachId] = useState("");
  const [highlightAthleteId, setHighlightAthleteId] = useState(null);
  const [remindMonth, setRemindMonth] = useState(() => currentMonthKey());
  const isHeadCoach = user?.role === "club_head_coach";

  const loadAthletes = async (selectedCoach = coachFilter) => {
    try {
      setLoading(true);
      const params = {};
      if (isHeadCoach && selectedCoach) params.coach_id = Number(selectedCoach);
      const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST, { params });
      setAthletes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAthletes(coachFilter);
  }, [coachFilter, isHeadCoach]);

  const filteredAthletes = useMemo(() => filterFeesAthletes(athletes, query), [athletes, query]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search || "");
    const raw = sp.get("athlete_id");
    const aid = raw ? Number(raw) : NaN;
    if (!Number.isFinite(aid) || aid <= 0) {
      setHighlightAthleteId(null);
      return;
    }
    setHighlightAthleteId(aid);
    setQuery("");
    if (isHeadCoach) setCoachFilter("");
    loadAthletes("");
  }, [location.search, isHeadCoach]);

  useEffect(() => {
    if (!highlightAthleteId || loading) return;
    const t = window.setTimeout(() => {
      const id = highlightAthleteId;
      const mobileEl = document.querySelector(`.feesMobileList [data-athlete-scroll="${id}"]`);
      const desktopEl = document.querySelector(`.feesDesktopTable [data-athlete-scroll="${id}"]`);
      const preferMobile = window.matchMedia("(max-width: 720px)").matches;
      const el = preferMobile ? mobileEl || desktopEl : desktopEl || mobileEl;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [highlightAthleteId, loading, athletes]);

  useEffect(() => {
    if (loading || athletes.length === 0) return;
    const sp = new URLSearchParams(location.search || "");
    if (sp.get("focus") !== "edit") return;
    const raw = sp.get("athlete_id");
    const aid = raw ? Number(raw) : NaN;
    if (!Number.isFinite(aid)) return;
    const a = athletes.find((x) => Number(x.id) === aid);
    if (!a) return;
    setEditAthlete(a);
    setEditForm({
      athlete_name: a.athlete_name || "",
      athlete_phone: a.athlete_phone || "",
      parent_name: a.parent_name || "",
      parent_phone: a.parent_phone || "",
      birth_year: a.birth_year || "",
      gender: a.gender === "male" || a.gender === "female" ? a.gender : "",
      notes: a.notes || "",
      is_active: Boolean(a.is_active),
    });
    const next = new URLSearchParams(sp);
    next.delete("focus");
    const qs = next.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [loading, athletes, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (loading || athletes.length === 0) return;
    const sp = new URLSearchParams(location.search || "");
    if (sp.get("focus") !== "pay") return;
    const raw = sp.get("athlete_id");
    const aid = raw ? Number(raw) : NaN;
    if (!Number.isFinite(aid)) return;
    const a = athletes.find((x) => Number(x.id) === aid);
    if (!a) return;
    setPayAthlete(a);
    setPayForm((p) => ({ ...p, month_key: currentMonthKey() }));
    const next = new URLSearchParams(sp);
    next.delete("focus");
    const qs = next.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [loading, athletes, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!isHeadCoach) return;
    const run = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.FEES_COACHES_LIST);
        const coaches = Array.isArray(res.data) ? res.data : [];
        if (coaches.length > 0) {
          setClubCoaches(coaches);
          return;
        }
        // Fallback source in case the dedicated endpoint returns an empty list unexpectedly.
        const month = currentMonthKey();
        const ov = await axiosInstance.get(API_PATHS.CLUB_OVERVIEW, {
          params: { month_key: month, from_date: `${month}-01`, to_date: `${month}-31` },
        });
        setClubCoaches(Array.isArray(ov.data?.coaches) ? ov.data.coaches : []);
      } catch (err) {
        setClubCoaches([]);
        toast.error(normalizeError(err));
      }
    };
    run();
  }, [isHeadCoach]);

  const resetAthleteForm = () => {
    setAthleteForm({
      athlete_name: "",
      athlete_phone: "",
      parent_name: "",
      parent_phone: "",
      birth_year: "",
      gender: "",
      notes: "",
      is_active: true,
    });
  };

  const selectedAthleteName = useMemo(() => {
    if (!payAthlete) return "";
    return payAthlete.athlete_name || `Състезател #${payAthlete.id}`;
  }, [payAthlete]);

  const closePayModal = () => {
    if (busy) return;
    setPayAthlete(null);
    setMonthAlreadyPaid(false);
    setPayForm((prev) => ({ ...prev, amount: "", note: "" }));
  };

  const closeEditModal = () => {
    if (busy) return;
    setEditAthlete(null);
  };

  useEffect(() => {
    if (!payAthlete && !editAthlete) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (payAthlete) closePayModal();
      else if (editAthlete) closeEditModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [payAthlete, editAthlete, busy]);

  useEffect(() => {
    let cancelled = false;
    const checkMonthStatus = async () => {
      if (!payAthlete || !payForm.month_key) {
        setMonthAlreadyPaid(false);
        return;
      }
      try {
        setCheckingMonthPaid(true);
        const res = await axiosInstance.get(API_PATHS.FEES_ATHLETE_REPORT(payAthlete.id), {
          params: { from_month: payForm.month_key, to_month: payForm.month_key },
        });
        const statusRow = res.data?.months?.[0];
        if (!cancelled) {
          setMonthAlreadyPaid(Boolean(statusRow?.paid));
        }
      } catch {
        if (!cancelled) {
          setMonthAlreadyPaid(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingMonthPaid(false);
        }
      }
    };
    checkMonthStatus();
    return () => {
      cancelled = true;
    };
  }, [payAthlete, payForm.month_key]);

  const saveAthlete = async () => {
    if (!athleteForm.gender) {
      toast.error("Избери пол на състезателя.");
      return;
    }
    const payload = {
      athlete_name: athleteForm.athlete_name.trim(),
      athlete_phone: athleteForm.athlete_phone.trim() || null,
      parent_name: athleteForm.parent_name.trim() || null,
      parent_phone: athleteForm.parent_phone.trim() || null,
      birth_year: athleteForm.birth_year ? Number(athleteForm.birth_year) : null,
      gender: athleteForm.gender,
      notes: athleteForm.notes.trim() || null,
      is_active: Boolean(athleteForm.is_active),
    };
    if (!payload.athlete_name) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_ATHLETE_CREATE, payload);
      resetAthleteForm();
      await loadAthletes(coachFilter);
      toast.success("Състезателят е създаден.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEditedAthlete = async () => {
    if (!editAthlete) return;
    if (!editForm.gender) {
      toast.error("Избери пол на състезателя.");
      return;
    }
    const payload = {
      athlete_name: editForm.athlete_name.trim(),
      athlete_phone: editForm.athlete_phone.trim() || null,
      parent_name: editForm.parent_name.trim() || null,
      parent_phone: editForm.parent_phone.trim() || null,
      birth_year: editForm.birth_year ? Number(editForm.birth_year) : null,
      gender: editForm.gender,
      notes: editForm.notes.trim() || null,
      is_active: Boolean(editForm.is_active),
    };
    if (!payload.athlete_name) return;
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_UPDATE(editAthlete.id), payload);
      setEditAthlete(null);
      await loadAthletes(coachFilter);
      toast.success("Промените са запазени.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeAthlete = async (athlete) => {
    if (!window.confirm(`Да изтрия ли ${athlete.athlete_name}?`)) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.FEES_ATHLETE_DELETE(athlete.id));
      if (payAthlete?.id === athlete.id) setPayAthlete(null);
      if (reportAthlete?.id === athlete.id) {
        setReportAthlete(null);
        setAthleteReport(null);
      }
      await loadAthletes(coachFilter);
      toast.success("Състезателят е изтрит.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    if (!payAthlete) return;
    const athleteForRefresh = payAthlete;
    const payload = {
      month_key: payForm.month_key,
      amount: Number(payForm.amount),
      note: payForm.note.trim() || null,
    };
    if (!payload.month_key || !Number.isFinite(payload.amount) || payload.amount <= 0) return;
    if (monthAlreadyPaid) {
      toast.error(`Вече има плащане за ${payload.month_key}.`);
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_PAYMENT_SAVE(athleteForRefresh.id), payload);
      await loadAthletes(coachFilter);
      if (reportAthlete?.id === athleteForRefresh.id) {
        await loadAthleteReport(athleteForRefresh);
      }
      closePayModal();
      toast.success("Плащането е записано успешно.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadAthleteReport = async (athlete = reportAthlete) => {
    if (!athlete) return;
    try {
      setBusy(true);
      setReportAthlete(athlete);
      const res = await axiosInstance.get(API_PATHS.FEES_ATHLETE_REPORT(athlete.id), {
        params: {
          from_month: reportPeriod.from_month,
          to_month: reportPeriod.to_month,
        },
      });
      setAthleteReport(res.data);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const loadPeriodReport = async () => {
    try {
      setBusy(true);
      const params = {
        from_month: reportPeriod.from_month,
        to_month: reportPeriod.to_month,
      };
      if (isHeadCoach && coachFilter) params.coach_id = Number(coachFilter);
      const res = await axiosInstance.get(API_PATHS.FEES_PERIOD_REPORT, {
        params,
      });
      setPeriodReport(res.data);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadReceipt = async (paymentId) => {
    try {
      const res = await axiosInstance.get(API_PATHS.FEES_PAYMENT_RECEIPT(paymentId), {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt_${paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Квитанцията е изтеглена.");
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const importAthletes = async (file) => {
    if (!file) return;
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await axiosInstance.post(API_PATHS.FEES_ATHLETES_IMPORT, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data || {};
      toast.success(
        `Импорт: нови ${data.created || 0}, празни ${data.skipped_empty || 0}, дубликати ${data.skipped_duplicates || 0}.`
      );
      // Prevent hidden search/filter state from masking imported athletes.
      setQuery("");
      if (isHeadCoach) setCoachFilter("");
      await loadAthletes("", "");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadImportTemplate = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_IMPORT_TEMPLATE, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "shablon_sastezateli_import.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Шаблонът е изтеглен.");
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const transferToCoach = async () => {
    if (!transferAthlete || !targetCoachId) return;
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_TRANSFER(transferAthlete.id), null, {
        params: { coach_id: Number(targetCoachId) },
      });
      toast.success("Състезателят е прехвърлен.");
      setTransferAthlete(null);
      setTargetCoachId("");
      await loadAthletes(coachFilter);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const openAthleteProfile = (athleteId) => {
    if (!athleteId) return;
    navigate(`/teams/athletes/${athleteId}`);
  };

  const remindUnpaidFees = async () => {
    const monthLabel = remindMonth;
    const scopeLabel = isHeadCoach
      ? coachFilter
        ? `неплатилите при избрания треньор за ${monthLabel}`
        : `всички неплатили в клуба за ${monthLabel}`
      : `вашите неплатили състезатели за ${monthLabel}`;
    if (!window.confirm(`Изпратите push напомняне до ${scopeLabel}?`)) return;
    try {
      setBusy(true);
      const params = { month_key: remindMonth };
      if (isHeadCoach && coachFilter) params.coach_id = Number(coachFilter);
      const res = await axiosInstance.post(API_PATHS.FEES_REMIND_UNPAID, null, { params });
      const data = res.data || {};
      toast.success(
        `Готово за ${monthLabel}: насочени ${data.targeted ?? 0}, изпратени ${data.notified ?? 0}, без push ${data.skipped_no_push ?? 0}.`,
      );
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onAthleteContainerClick = (event, athleteId) => {
    const target = event?.target;
    if (target && typeof target.closest === "function") {
      const interactive = target.closest("button, a, input, select, textarea, label");
      if (interactive) return;
    }
    openAthleteProfile(athleteId);
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Месечни Такси"
        subtitle="Управлявай състезатели, плащания и отчетни периоди от едно място."
      />

      <Card title="Нов състезател">
        <div className="feesFormGrid" style={{ gap: 8 }}>
          <Input
            placeholder="Име на състезател"
            value={athleteForm.athlete_name}
            onChange={(e) => setAthleteForm((p) => ({ ...p, athlete_name: e.target.value }))}
          />
          <Input
            placeholder="Телефон на състезател"
            value={athleteForm.athlete_phone}
            onChange={(e) => setAthleteForm((p) => ({ ...p, athlete_phone: e.target.value }))}
          />
          <Input
            placeholder="Име на родител"
            value={athleteForm.parent_name}
            onChange={(e) => setAthleteForm((p) => ({ ...p, parent_name: e.target.value }))}
          />
          <Input
            placeholder="Телефон на родител"
            value={athleteForm.parent_phone}
            onChange={(e) => setAthleteForm((p) => ({ ...p, parent_phone: e.target.value }))}
          />
          <Input
            placeholder="Година на раждане"
            value={athleteForm.birth_year}
            onChange={(e) => setAthleteForm((p) => ({ ...p, birth_year: e.target.value }))}
          />
          <Input
            as="select"
            value={athleteForm.gender}
            onChange={(e) => setAthleteForm((p) => ({ ...p, gender: e.target.value }))}
          >
            <option value="">Пол</option>
            <option value="male">Мъж</option>
            <option value="female">Жена</option>
          </Input>
          <Input
            as="textarea"
            rows={2}
            placeholder="Бележка"
            value={athleteForm.notes}
            onChange={(e) => setAthleteForm((p) => ({ ...p, notes: e.target.value }))}
            style={{ gridColumn: "1 / -1" }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={athleteForm.is_active}
              onChange={(e) => setAthleteForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Активен състезател
          </label>
          <div className="feesFormActions">
            <Button disabled={busy} onClick={saveAthlete} block className="feesFormPrimaryBtn">
              Създай състезател
            </Button>
            <Button variant="secondary" onClick={resetAthleteForm} block className="feesFormSecondaryBtn">
              Изчисти
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Списък състезатели">
        <div style={{ marginBottom: 8 }}>
          <span className="uiBadge uiBadge--info">
            {query.trim()
              ? `Показани ${filteredAthletes.length} от ${athletes.length}`
              : `Общо: ${athletes.length}`}
          </span>
        </div>
        <div className="feesToolbar">
          <div className="feesToolbarInner">
            <Input
              placeholder="Търсене: име, отбор, година..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Търсене на състезатели"
            />
            {isHeadCoach && (
              <select className="uiInput" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
                <option value="">Всички треньори</option>
                {clubCoaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {query.trim() ? (
              <Button variant="secondary" type="button" onClick={() => setQuery("")}>
                Изчисти
              </Button>
            ) : null}
            <Input
              type="month"
              className="uiInput feesRemindMonth"
              value={remindMonth}
              onChange={(e) => setRemindMonth(e.target.value)}
              aria-label="Месец за напомняне"
              title="Месец за напомняне"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              title="Push напомняне до родители с неплатена такса за избрания месец"
              onClick={remindUnpaidFees}
            >
              Напомни неплатили
            </Button>
            <Input
              ref={importInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                await importAthletes(file);
              }}
            />
            <Button
              title="Импорт на готов списък (CSV/XLSX)"
              size="sm"
              disabled={busy}
              onClick={() => importInputRef.current?.click()}
            >
              Импорт
            </Button>
            <Button
              title="Изтегли примерен шаблон за импорт"
              size="sm"
              variant="secondary"
              onClick={downloadImportTemplate}
            >
              Шаблон
            </Button>
          </div>
        </div>
        {loading && <p>Зареждане...</p>}
        {!loading && athletes.length === 0 && <EmptyState title="Няма състезатели" description="Добави първия състезател или импортирай списък." />}
        {!loading && athletes.length > 0 && filteredAthletes.length === 0 && (
          <EmptyState title="Няма съвпадения" description="Променете търсенето или изчистете полето." />
        )}
        {!loading && filteredAthletes.length > 0 && (
          <>
            <div className="feesMobileList" aria-label="Състезатели (мобилен изглед)">
              {filteredAthletes.map((a) => (
                <article
                  key={`m-${a.id}`}
                  data-athlete-scroll={a.id}
                  className={`feesAthleteCard ${a.gender === "male" ? "feesAthleteCard--male" : a.gender === "female" ? "feesAthleteCard--female" : ""}${highlightAthleteId === a.id ? " feesAthleteCard--highlight" : ""}`}
                  onClick={(event) => onAthleteContainerClick(event, a.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <h3 className="feesAthleteCardName">{a.athlete_name}</h3>
                    <div style={{ color: "#607693", fontSize: 12 }}>Година: {a.birth_year || "—"}</div>
                    <div style={{ color: "#607693", fontSize: 12 }}>Пол: {formatGenderLabel(a.gender)}</div>
                  </div>
                  <div className="feesAthleteCardRow">
                    <div>Родител: {a.parent_name || "—"}</div>
                    <div>Тел. състезател: {a.athlete_phone || "—"}</div>
                    <div>Тел. родител: {a.parent_phone || "—"}</div>
                  </div>
                  <div>
                    <span className={`uiBadge ${a.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {a.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </div>
                  <div className="feesAthleteCardMonths">
                    {lastMonths(3).map((monthKey) => {
                      const paid = (a.recent_payments || []).find((p) => p.month_key === monthKey);
                      return (
                        <span key={`${a.id}-${monthKey}`} className={`uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                          {paid ? `${monthKey}: платено` : `${monthKey}: липсва`}
                        </span>
                      );
                    })}
                  </div>
                  <div className="feesAthleteCardActions">
                    <Button
                      block
                      size="sm"
                      onClick={() => {
                        setPayAthlete(a);
                        setPayForm((p) => ({ ...p, month_key: currentMonthKey() }));
                      }}
                    >
                      Плати
                    </Button>
                    <Button
                      block
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditAthlete(a);
                        setEditForm({
                          athlete_name: a.athlete_name || "",
                          athlete_phone: a.athlete_phone || "",
                          parent_name: a.parent_name || "",
                          parent_phone: a.parent_phone || "",
                          birth_year: a.birth_year || "",
                          gender: a.gender === "male" || a.gender === "female" ? a.gender : "",
                          notes: a.notes || "",
                          is_active: Boolean(a.is_active),
                        });
                      }}
                    >
                      Редактирай
                    </Button>
                    <Button block variant="danger" size="sm" onClick={() => removeAthlete(a)}>
                      Изтрий
                    </Button>
                    <Button block variant="ghost" size="sm" onClick={() => loadAthleteReport(a)}>
                      Отчет
                    </Button>
                    {isHeadCoach && (
                      <Button
                        block
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setTransferAthlete(a);
                          setTargetCoachId("");
                        }}
                      >
                        Прехвърли
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="feesDesktopTable">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Контакти</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Последни 3 месеца</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAthletes.map((a) => (
                    <TableRow
                      key={a.id}
                      data-athlete-scroll={a.id}
                      className={`${a.gender === "male" ? "feesAthleteRow--male" : a.gender === "female" ? "feesAthleteRow--female" : ""}${highlightAthleteId === a.id ? " feesAthleteRow--highlight" : ""}`.trim() || undefined}
                      onClick={(event) => onAthleteContainerClick(event, a.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        <strong>{a.athlete_name}</strong>
                        <div style={{ color: "#607693", fontSize: 12 }}>Година: {a.birth_year || "-"}</div>
                        <div style={{ color: "#607693", fontSize: 12 }}>Пол: {formatGenderLabel(a.gender)}</div>
                      </TableCell>
                      <TableCell>
                        <div>Родител: {a.parent_name || "-"}</div>
                        <div>Тел. състезател: {a.athlete_phone || "-"}</div>
                        <div>Тел. родител: {a.parent_phone || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`uiBadge ${a.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                          {a.is_active ? "Активен" : "Неактивен"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {lastMonths(3).map((monthKey) => {
                            const paid = (a.recent_payments || []).find((p) => p.month_key === monthKey);
                            return (
                              <span key={`${a.id}-${monthKey}`} className={`uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                                {paid ? `${monthKey}: платено` : `${monthKey}: липсва`}
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button onClick={() => { setPayAthlete(a); setPayForm((p) => ({ ...p, month_key: currentMonthKey() })); }} size="sm">
                            Плати
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditAthlete(a);
                              setEditForm({
                                athlete_name: a.athlete_name || "",
                                athlete_phone: a.athlete_phone || "",
                                parent_name: a.parent_name || "",
                                parent_phone: a.parent_phone || "",
                                birth_year: a.birth_year || "",
                                gender: a.gender === "male" || a.gender === "female" ? a.gender : "",
                                notes: a.notes || "",
                                is_active: Boolean(a.is_active),
                              });
                            }}
                          >
                            Редактирай
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => removeAthlete(a)}>
                            Изтрий
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => loadAthleteReport(a)}>
                            Отчет
                          </Button>
                          {isHeadCoach && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setTransferAthlete(a);
                                setTargetCoachId("");
                              }}
                            >
                              Прехвърли
                            </Button>
                          )}
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

      <Card title="Период за отчети">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input
            type="month"
            value={reportPeriod.from_month}
            onChange={(e) => setReportPeriod((p) => ({ ...p, from_month: e.target.value }))}
          />
          <Input
            type="month"
            value={reportPeriod.to_month}
            onChange={(e) => setReportPeriod((p) => ({ ...p, to_month: e.target.value }))}
          />
          <Button variant="secondary" onClick={() => loadAthleteReport(reportAthlete)} disabled={!reportAthlete}>
            Обнови отчет за състезател
          </Button>
          <Button onClick={loadPeriodReport}>Отчет за всички</Button>
        </div>
      </Card>

      {athleteReport && (
        <Card
          title={`Отчет по месеци: ${athleteReport.athlete?.athlete_name} (Общо платено: ${formatMoney(athleteReport.total_paid)})`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месец</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Квитанция</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(athleteReport.months || []).map((m) => (
                <TableRow key={m.month_key}>
                  <TableCell>{m.month_key}</TableCell>
                  <TableCell>
                    <span className={`uiBadge ${m.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {m.paid ? "Платено" : "Неплатено"}
                    </span>
                  </TableCell>
                  <TableCell>{m.paid ? formatMoney(m.amount) : "—"}</TableCell>
                  <TableCell>
                    {m.payment_id ? (
                      <Button size="sm" variant="secondary" onClick={() => downloadReceipt(m.payment_id)}>
                        Квитанция PDF
                      </Button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {periodReport && (
        <Card title={`Общ отчет (${periodReport.from_month} → ${periodReport.to_month}) • Състезатели: ${periodReport.total_athletes}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Състезател</TableHead>
                <TableHead>Платени</TableHead>
                <TableHead>Неплатени</TableHead>
                <TableHead>Общо</TableHead>
                <TableHead>Месеци</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(periodReport.rows || []).map((row) => (
                <TableRow key={row.athlete_id}>
                  <TableCell>
                    <strong>{row.athlete_name}</strong>
                  </TableCell>
                  <TableCell>{row.paid_months}</TableCell>
                  <TableCell>{row.unpaid_months}</TableCell>
                  <TableCell>{formatMoney(row.total_paid)}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(row.months || []).map((m) => (
                        <span key={`${row.athlete_id}-${m.month_key}`} className={`uiBadge ${m.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                          {m.month_key}: {m.paid ? "ПЛАТЕНО" : "НЕПЛАТЕНО"}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {payAthlete && (
        <div onClick={closePayModal} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Плащане: {selectedAthleteName}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input
                type="month"
                value={payForm.month_key}
                onChange={(e) => setPayForm((p) => ({ ...p, month_key: e.target.value }))}
              />
              {checkingMonthPaid && <small className="uiFieldHint">Проверка за съществуващо плащане...</small>}
              {monthAlreadyPaid && (
                <small className="uiFieldError">
                  За този месец вече е отбелязано плащане. Не може дублиране.
                </small>
              )}
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
                <Button disabled={busy || monthAlreadyPaid || checkingMonthPaid} onClick={savePayment}>
                  Запиши плащане
                </Button>
                <Button variant="secondary" disabled={busy} onClick={closePayModal}>
                  Затвори
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {editAthlete && (
        <div onClick={closeEditModal} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal">
            <h3 className="uiModalTitle">Редакция: {editAthlete.athlete_name}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input
                placeholder="Име на състезател"
                value={editForm.athlete_name}
                onChange={(e) => setEditForm((p) => ({ ...p, athlete_name: e.target.value }))}
              />
              <Input
                placeholder="Телефон на състезател"
                value={editForm.athlete_phone}
                onChange={(e) => setEditForm((p) => ({ ...p, athlete_phone: e.target.value }))}
              />
              <Input
                placeholder="Име на родител"
                value={editForm.parent_name}
                onChange={(e) => setEditForm((p) => ({ ...p, parent_name: e.target.value }))}
              />
              <Input
                placeholder="Телефон на родител"
                value={editForm.parent_phone}
                onChange={(e) => setEditForm((p) => ({ ...p, parent_phone: e.target.value }))}
              />
              <Input
                placeholder="Година на раждане"
                value={editForm.birth_year}
                onChange={(e) => setEditForm((p) => ({ ...p, birth_year: e.target.value }))}
              />
              <Input
                as="select"
                value={editForm.gender}
                onChange={(e) => setEditForm((p) => ({ ...p, gender: e.target.value }))}
              >
                <option value="">Пол</option>
                <option value="male">Мъж</option>
                <option value="female">Жена</option>
              </Input>
              <Input
                as="textarea"
                rows={2}
                placeholder="Бележка"
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Активен състезател
              </label>
              <div className="uiModalActions">
                <Button disabled={busy} onClick={saveEditedAthlete}>
                  Запази промените
                </Button>
                <Button variant="secondary" disabled={busy} onClick={closeEditModal}>
                  Затвори
                </Button>
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
              <select className="uiInput" value={targetCoachId} onChange={(e) => setTargetCoachId(e.target.value)}>
                <option value="">Избери треньор</option>
                {clubCoaches
                  .filter((c) => String(c.id) !== String(transferAthlete.coach_id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              <div className="uiModalActions">
                <Button disabled={busy || !targetCoachId} onClick={transferToCoach}>Прехвърли</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setTransferAthlete(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

