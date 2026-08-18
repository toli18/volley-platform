import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "../../components/ToastProvider";
import { Button, Input } from "../../components/ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).split("-");
  if (!d) return value;
  return `${d}.${m}.${y}`;
}

async function openPdf(path) {
  const res = await axiosInstance.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function emptyInvoiceItems() {
  return [{ description: "Месечна такса", qty: "1", unit: "бр.", unit_price: "" }];
}

export default function CoachClubDocuments() {
  const toast = useToast();
  const [tab, setTab] = useState("notes");
  const [defaults, setDefaults] = useState(null);
  const [notes, setNotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  const [noteForm, setNoteForm] = useState({
    athlete_id: "",
    recipient_name: "",
    recipient_egn: "",
    issued_at: todayIso(),
    city: "",
    representative_name: "",
    representative_title: "Председател на УС",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    athlete_id: "",
    issued_at: todayIso(),
    place_of_issue: "",
    buyer_name: "",
    buyer_id_number: "",
    buyer_address: "",
    vat_registered: false,
    vat_rate: 20,
    payment_method: "cash",
    bank_iban: "",
    bank_name: "",
    notes: "",
    items: emptyInvoiceItems(),
  });

  const athletes = defaults?.athletes || [];

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, n, i] = await Promise.all([
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_DEFAULTS),
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_NOTES),
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INVOICES),
      ]);
      setDefaults(d.data || null);
      setNotes(n.data?.items || []);
      setInvoices(i.data?.items || []);
      setNoteForm((prev) => ({
        ...prev,
        city: prev.city || d.data?.city || "",
        representative_name: prev.representative_name || d.data?.contact_name || "",
        representative_title: prev.representative_title || d.data?.representative_title || "Председател на УС",
        issued_at: prev.issued_at || d.data?.today || todayIso(),
      }));
      setInvoiceForm((prev) => ({
        ...prev,
        place_of_issue: prev.place_of_issue || d.data?.city || "",
        issued_at: prev.issued_at || d.data?.today || todayIso(),
      }));
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на документите."));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pickAthleteForNote = (id) => {
    const a = athletes.find((x) => String(x.id) === String(id));
    setNoteForm((p) => ({
      ...p,
      athlete_id: id,
      recipient_name: a?.athlete_name || p.recipient_name,
      recipient_egn: a?.egn || p.recipient_egn,
    }));
  };

  const pickAthleteForInvoice = (id) => {
    const a = athletes.find((x) => String(x.id) === String(id));
    setInvoiceForm((p) => ({
      ...p,
      athlete_id: id,
      buyer_name: a?.parent_name || a?.athlete_name || p.buyer_name,
      buyer_id_number: a?.egn || p.buyer_id_number,
    }));
  };

  const saveNote = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_NOTES, {
        athlete_id: noteForm.athlete_id ? Number(noteForm.athlete_id) : null,
        recipient_name: noteForm.recipient_name,
        recipient_egn: noteForm.recipient_egn,
        issued_at: noteForm.issued_at,
        city: noteForm.city,
        representative_name: noteForm.representative_name,
        representative_title: noteForm.representative_title,
      });
      toast.success("Служебната бележка е записана.");
      setShowNoteForm(false);
      setNoteForm((p) => ({
        ...p,
        athlete_id: "",
        recipient_name: "",
        recipient_egn: "",
        issued_at: todayIso(),
      }));
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на бележката."));
    } finally {
      setBusy(false);
    }
  };

  const saveInvoice = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_INVOICES, {
        athlete_id: invoiceForm.athlete_id ? Number(invoiceForm.athlete_id) : null,
        issued_at: invoiceForm.issued_at,
        place_of_issue: invoiceForm.place_of_issue,
        buyer_name: invoiceForm.buyer_name,
        buyer_id_number: invoiceForm.buyer_id_number,
        buyer_address: invoiceForm.buyer_address,
        vat_registered: invoiceForm.vat_registered,
        vat_rate: Number(invoiceForm.vat_rate || 20),
        payment_method: invoiceForm.payment_method,
        bank_iban: invoiceForm.bank_iban,
        bank_name: invoiceForm.bank_name,
        notes: invoiceForm.notes,
        items: invoiceForm.items.map((row) => ({
          description: row.description,
          qty: Number(row.qty || 1),
          unit: row.unit || "бр.",
          unit_price: Number(String(row.unit_price).replace(",", ".") || 0),
        })),
      });
      toast.success("Фактурата е записана.");
      setShowInvoiceForm(false);
      setInvoiceForm((p) => ({
        ...p,
        athlete_id: "",
        buyer_name: "",
        buyer_id_number: "",
        buyer_address: "",
        notes: "",
        items: emptyInvoiceItems(),
        issued_at: todayIso(),
      }));
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на фактурата."));
    } finally {
      setBusy(false);
    }
  };

  const invoicePreviewTotal = useMemo(() => {
    return invoiceForm.items.reduce((sum, row) => {
      const qty = Number(String(row.qty).replace(",", ".") || 0);
      const price = Number(String(row.unit_price).replace(",", ".") || 0);
      return sum + qty * price;
    }, 0);
  }, [invoiceForm.items]);

  const setItem = (idx, key, value) => {
    setInvoiceForm((p) => ({
      ...p,
      items: p.items.map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
    }));
  };

  return (
    <div className="coachMobilePage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Документи</h2>
        <span className="feesCoachHeadBadge">{notes.length + invoices.length}</span>
      </header>
      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Служебни бележки и фактури на клуба. Записват се тук и се отварят като PDF за печат.
        {defaults?.club_full_name ? ` Издател: ${defaults.club_full_name}.` : ""}
      </p>

      <div className="coachMobileSubNav" style={{ marginBottom: 12 }}>
        {[
          { id: "notes", label: `Бележки (${notes.length})` },
          { id: "invoices", label: `Фактури (${invoices.length})` },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`coachMobileSubNavBtn${tab === f.id ? " is-active" : ""}`}
            onClick={() => setTab(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tab === "notes" ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button type="button" onClick={() => setShowNoteForm((v) => !v)}>
              {showNoteForm ? "Скрий формата" : "Нова служебна бележка"}
            </Button>
          </div>
          {showNoteForm ? (
            <form
              onSubmit={saveNote}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff", marginBottom: 14 }}
            >
              <p style={{ marginTop: 0, fontWeight: 700 }}>Без финансови претенции към състезателя</p>
              <label className="uiField" style={{ display: "block", marginBottom: 8 }}>
                <span className="uiFieldLabel">Състезател (попълва име и ЕГН)</span>
                <select
                  className="uiControl"
                  value={noteForm.athlete_id}
                  onChange={(e) => pickAthleteForNote(e.target.value)}
                >
                  <option value="">— ръчно —</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.athlete_name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Три имена"
                value={noteForm.recipient_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_name: e.target.value }))}
                required
              />
              <Input
                label="ЕГН"
                value={noteForm.recipient_egn}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_egn: e.target.value }))}
                required
                inputMode="numeric"
              />
              <Input
                label="Дата"
                type="date"
                value={noteForm.issued_at}
                onChange={(e) => setNoteForm((p) => ({ ...p, issued_at: e.target.value }))}
                required
              />
              <Input
                label="Град / място"
                value={noteForm.city}
                onChange={(e) => setNoteForm((p) => ({ ...p, city: e.target.value }))}
              />
              <Input
                label="Председател / представляващ"
                value={noteForm.representative_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_name: e.target.value }))}
                required
              />
              <Input
                label="Длъжност"
                value={noteForm.representative_title}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_title: e.target.value }))}
              />
              <p className="coachMobileMuted" style={{ fontSize: 13 }}>
                Текстът следва бланката: клубът няма финансови претенции и състезателят може да се картотекира
                другаде. Печат и подпис се слагат върху разпечатката.
              </p>
              <Button type="submit" disabled={busy}>
                Запиши бележката
              </Button>
            </form>
          ) : null}

          {busy && !notes.length ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!busy && notes.length === 0 ? <p className="coachMobileMuted">Няма записани бележки.</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {notes.map((row) => (
              <li key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{row.recipient_name}</strong>
                  <span className="coachMobileMuted">№ {row.number} · {fmtDate(row.issued_at)}</span>
                </div>
                <div className="coachMobileMuted" style={{ marginTop: 4 }}>
                  ЕГН {row.recipient_egn}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await openPdf(API_PATHS.CLUB_DOCUMENTS_NOTE_PDF(row.id));
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешен PDF."));
                      }
                    }}
                  >
                    Преглед / печат
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!window.confirm("Изтриване на бележката?")) return;
                      try {
                        await axiosInstance.delete(API_PATHS.CLUB_DOCUMENTS_NOTE(row.id));
                        toast.success("Изтрита.");
                        await load();
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешно изтриване."));
                      }
                    }}
                  >
                    Изтрий
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button type="button" onClick={() => setShowInvoiceForm((v) => !v)}>
              {showInvoiceForm ? "Скрий формата" : "Нова фактура"}
            </Button>
          </div>
          {showInvoiceForm ? (
            <form
              onSubmit={saveInvoice}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff", marginBottom: 14 }}
            >
              <p style={{ marginTop: 0, fontWeight: 700 }}>
                Следващ номер: {defaults?.next_invoice_number || "—"}
              </p>
              <label className="uiField" style={{ display: "block", marginBottom: 8 }}>
                <span className="uiFieldLabel">Свържи със състезател (по желание)</span>
                <select
                  className="uiControl"
                  value={invoiceForm.athlete_id}
                  onChange={(e) => pickAthleteForInvoice(e.target.value)}
                >
                  <option value="">— без връзка —</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.athlete_name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Получател"
                value={invoiceForm.buyer_name}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_name: e.target.value }))}
                required
              />
              <Input
                label="ЕГН / ЕИК на получателя"
                value={invoiceForm.buyer_id_number}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_id_number: e.target.value }))}
              />
              <Input
                label="Адрес на получателя"
                value={invoiceForm.buyer_address}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_address: e.target.value }))}
              />
              <Input
                label="Дата"
                type="date"
                value={invoiceForm.issued_at}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, issued_at: e.target.value }))}
                required
              />
              <Input
                label="Място на издаване"
                value={invoiceForm.place_of_issue}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, place_of_issue: e.target.value }))}
              />
              <label className="uiField" style={{ display: "block", marginBottom: 8 }}>
                <span className="uiFieldLabel">Начин на плащане</span>
                <select
                  className="uiControl"
                  value={invoiceForm.payment_method}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, payment_method: e.target.value }))}
                >
                  <option value="cash">В брой</option>
                  <option value="bank">По банков път</option>
                  <option value="card">С карта</option>
                </select>
              </label>
              {invoiceForm.payment_method === "bank" ? (
                <>
                  <Input
                    label="IBAN"
                    value={invoiceForm.bank_iban}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, bank_iban: e.target.value }))}
                  />
                  <Input
                    label="Банка"
                    value={invoiceForm.bank_name}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, bank_name: e.target.value }))}
                  />
                </>
              ) : null}
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={invoiceForm.vat_registered}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, vat_registered: e.target.checked }))}
                />
                Клубът е регистриран по ЗДДС
              </label>
              {invoiceForm.vat_registered ? (
                <Input
                  label="ДДС %"
                  type="number"
                  value={invoiceForm.vat_rate}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, vat_rate: e.target.value }))}
                />
              ) : (
                <p className="coachMobileMuted" style={{ fontSize: 13 }}>
                  На фактурата ще пише, че лицето не е регистрирано по ЗДДС.
                </p>
              )}

              <p style={{ fontWeight: 700, marginBottom: 6 }}>Редове</p>
              {invoiceForm.items.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <Input
                    label={`Описание ${idx + 1}`}
                    value={row.description}
                    onChange={(e) => setItem(idx, "description", e.target.value)}
                    required
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <Input label="Кол." value={row.qty} onChange={(e) => setItem(idx, "qty", e.target.value)} />
                    <Input label="Мярка" value={row.unit} onChange={(e) => setItem(idx, "unit", e.target.value)} />
                    <Input
                      label="Ед. цена (лв.)"
                      value={row.unit_price}
                      onChange={(e) => setItem(idx, "unit_price", e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setInvoiceForm((p) => ({
                      ...p,
                      items: [...p.items, { description: "", qty: "1", unit: "бр.", unit_price: "" }],
                    }))
                  }
                >
                  Добави ред
                </Button>
                {invoiceForm.items.length > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setInvoiceForm((p) => ({ ...p, items: p.items.slice(0, -1) }))}
                  >
                    Махни последния ред
                  </Button>
                ) : null}
              </div>
              <p style={{ fontWeight: 700 }}>Общо: {invoicePreviewTotal.toFixed(2)} BGN</p>
              <Input
                label="Забележка"
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
              />
              <Button type="submit" disabled={busy}>
                Запиши фактурата
              </Button>
            </form>
          ) : null}

          {busy && !invoices.length ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!busy && invoices.length === 0 ? <p className="coachMobileMuted">Няма записани фактури.</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {invoices.map((row) => (
              <li key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>
                    № {row.number} · {row.buyer_name}
                  </strong>
                  <span className="coachMobileMuted">
                    {fmtDate(row.issued_at)} · {row.total} {row.currency}
                    {row.status === "cancelled" ? " · анулирана" : ""}
                  </span>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await openPdf(API_PATHS.CLUB_DOCUMENTS_INVOICE_PDF(row.id));
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешен PDF."));
                      }
                    }}
                  >
                    Преглед / печат
                  </Button>
                  {row.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!window.confirm("Анулиране на фактурата? Номерът се запазва.")) return;
                        try {
                          await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_INVOICE_CANCEL(row.id));
                          toast.success("Анулирана.");
                          await load();
                        } catch (err) {
                          toast.error(normalizeError(err, "Неуспешно анулиране."));
                        }
                      }}
                    >
                      Анулирай
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!window.confirm("Изтриване на фактурата от списъка?")) return;
                      try {
                        await axiosInstance.delete(API_PATHS.CLUB_DOCUMENTS_INVOICE(row.id));
                        toast.success("Изтрита.");
                        await load();
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешно изтриване."));
                      }
                    }}
                  >
                    Изтрий
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
