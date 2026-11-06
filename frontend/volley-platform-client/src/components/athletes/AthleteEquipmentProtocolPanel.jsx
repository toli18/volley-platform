import { useEffect, useMemo, useState } from "react";

import { Button, Input, Modal } from "../ui";
import SignaturePad from "../parentPortal/SignaturePad";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

const KIT_KEY = "kit";

function emptyIssueForm(seasonDefault) {
  return {
    season: seasonDefault || "",
    kitQty: 1,
    extraItems: [],
    notes: "",
    signerRole: "athlete",
    signerName: "",
  };
}

function statusLabel(status) {
  if (status === "returned") return "Върнато";
  if (status === "issued") return "Предадено";
  return status || "";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("bg-BG");
  } catch {
    return iso;
  }
}

function itemsLine(items) {
  return (items || [])
    .map((it) => `${it.label} ×${it.qty}${it.note ? ` (${it.note})` : ""}`)
    .join("; ");
}

/**
 * Приемо-предавателен протокол за екипировка от профила на състезателя.
 */
export default function AthleteEquipmentProtocolPanel({
  athleteId,
  athleteName,
  parentName,
  toast,
  onChanged,
}) {
  const [busy, setBusy] = useState(false);
  const [seasonDefault, setSeasonDefault] = useState("");
  const [protocols, setProtocols] = useState([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [form, setForm] = useState(() => emptyIssueForm(""));
  const [sigRecipient, setSigRecipient] = useState(null);
  const [sigCoach, setSigCoach] = useState(null);
  const [returnNotes, setReturnNotes] = useState("");
  const [formError, setFormError] = useState("");

  const openIssued = useMemo(
    () => (protocols || []).filter((p) => p.status === "issued"),
    [protocols],
  );

  const load = async () => {
    if (!athleteId) return;
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.ATHLETE_EQUIPMENT_PROTOCOLS(athleteId));
      setProtocols(res.data?.protocols || []);
      setSeasonDefault(res.data?.season_default || "");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на протоколите."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [athleteId]);

  const openIssue = () => {
    setForm(emptyIssueForm(seasonDefault));
    setSigRecipient(null);
    setSigCoach(null);
    setFormError("");
    setIssueOpen(true);
  };

  const openReturn = (row) => {
    setActiveRow(row);
    setReturnNotes("");
    setSigRecipient(null);
    setSigCoach(null);
    setFormError("");
    setReturnOpen(true);
  };

  const addExtraItem = () => {
    setForm((f) => ({
      ...f,
      extraItems: [...(f.extraItems || []), { label: "", qty: 1, note: "" }],
    }));
  };

  const buildItemsPayload = () => {
    const items = [
      {
        key: KIT_KEY,
        label: "Състезателен екип",
        qty: Number(form.kitQty) === 2 ? 2 : 1,
        unit: "бр.",
      },
    ];
    for (const row of form.extraItems || []) {
      const label = String(row.label || "").trim();
      if (!label) continue;
      items.push({
        key: "other",
        label,
        qty: Math.max(1, Math.min(99, Number(row.qty) || 1)),
        unit: "бр.",
        note: String(row.note || "").trim() || undefined,
      });
    }
    return items;
  };

  const submitIssue = async () => {
    setFormError("");
    if (!sigRecipient) {
      setFormError("Нужен е подпис на получателя.");
      return;
    }
    if (!sigCoach) {
      setFormError("Нужен е подпис на треньора.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.ATHLETE_EQUIPMENT_PROTOCOLS(athleteId), {
        season: form.season || seasonDefault || undefined,
        notes: form.notes || undefined,
        items: buildItemsPayload(),
        recipient_signer_role: form.signerRole,
        recipient_signer_name:
          form.signerName ||
          (form.signerRole === "parent" ? parentName : athleteName) ||
          undefined,
        signature_recipient_image: sigRecipient,
        signature_coach_image: sigCoach,
      });
      toast?.success("Протоколът е записан.");
      setIssueOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(normalizeError(err, "Неуспешен запис на протокола."));
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!activeRow) return;
    setFormError("");
    if (!sigRecipient) {
      setFormError("Нужен е подпис при връщане.");
      return;
    }
    if (!sigCoach) {
      setFormError("Нужен е подпис на треньора.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(
        API_PATHS.ATHLETE_EQUIPMENT_PROTOCOL_RETURN(athleteId, activeRow.id),
        {
          notes: returnNotes || undefined,
          signature_recipient_image: sigRecipient,
          signature_coach_image: sigCoach,
        },
      );
      toast?.success("Връщането е записано.");
      setReturnOpen(false);
      setActiveRow(null);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(normalizeError(err, "Неуспешен запис на връщането."));
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async (row) => {
    try {
      const res = await axiosInstance.get(API_PATHS.ATHLETE_EQUIPMENT_PROTOCOL_PDF(athleteId, row.id), {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно отваряне на PDF."));
    }
  };

  return (
    <div className="athleteEquipmentPanel">
      <div className="athleteProfileInlineActions" style={{ marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <Button type="button" size="sm" onClick={openIssue} disabled={busy}>
          Нов протокол
        </Button>
        {openIssued.length > 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Отворени за връщане: {openIssued.length}
          </span>
        ) : null}
      </div>

      {protocols.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
          Няма записани протоколи. Предайте екип (1 или 2 бр.) и друга екипировка с подпис пред треньора.
        </p>
      ) : (
        <ul className="athleteProfileAttList">
          {protocols.map((row) => (
            <li key={row.id} className="athleteProfileTimelineCard">
              <div className="athleteProfileTimelineWhen">
                {formatDate(row.issued_at)}
                {row.number ? ` · № ${row.number}` : ""}
                {row.season ? ` · ${row.season}` : ""}
              </div>
              <div className="athleteProfileTimelineLabel">
                {statusLabel(row.status)}
                {row.status === "returned" && row.returned_at
                  ? ` · върнато на ${formatDate(row.returned_at)}`
                  : ""}
              </div>
              <div className="athleteProfileTimelineMeta">{itemsLine(row.items)}</div>
              <div className="athleteProfileInlineActions" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                <Button type="button" size="sm" variant="secondary" onClick={() => openPdf(row)}>
                  PDF
                </Button>
                {row.status === "issued" ? (
                  <Button type="button" size="sm" onClick={() => openReturn(row)}>
                    Връщане
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={issueOpen}
        onClose={busy ? undefined : () => setIssueOpen(false)}
        dismissable={!busy}
        title="Предаване на екипировка"
        size="wide"
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label>
            <span className="muted" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
              Сезон
            </span>
            <Input
              value={form.season}
              onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
              placeholder={seasonDefault || "2025/2026"}
            />
          </label>

          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>
              Състезателен екип
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={Number(form.kitQty) === n ? "primary" : "secondary"}
                  onClick={() => setForm((f) => ({ ...f, kitQty: n }))}
                >
                  {n} бр.
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span className="muted" style={{ fontSize: 12 }}>
                Друга екипировка
              </span>
              <Button type="button" size="sm" variant="secondary" onClick={addExtraItem}>
                + позиция
              </Button>
            </div>
            {(form.extraItems || []).map((row, idx) => (
              <div key={idx} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                <Input
                  placeholder="Напр. наколенки, шорти, топка"
                  value={row.label}
                  onChange={(e) =>
                    setForm((f) => {
                      const next = [...(f.extraItems || [])];
                      next[idx] = { ...next[idx], label: e.target.value };
                      return { ...f, extraItems: next };
                    })
                  }
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    style={{ maxWidth: 88 }}
                    value={row.qty}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...(f.extraItems || [])];
                        next[idx] = { ...next[idx], qty: e.target.value };
                        return { ...f, extraItems: next };
                      })
                    }
                  />
                  <Input
                    placeholder="Бележка (по желание)"
                    value={row.note || ""}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...(f.extraItems || [])];
                        next[idx] = { ...next[idx], note: e.target.value };
                        return { ...f, extraItems: next };
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <label>
            <span className="muted" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
              Кой подписва като получател
            </span>
            <select
              className="uiInput"
              value={form.signerRole}
              onChange={(e) => setForm((f) => ({ ...f, signerRole: e.target.value }))}
            >
              <option value="athlete">Състезател</option>
              <option value="parent">Родител</option>
            </select>
          </label>
          <label>
            <span className="muted" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
              Име на подписалия
            </span>
            <Input
              value={form.signerName}
              onChange={(e) => setForm((f) => ({ ...f, signerName: e.target.value }))}
              placeholder={
                form.signerRole === "parent"
                  ? parentName || "Име на родител"
                  : athleteName || "Име на състезател"
              }
            />
          </label>

          <label>
            <span className="muted" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
              Бележки
            </span>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="По желание"
            />
          </label>

          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.35 }}>
            Получателят се задължава да върне екипировката в края на сезона пред треньора.
          </p>

          <SignaturePad
            label={form.signerRole === "parent" ? "Подпис на родител" : "Подпис на състезател"}
            required
            disabled={busy}
            onChange={setSigRecipient}
          />
          <SignaturePad label="Подпис на треньора" required disabled={busy} onChange={setSigCoach} />

          {formError ? (
            <p style={{ color: "var(--danger, #b91c1c)", margin: 0, fontSize: 13 }}>{formError}</p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button type="button" disabled={busy} onClick={submitIssue}>
              {busy ? "Запис…" : "Запиши с подписи"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setIssueOpen(false)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={returnOpen}
        onClose={busy ? undefined : () => setReturnOpen(false)}
        dismissable={!busy}
        title="Връщане на екипировка"
        size="wide"
      >
        <div style={{ display: "grid", gap: 12 }}>
          {activeRow ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
              {itemsLine(activeRow.items)}
              {activeRow.number ? ` · № ${activeRow.number}` : ""}
            </p>
          ) : null}
          <label>
            <span className="muted" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
              Бележки при връщане
            </span>
            <Input
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="По желание"
            />
          </label>
          <SignaturePad label="Подпис на получателя" required disabled={busy} onChange={setSigRecipient} />
          <SignaturePad label="Подпис на треньора" required disabled={busy} onChange={setSigCoach} />
          {formError ? (
            <p style={{ color: "var(--danger, #b91c1c)", margin: 0, fontSize: 13 }}>{formError}</p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button type="button" disabled={busy} onClick={submitReturn}>
              {busy ? "Запис…" : "Потвърди връщане"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setReturnOpen(false)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
