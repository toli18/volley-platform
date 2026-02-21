import { useEffect, useMemo, useRef, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input } from "../components/ui";

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
  const toast = useToast();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const importInputRef = useRef(null);

  const [athleteForm, setAthleteForm] = useState({
    athlete_name: "",
    athlete_phone: "",
    parent_name: "",
    parent_phone: "",
    birth_year: "",
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

  const loadAthletes = async (search = query) => {
    try {
      setLoading(true);
      const params = {};
      if ((search || "").trim()) params.query = search.trim();
      const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST, { params });
      setAthletes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAthletes("");
  }, []);

  const resetAthleteForm = () => {
    setAthleteForm({
      athlete_name: "",
      athlete_phone: "",
      parent_name: "",
      parent_phone: "",
      birth_year: "",
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
    const payload = {
      athlete_name: athleteForm.athlete_name.trim(),
      athlete_phone: athleteForm.athlete_phone.trim() || null,
      parent_name: athleteForm.parent_name.trim() || null,
      parent_phone: athleteForm.parent_phone.trim() || null,
      birth_year: athleteForm.birth_year ? Number(athleteForm.birth_year) : null,
      notes: athleteForm.notes.trim() || null,
      is_active: Boolean(athleteForm.is_active),
    };
    if (!payload.athlete_name) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_ATHLETE_CREATE, payload);
      resetAthleteForm();
      await loadAthletes();
      toast.success("Състезателят е създаден.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEditedAthlete = async () => {
    if (!editAthlete) return;
    const payload = {
      athlete_name: editForm.athlete_name.trim(),
      athlete_phone: editForm.athlete_phone.trim() || null,
      parent_name: editForm.parent_name.trim() || null,
      parent_phone: editForm.parent_phone.trim() || null,
      birth_year: editForm.birth_year ? Number(editForm.birth_year) : null,
      notes: editForm.notes.trim() || null,
      is_active: Boolean(editForm.is_active),
    };
    if (!payload.athlete_name) return;
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_UPDATE(editAthlete.id), payload);
      setEditAthlete(null);
      await loadAthletes();
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
      await loadAthletes();
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
      await loadAthletes(query);
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
      const res = await axiosInstance.get(API_PATHS.FEES_PERIOD_REPORT, {
        params: {
          from_month: reportPeriod.from_month,
          to_month: reportPeriod.to_month,
        },
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
      await loadAthletes(query);
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

  return (
    <div className="uiPage">
      <h1 style={{ margin: 0 }}>Месечни Такси</h1>

      <Card title="Нов състезател">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={saveAthlete}>
              Създай състезател
            </Button>
            <Button variant="secondary" onClick={resetAthleteForm}>
              Изчисти
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Списък състезатели">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input placeholder="Бързо търсене..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button variant="secondary" onClick={() => loadAthletes(query)}>
              Търси
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                loadAthletes("");
              }}
            >
              Изчисти
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
        {!loading && athletes.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {athletes.map((a) => (
              <article key={a.id} style={{ border: "1px solid #dbe5f2", borderRadius: 8, padding: 10, background: "#f9fbff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{a.athlete_name}</strong>
                  <span style={{ color: a.is_active ? "#0f7f47" : "#9a3412" }}>{a.is_active ? "Активен" : "Неактивен"}</span>
                </div>
                <div style={{ color: "#607693", marginTop: 6, fontSize: 13 }}>
                  Родител: {a.parent_name || "-"} | Тел. състезател: {a.athlete_phone || "-"} | Тел. родител: {a.parent_phone || "-"} | Година: {a.birth_year || "-"}
                </div>
                <div style={{ marginTop: 8, fontSize: 15, color: "#0f172a" }}>
                  <strong>Последни 3 месеца:</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {lastMonths(3).map((monthKey) => {
                      const paid = (a.recent_payments || []).find((p) => p.month_key === monthKey);
                      return (
                        <span
                          key={`${a.id}-${monthKey}`}
                          style={{
                            borderRadius: 999,
                            padding: "5px 10px",
                            border: "1px solid",
                            borderColor: paid ? "#86efac" : "#fecaca",
                            background: paid ? "#ecfdf5" : "#fef2f2",
                            color: paid ? "#15803d" : "#b91c1c",
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {paid
                            ? `${monthKey}: ${new Date(paid.paid_at || "").toLocaleDateString("bg-BG")}`
                            : `${monthKey}: липсва плащане`}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <Button onClick={() => { setPayAthlete(a); setPayForm((p) => ({ ...p, month_key: currentMonthKey() })); }}>
                    Плати
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditAthlete(a);
                      setEditForm({
                        athlete_name: a.athlete_name || "",
                        athlete_phone: a.athlete_phone || "",
                        parent_name: a.parent_name || "",
                        parent_phone: a.parent_phone || "",
                        birth_year: a.birth_year || "",
                        notes: a.notes || "",
                        is_active: Boolean(a.is_active),
                      });
                    }}
                  >
                    Редактирай
                  </Button>
                  <Button variant="danger" onClick={() => removeAthlete(a)}>
                    Изтрий
                  </Button>
                  <Button variant="ghost" onClick={() => loadAthleteReport(a)}>
                    Отчет по месеци
                  </Button>
                </div>
              </article>
            ))}
          </div>
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
          title={`Отчет по месеци: ${athleteReport.athlete?.athlete_name} (Общо платено: ${Number(athleteReport.total_paid || 0).toFixed(2)} лв.)`}
        >
          <div style={{ display: "grid", gap: 6 }}>
            {(athleteReport.months || []).map((m) => (
              <div key={m.month_key} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #eef3fa", padding: "6px 0" }}>
                <span>{m.month_key}</span>
                <span style={{ color: m.paid ? "#0f7f47" : "#b91c1c" }}>
                  {m.paid ? `Платено (${Number(m.amount || 0).toFixed(2)} лв.)` : "Неплатено"}
                </span>
                {m.payment_id ? (
                  <Button size="sm" variant="secondary" onClick={() => downloadReceipt(m.payment_id)}>
                    Квитанция PDF
                  </Button>
                ) : (
                  <span style={{ color: "#94a3b8" }}>—</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {periodReport && (
        <Card title={`Общ отчет (${periodReport.from_month} → ${periodReport.to_month}) • Състезатели: ${periodReport.total_athletes}`}>
          <div style={{ display: "grid", gap: 8 }}>
            {(periodReport.rows || []).map((row) => (
              <article key={row.athlete_id} style={{ border: "1px solid #dbe5f2", borderRadius: 8, padding: 10, background: "#f9fbff" }}>
                <strong>{row.athlete_name}</strong>
                <div style={{ color: "#607693", fontSize: 13, marginTop: 4 }}>
                  Платени: {row.paid_months} | Неплатени: {row.unpaid_months} | Общо: {Number(row.total_paid || 0).toFixed(2)} лв.
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {(row.months || []).map((m) => (
                    <span
                      key={`${row.athlete_id}-${m.month_key}`}
                      style={{
                        borderRadius: 999,
                        padding: "3px 8px",
                        fontSize: 12,
                        border: "1px solid",
                        borderColor: m.paid ? "#9fe3bd" : "#fecaca",
                        background: m.paid ? "#ecfdf5" : "#fff1f2",
                        color: m.paid ? "#0f7f47" : "#b91c1c",
                      }}
                    >
                      {m.month_key}: {m.paid ? "ПЛАТЕНО" : "НЕПЛАТЕНО"}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      {payAthlete && (
        <div
          onClick={closePayModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(560px, 96vw)", borderRadius: 12, background: "#fff", padding: 14, border: "1px solid #dbe5f2" }}
          >
            <h3 style={{ marginTop: 0 }}>Плащане: {selectedAthleteName}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input
                type="month"
                value={payForm.month_key}
                onChange={(e) => setPayForm((p) => ({ ...p, month_key: e.target.value }))}
              />
              {checkingMonthPaid && <small style={{ color: "#475569" }}>Проверка за съществуващо плащане...</small>}
              {monthAlreadyPaid && (
                <small style={{ color: "#b91c1c", fontWeight: 700 }}>
                  За този месец вече е отбелязано плащане. Не може дублиране.
                </small>
              )}
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
              <div style={{ display: "flex", gap: 8 }}>
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
        <div
          onClick={closeEditModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(680px, 96vw)", borderRadius: 12, background: "#fff", padding: 14, border: "1px solid #dbe5f2" }}
          >
            <h3 style={{ marginTop: 0 }}>Редакция: {editAthlete.athlete_name}</h3>
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
              <div style={{ display: "flex", gap: 8 }}>
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
    </div>
  );
}

