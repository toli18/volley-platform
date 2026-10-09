import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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

function athleteMatches(a, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = `${a.athlete_name || ""} ${a.egn || ""} ${a.parent_name || ""} ${a.birth_year || ""}`.toLowerCase();
  return hay.includes(q);
}

function AthleteSearch({ athletes, value, onPick, placeholder = "Търси по име или ЕГН…" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = athletes.find((a) => String(a.id) === String(value));
  const filtered = useMemo(
    () => athletes.filter((a) => athleteMatches(a, query)).slice(0, 12),
    [athletes, query],
  );

  return (
    <div className="uiField" style={{ marginBottom: 8, position: "relative" }}>
      <span className="uiFieldLabel">Състезател</span>
      {selected ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: "8px 10px",
            background: "#f8fafc",
          }}
        >
          <span>
            <strong>{selected.athlete_name}</strong>
            {selected.egn ? <span className="coachMobileMuted"> · ЕГН {selected.egn}</span> : null}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              onPick("");
              setQuery("");
              setOpen(true);
            }}
          >
            Смени
          </Button>
        </div>
      ) : (
        <>
          <input
            className="uiControl"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open ? (
            <ul
              style={{
                listStyle: "none",
                margin: "4px 0 0",
                padding: 0,
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                background: "#fff",
                maxHeight: 220,
                overflow: "auto",
                position: "absolute",
                zIndex: 5,
                left: 0,
                right: 0,
              }}
            >
              {filtered.length === 0 ? (
                <li className="coachMobileMuted" style={{ padding: "8px 10px" }}>
                  Няма съвпадение. Попълни името ръчно по-долу.
                </li>
              ) : (
                filtered.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(String(a.id));
                        setQuery("");
                        setOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: 0,
                        background: "transparent",
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {a.athlete_name}
                      {a.birth_year ? ` · ${a.birth_year}` : ""}
                      {a.egn ? ` · ${a.egn}` : ""}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function fmtBirth(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  if (!d) return iso;
  return `${d}.${m}.${y}`;
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
  const [insurance, setInsurance] = useState(null);
  const [insBusy, setInsBusy] = useState(false);
  const [insFilters, setInsFilters] = useState({
    season_year: String(new Date().getFullYear()),
    status: "active",
    sek: "any",
    carded: "any",
    gender: "any",
    team_id: "",
    require_egn: false,
  });

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
        representative_name: prev.representative_name || d.data?.representative_name || d.data?.contact_name || "",
        representative_title: prev.representative_title || d.data?.representative_title || "Председател на УС",
        issued_at: d.data?.today || prev.issued_at || todayIso(),
      }));
      setInvoiceForm((prev) => ({
        ...prev,
        place_of_issue: prev.place_of_issue || d.data?.city || "",
        issued_at: d.data?.today || prev.issued_at || todayIso(),
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

  const loadInsurance = useCallback(async () => {
    setInsBusy(true);
    try {
      const params = {
        season_year: Number(insFilters.season_year) || new Date().getFullYear(),
        status: insFilters.status,
        sek: insFilters.sek,
        carded: insFilters.carded,
        gender: insFilters.gender,
        require_egn: Boolean(insFilters.require_egn),
      };
      if (insFilters.team_id) params.team_id = Number(insFilters.team_id);
      const res = await axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INSURANCE_ROSTER, { params });
      setInsurance(res.data || null);
    } catch (err) {
      setInsurance(null);
      toast.error(normalizeError(err, "Неуспешно зареждане на списъка за застраховка."));
    } finally {
      setInsBusy(false);
    }
  }, [insFilters, toast]);

  useEffect(() => {
    if (tab !== "insurance") return;
    loadInsurance();
  }, [tab, loadInsurance]);

  const downloadInsuranceXlsx = async () => {
    try {
      setInsBusy(true);
      const params = {
        season_year: Number(insFilters.season_year) || new Date().getFullYear(),
        status: insFilters.status,
        sek: insFilters.sek,
        carded: insFilters.carded,
        gender: insFilters.gender,
        require_egn: Boolean(insFilters.require_egn),
      };
      if (insFilters.team_id) params.team_id = Number(insFilters.team_id);
      const res = await axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INSURANCE_ROSTER_XLSX, {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zastrahovka_${params.season_year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Excel файлът е изтеглен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтегляне."));
    } finally {
      setInsBusy(false);
    }
  };

  const pickAthleteForNote = (id) => {
    if (!id) {
      setNoteForm((p) => ({ ...p, athlete_id: "", recipient_name: "", recipient_egn: "" }));
      return;
    }
    const a = athletes.find((x) => String(x.id) === String(id));
    setNoteForm((p) => ({
      ...p,
      athlete_id: id,
      recipient_name: a?.athlete_name || "",
      recipient_egn: a?.egn || "",
      city: p.city || defaults?.city || "",
      representative_name: p.representative_name || defaults?.representative_name || "",
    }));
  };

  const pickAthleteForInvoice = (id) => {
    if (!id) {
      setInvoiceForm((p) => ({ ...p, athlete_id: "", buyer_name: "", buyer_id_number: "" }));
      return;
    }
    const a = athletes.find((x) => String(x.id) === String(id));
    setInvoiceForm((p) => ({
      ...p,
      athlete_id: id,
      buyer_name: a?.parent_name || a?.athlete_name || "",
      buyer_id_number: a?.egn || "",
      place_of_issue: p.place_of_issue || defaults?.city || "",
    }));
  };

  const openNoteForm = () => {
    setNoteForm((p) => ({
      ...p,
      issued_at: defaults?.today || todayIso(),
      city: p.city || defaults?.city || "",
      representative_name: p.representative_name || defaults?.representative_name || "",
      representative_title: p.representative_title || defaults?.representative_title || "Председател на УС",
    }));
    setShowNoteForm(true);
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
        Служебни бележки, фактури и списък за застраховка. Бележките и фактурите се отварят като PDF за печат.
        {defaults?.club_full_name ? ` Издател: ${defaults.club_full_name}.` : ""}
      </p>

      <div className="coachMobileSubNav" style={{ marginBottom: 12 }}>
        {[
          { id: "notes", label: `Бележки (${notes.length})` },
          { id: "invoices", label: `Фактури (${invoices.length})` },
          { id: "insurance", label: `Застраховки${insurance?.count != null ? ` (${insurance.count})` : ""}` },
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
            <Button type="button" onClick={() => (showNoteForm ? setShowNoteForm(false) : openNoteForm())}>
              {showNoteForm ? "Скрий формата" : "Нова служебна бележка"}
            </Button>
          </div>
          {showNoteForm ? (
            <form
              onSubmit={saveNote}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff", marginBottom: 14 }}
            >
              <p style={{ marginTop: 0, fontWeight: 700 }}>Без финансови претенции към състезателя</p>
              <p className="coachMobileMuted" style={{ fontSize: 13, marginTop: 0 }}>
                Търси състезател — името и ЕГН се попълват. Град и председател идват от{" "}
                <Link to="/coach/club-profile">профила на клуба</Link>.
              </p>
              <AthleteSearch athletes={athletes} value={noteForm.athlete_id} onPick={pickAthleteForNote} />
              {noteForm.athlete_id && !noteForm.recipient_egn ? (
                <p className="coachMobileMuted" style={{ fontSize: 13, color: "#b45309" }}>
                  На този състезател липсва ЕГН в профила — допълни го ръчно или го запиши в картата на състезателя.
                </p>
              ) : null}
              <Input
                label="Три имена"
                value={noteForm.recipient_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_name: e.target.value }))}
                required
              />
              <Input
                label="ЕГН"
                value={noteForm.recipient_egn}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_egn: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                required
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
              />
              <Input
                label="Дата"
                type="date"
                value={noteForm.issued_at}
                onChange={(e) => setNoteForm((p) => ({ ...p, issued_at: e.target.value }))}
                required
              />
              <Input
                label="Град / място (от клуба)"
                value={noteForm.city}
                onChange={(e) => setNoteForm((p) => ({ ...p, city: e.target.value }))}
                hint={!defaults?.city ? "Попълни града в Профил на клуба, за да се слага сам." : undefined}
              />
              <Input
                label="Председател / представляващ (от клуба)"
                value={noteForm.representative_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_name: e.target.value }))}
                required
                hint={
                  !defaults?.representative_name
                    ? "Сложи името на председателя в Профил на клуба."
                    : undefined
                }
              />
              <Input
                label="Длъжност"
                value={noteForm.representative_title}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_title: e.target.value }))}
              />
              <p className="coachMobileMuted" style={{ fontSize: 13 }}>
                Текстът на бланката се сглобява автоматично. Печат и подпис се слагат върху разпечатката.
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
      ) : null}

      {tab === "invoices" ? (
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
              <AthleteSearch
                athletes={athletes}
                value={invoiceForm.athlete_id}
                onPick={pickAthleteForInvoice}
                placeholder="Търси състезател — попълва получател…"
              />
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
      ) : null}

      {tab === "insurance" ? (
        <>
          <p className="coachMobileMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Извличаш списък от състезателите в приложението за застраховка. Филтрирай по СЕК, картотека,
            група и пол, после изтегли Excel.
          </p>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 12,
              background: "#fff",
              marginBottom: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <label className="uiField" style={{ margin: 0, minWidth: 100 }}>
                <span className="uiFieldLabel">Сезон</span>
                <input
                  className="uiControl"
                  value={insFilters.season_year}
                  onChange={(e) => setInsFilters((p) => ({ ...p, season_year: e.target.value }))}
                  inputMode="numeric"
                  style={{ width: 100 }}
                />
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 140 }}>
                <span className="uiFieldLabel">Статус</span>
                <select
                  className="uiControl"
                  value={insFilters.status}
                  onChange={(e) => setInsFilters((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Активни</option>
                  <option value="all">Всички</option>
                  <option value="inactive">Неактивни</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 140 }}>
                <span className="uiFieldLabel">СЕК</span>
                <select
                  className="uiControl"
                  value={insFilters.sek}
                  onChange={(e) => setInsFilters((p) => ({ ...p, sek: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="in_sek">В СЕК</option>
                  <option value="not_in_sek">Без СЕК</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 160 }}>
                <span className="uiFieldLabel">Картотека ({insFilters.season_year})</span>
                <select
                  className="uiControl"
                  value={insFilters.carded}
                  onChange={(e) => setInsFilters((p) => ({ ...p, carded: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="carded">Картотекирани</option>
                  <option value="not_carded">Некартотекирани</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 120 }}>
                <span className="uiFieldLabel">Пол</span>
                <select
                  className="uiControl"
                  value={insFilters.gender}
                  onChange={(e) => setInsFilters((p) => ({ ...p, gender: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="female">Момичета</option>
                  <option value="male">Момчета</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 160 }}>
                <span className="uiFieldLabel">Група</span>
                <select
                  className="uiControl"
                  value={insFilters.team_id}
                  onChange={(e) => setInsFilters((p) => ({ ...p, team_id: e.target.value }))}
                >
                  <option value="">Всички групи</option>
                  {(insurance?.teams || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={Boolean(insFilters.require_egn)}
                onChange={(e) => setInsFilters((p) => ({ ...p, require_egn: e.target.checked }))}
              />
              Само с ЕГН (нужно за повечето застрахователни бланки)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="button" variant="secondary" disabled={insBusy} onClick={loadInsurance}>
                {insBusy ? "Зареждане…" : "Обнови списъка"}
              </Button>
              <Button type="button" disabled={insBusy || !(insurance?.count > 0)} onClick={downloadInsuranceXlsx}>
                Изтегли Excel ({insurance?.count ?? 0})
              </Button>
            </div>
          </div>

          {insBusy && !insurance ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!insBusy && insurance && insurance.count === 0 ? (
            <p className="coachMobileMuted">Няма състезатели по тези филтри.</p>
          ) : null}
          {insurance?.items?.length ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {insurance.items.map((row, idx) => (
                <li
                  key={row.id}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>
                      {idx + 1}. {row.athlete_name}
                    </strong>
                    <span className="coachMobileMuted">
                      {row.in_sek ? "в СЕК" : "без СЕК"}
                      {row.is_carded ? " · картотекиран" : ""}
                    </span>
                  </div>
                  <div className="coachMobileMuted" style={{ marginTop: 4, fontSize: 13 }}>
                    ЕГН {row.egn || "—"} · роден {fmtBirth(row.birth_date)}
                    {row.gender_label ? ` · ${row.gender_label}` : ""}
                    {row.team_names?.length ? ` · ${row.team_names.join(", ")}` : ""}
                  </div>
                  {row.card_index_labels?.length ? (
                    <div className="coachMobileMuted" style={{ marginTop: 2, fontSize: 12 }}>
                      Картотеки: {row.card_index_labels.join(", ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
