import { useEffect, useMemo, useRef, useState } from "react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

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
      <PageHero
        title="Месечни Такси"
        subtitle="Управлявай състезатели, плащания и отчетни периоди от едно място."
      />

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
              {athletes.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <strong>{a.athlete_name}</strong>
                    <div style={{ color: "#607693", fontSize: 12 }}>Година: {a.birth_year || "-"}</div>
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
                  <TableCell>{m.paid ? `${Number(m.amount || 0).toFixed(2)} лв.` : "—"}</TableCell>
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
                  <TableCell>{Number(row.total_paid || 0).toFixed(2)} лв.</TableCell>
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

