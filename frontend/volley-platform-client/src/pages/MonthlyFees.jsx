import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import MonthlyFeesCoachView from "./coach/MonthlyFeesCoachView";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import AthleteIdentityFields from "../components/athletes/AthleteIdentityFields";
import AthleteMembershipChips from "../components/athletes/AthleteMembershipChips";
import FeesMonthSummaryBar from "../components/fees/FeesMonthSummaryBar";
import { Button, Card, EmptyState, Input, Modal, PageHero, ResponsiveDataView, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { normalizeError } from "../utils/normalizeError";
import { AMOUNT_INPUT_PLACEHOLDER, formatMoney } from "../utils/currency";
import { filterFeesAthletes } from "../utils/feesAthleteSearch";
import {
  athleteToIdentityForm,
  buildAthletePayload,
  emptyAthleteIdentityForm,
  validateAthleteIdentityForm,
} from "../utils/athleteIdentity";

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
  const isCoachShell = location.pathname.startsWith("/coach/fees");
  const feesPath = isCoachShell ? "/coach/fees" : "/monthly-fees";
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [payFilter, setPayFilter] = useState("all"); // all | unpaid | paid
  const [monthSummary, setMonthSummary] = useState(null);
  const [coachFilter, setCoachFilter] = useState("");
  const [clubCoaches, setClubCoaches] = useState([]);
  const importInputRef = useRef(null);

  const [athleteForm, setAthleteForm] = useState(() => emptyAthleteIdentityForm());
  const [editAthlete, setEditAthlete] = useState(null);
  const [editForm, setEditForm] = useState(() => emptyAthleteIdentityForm());

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

  const loadMonthSummary = async (month = remindMonth, selectedCoach = coachFilter) => {
    if (!month) {
      setMonthSummary(null);
      return;
    }
    try {
      const params = { month_key: month };
      if (isHeadCoach && selectedCoach) params.coach_id = Number(selectedCoach);
      const res = await axiosInstance.get(API_PATHS.FEES_MONTH_SUMMARY, { params });
      setMonthSummary(res.data || null);
    } catch {
      setMonthSummary(null);
    }
  };

  useEffect(() => {
    loadAthletes(coachFilter);
  }, [coachFilter, isHeadCoach]);

  useEffect(() => {
    loadMonthSummary(remindMonth, coachFilter);
  }, [remindMonth, coachFilter, isHeadCoach]);

  const filteredAthletes = useMemo(() => {
    let list = filterFeesAthletes(athletes, query);
    if (remindMonth && payFilter === "unpaid") {
      list = list.filter(
        (a) => !(a.recent_payments || []).some((p) => p.month_key === remindMonth),
      );
    } else if (remindMonth && payFilter === "paid") {
      list = list.filter((a) =>
        (a.recent_payments || []).some((p) => p.month_key === remindMonth),
      );
    }
    return list;
  }, [athletes, query, payFilter, remindMonth]);

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
      const coachEl = document.querySelector(`.feesCoachAthleteList [data-athlete-scroll="${id}"]`);
      const mobileEl = document.querySelector(`.feesMobileList [data-athlete-scroll="${id}"]`);
      const desktopEl = document.querySelector(`.feesDesktopTable [data-athlete-scroll="${id}"]`);
      const preferMobile = isCoachShell || window.matchMedia("(max-width: 720px)").matches;
      const el = coachEl || (preferMobile ? mobileEl || desktopEl : desktopEl || mobileEl);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [highlightAthleteId, loading, athletes, isCoachShell]);

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
    setEditForm(athleteToIdentityForm(a));
    const next = new URLSearchParams(sp);
    next.delete("focus");
    const qs = next.toString();
    navigate(`${feesPath}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [loading, athletes, feesPath, location.search, navigate]);

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
    const monthFromUrl = sp.get("month_key");
    setPayForm((p) => ({
      ...p,
      month_key: monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) ? monthFromUrl : currentMonthKey(),
    }));
    const next = new URLSearchParams(sp);
    next.delete("focus");
    const qs = next.toString();
    navigate(`${feesPath}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [loading, athletes, feesPath, location.search, navigate]);

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
    setAthleteForm(emptyAthleteIdentityForm());
  };

  const openEditAthlete = (a) => {
    setEditAthlete(a);
    setEditForm(athleteToIdentityForm(a));
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
    toast.info("Създаването на състезател е в модул „Състезатели“.");
  };

  const saveEditedAthlete = async () => {
    if (!editAthlete) return;
    const locked = Boolean(editAthlete.bvf_player_id || editAthlete.bvf_identity_locked);
    const err = validateAthleteIdentityForm(editForm, {
      requireSplitNames: Boolean(editForm.first_name || editForm.middle_name || editForm.last_name) || !editForm.athlete_name,
    });
    if (!locked && err) {
      toast.error(err);
      return;
    }
    const payload = locked
      ? {
          athlete_phone: (editForm.athlete_phone || "").trim() || null,
          parent_name: (editForm.parent_name || "").trim() || null,
          parent_phone: (editForm.parent_phone || "").trim() || null,
          notes: (editForm.notes || "").trim() || null,
          is_active: Boolean(editForm.is_active),
        }
      : buildAthletePayload(editForm);
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_UPDATE(editAthlete.id), payload);
      setEditAthlete(null);
      await loadAthletes(coachFilter);
      toast.success("Промените са запазени.");
    } catch (err2) {
      toast.error(normalizeError(err2));
    } finally {
      setBusy(false);
    }
  };

  const removeAthlete = async (athlete) => {
    if (athlete?.bvf_player_id) {
      toast.error("Състезател, свързан със СЕК, не може да се изтрие.");
      return;
    }
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
      await loadMonthSummary(remindMonth, coachFilter);
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
    if (isCoachShell) {
      navigate(`/coach/athletes/${athleteId}?from=${encodeURIComponent(feesPath)}`);
      return;
    }
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
      await loadMonthSummary(remindMonth, coachFilter);
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

  const feesModals = (
    <>
      <Modal
        open={Boolean(payAthlete)}
        onClose={closePayModal}
        dismissable={!busy}
        title={`Плащане: ${selectedAthleteName}`}
        size="compact"
      >
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
      </Modal>

      <Modal
        open={Boolean(editAthlete)}
        onClose={closeEditModal}
        dismissable={!busy}
        title={`Редакция: ${editAthlete?.athlete_name || ""}`}
      >
        <AthleteIdentityFields
          form={editForm}
          setForm={setEditForm}
          identityLocked={Boolean(editAthlete?.bvf_player_id || editAthlete?.bvf_identity_locked)}
          showLegacyNameHint
        />
        <div className="uiModalActions" style={{ marginTop: 12 }}>
          <Button disabled={busy} onClick={saveEditedAthlete}>
            Запази промените
          </Button>
          <Button variant="secondary" disabled={busy} onClick={closeEditModal}>
            Затвори
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(transferAthlete)}
        onClose={() => setTransferAthlete(null)}
        dismissable={!busy}
        title={`Прехвърли: ${transferAthlete?.athlete_name || ""}`}
        size="compact"
      >
        <div style={{ display: "grid", gap: 8 }}>
          <select className="uiInput" value={targetCoachId} onChange={(e) => setTargetCoachId(e.target.value)}>
            <option value="">Избери треньор</option>
            {clubCoaches
              .filter((c) => String(c.id) !== String(transferAthlete?.coach_id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <div className="uiModalActions">
            <Button disabled={busy || !targetCoachId} onClick={transferToCoach}>
              Прехвърли
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setTransferAthlete(null)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );

  if (isCoachShell) {
    return (
      <>
        <MonthlyFeesCoachView
          athletesCount={athletes.length}
          filteredCount={filteredAthletes.length}
          query={query}
          setQuery={setQuery}
          remindMonth={remindMonth}
          setRemindMonth={setRemindMonth}
          payFilter={payFilter}
          setPayFilter={setPayFilter}
          monthSummary={monthSummary}
          loading={loading}
          filteredAthletes={filteredAthletes}
          highlightAthleteId={highlightAthleteId}
          busy={busy}
          isHeadCoach={isHeadCoach}
          coachFilter={coachFilter}
          setCoachFilter={setCoachFilter}
          clubCoaches={clubCoaches}
          onRemind={remindUnpaidFees}
          onAthleteOpen={onAthleteContainerClick}
          onPay={(a) => {
            setPayAthlete(a);
            setPayForm((p) => ({ ...p, month_key: remindMonth || currentMonthKey() }));
          }}
          onReport={loadAthleteReport}
        />
        {feesModals}
      </>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Месечни Такси"
        subtitle="Плащания, напомняния и финансови отчети. Профили и нов състезател са в модул „Състезатели“."
        actions={
          <Button as={Link} to="/coach/athletes" variant="secondary">
            Към състезатели
          </Button>
        }
      />

      <Card title="Списък и плащания">
        <div style={{ marginBottom: 8 }}>
          <span className="uiBadge uiBadge--info">
            {query.trim() || payFilter !== "all"
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
            <div className="athletesHubFilters" role="group" aria-label="Филтър плащане">
              {[
                { id: "all", label: "Всички" },
                { id: "unpaid", label: "Неплатили" },
                { id: "paid", label: "Платили" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`athletesHubFilterBtn${payFilter === f.id ? " is-active" : ""}`}
                  onClick={() => setPayFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              disabled={busy}
              title="Push напомняне до родители с неплатена такса за избрания месец"
              onClick={remindUnpaidFees}
            >
              Напомни неплатили
            </Button>
          </div>
        </div>
        {monthSummary ? (
          <div style={{ marginTop: 10 }}>
            <FeesMonthSummaryBar summary={monthSummary} isHeadCoach={isHeadCoach} />
          </div>
        ) : null}
        {loading && <p>Зареждане...</p>}
        {!loading && athletes.length === 0 && (
          <EmptyState title="Няма състезатели" description="Добави първия от модул „Състезатели“." />
        )}
        {!loading && athletes.length > 0 && filteredAthletes.length === 0 && (
          <EmptyState title="Няма съвпадения" description="Променете търсенето или филтъра за неплатили." />
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
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span className={a.bvf_player_id ? "feesSekMark feesSekMark--on" : "feesSekMark feesSekMark--off"}>
                        {a.bvf_player_id
                          ? `СЕК${a.bvf_player_number ? ` №${a.bvf_player_number}` : ""}`
                          : "без СЕК"}
                      </span>
                    </div>
                    <AthleteMembershipChips dense teamNames={a.team_names} cardedTeams={a.carded_teams} />
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
                        openEditAthlete(a);
                      }}
                    >
                      Редактирай
                    </Button>
                    {!a.bvf_player_id ? (
                      <Button block variant="danger" size="sm" onClick={() => removeAthlete(a)}>
                        Изтрий
                      </Button>
                    ) : null}                    <Button block variant="ghost" size="sm" onClick={() => loadAthleteReport(a)}>
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
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          <span className={a.bvf_player_id ? "feesSekMark feesSekMark--on" : "feesSekMark feesSekMark--off"}>
                            {a.bvf_player_id
                              ? `СЕК${a.bvf_player_number ? ` №${a.bvf_player_number}` : ""}`
                              : "без СЕК"}
                          </span>
                        </div>
                        <AthleteMembershipChips dense teamNames={a.team_names} cardedTeams={a.carded_teams} />
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
                              openEditAthlete(a);
                            }}
                          >
                            Редактирай
                          </Button>
                          {!a.bvf_player_id ? (
                            <Button variant="danger" size="sm" onClick={() => removeAthlete(a)}>
                              Изтрий
                            </Button>
                          ) : null}
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
          <ResponsiveDataView
            items={athleteReport.months || []}
            renderMobileCard={(m) => (
              <article key={m.month_key} className="feesAthleteCard">
                <div className="feesAthleteCardName">{m.month_key}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span className={`uiBadge ${m.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                    {m.paid ? "Платено" : "Неплатено"}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{m.paid ? formatMoney(m.amount) : "—"}</span>
                </div>
                {m.payment_id ? (
                  <Button size="sm" variant="secondary" block onClick={() => downloadReceipt(m.payment_id)}>
                    Квитанция PDF
                  </Button>
                ) : null}
              </article>
            )}
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
          </ResponsiveDataView>
        </Card>
      )}

      {periodReport && (
        <Card title={`Общ отчет (${periodReport.from_month} → ${periodReport.to_month}) • Състезатели: ${periodReport.total_athletes}`}>
          <ResponsiveDataView
            items={periodReport.rows || []}
            renderMobileCard={(row) => (
              <article key={row.athlete_id} className="feesAthleteCard">
                <div className="feesAthleteCardName">{row.athlete_name}</div>
                <div className="feesAthleteCardRow">
                  <div>Платени месеци: {row.paid_months}</div>
                  <div>Неплатени: {row.unpaid_months}</div>
                  <div>Общо: {formatMoney(row.total_paid)}</div>
                </div>
                <div className="feesAthleteCardMonths">
                  {(row.months || []).map((m) => (
                    <span key={`${row.athlete_id}-${m.month_key}`} className={`uiBadge ${m.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {m.month_key}: {m.paid ? "ПЛАТЕНО" : "НЕПЛАТЕНО"}
                    </span>
                  ))}
                </div>
              </article>
            )}
          >
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
          </ResponsiveDataView>
        </Card>
      )}

      {feesModals}
    </div>
  );
}

