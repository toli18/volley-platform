import { useEffect, useState } from "react";

import { Button, Input } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

const emptyForm = () => ({
  measured_at: new Date().toISOString().slice(0, 10),
  height_cm: "",
  weight_kg: "",
  full_extent_cm: "",
  attack_cm: "",
  block_cm: "",
  notes: "",
});

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("bg-BG");
  } catch {
    return iso;
  }
}

/**
 * Физически показатели в профила + изпращане към БФВ developments.
 */
export default function AthletePhysicalPanel({ athleteId, bvfPlayerId, toast }) {
  const { permanent, tokenBody } = useClubBvfLink();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const canSend = Boolean(bvfPlayerId);

  const load = async () => {
    if (!athleteId) return;
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_PHYSICAL_LIST(athleteId));
      setItems(res.data?.items || []);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на показатели."));
    }
  };

  useEffect(() => {
    load();
  }, [athleteId]);

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const numOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && String(v).trim() !== "" ? Math.round(n) : null;
  };

  const saveLocal = async () => {
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.BVF_ADMIN_PHYSICAL_CREATE(athleteId), {
        measured_at: form.measured_at,
        height_cm: numOrNull(form.height_cm),
        weight_kg: numOrNull(form.weight_kg),
        full_extent_cm: numOrNull(form.full_extent_cm),
        attack_cm: numOrNull(form.attack_cm),
        block_cm: numOrNull(form.block_cm),
        notes: form.notes.trim() || null,
      });
      toast?.success("Измерването е записано.");
      setForm(emptyForm());
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const sendToBvf = async (measurementId) => {
    if (!canSend) {
      toast?.error("Състезателят трябва да е свързан с БФВ.");
      return;
    }
    if (!permanent) {
      toast?.error("Нужна е постоянна връзка с БФВ (Администрация БФВ).");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PHYSICAL_SEND(measurementId), {
        ...tokenBody(""),
      });
      toast?.success(res.data?.already_synced ? "Вече е в БФВ." : "Изпратено към БФВ.");
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно изпращане към БФВ."));
    } finally {
      setBusy(false);
    }
  };

  const fetchFromBvf = async () => {
    if (!canSend) {
      toast?.error("Състезателят трябва да е свързан с БФВ.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PHYSICAL_FETCH(athleteId), {
        ...tokenBody(""),
      });
      toast?.success(`От БФВ: нови ${res.data?.imported || 0} / общо там ${res.data?.remote_count || 0}`);
      setItems(res.data?.items || []);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане от БФВ."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Дата</span>
          <Input type="date" value={form.measured_at} onChange={setField("measured_at")} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Височина (cm)</span>
          <Input value={form.height_cm} onChange={setField("height_cm")} inputMode="numeric" placeholder="175" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Тегло (kg)</span>
          <Input value={form.weight_kg} onChange={setField("weight_kg")} inputMode="numeric" placeholder="65" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Размах (cm)</span>
          <Input value={form.full_extent_cm} onChange={setField("full_extent_cm")} inputMode="numeric" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Атака (cm)</span>
          <Input value={form.attack_cm} onChange={setField("attack_cm")} inputMode="numeric" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Блок (cm)</span>
          <Input value={form.block_cm} onChange={setField("block_cm")} inputMode="numeric" />
        </label>
      </div>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Бележка</span>
        <Input value={form.notes} onChange={setField("notes")} placeholder="по желание" />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button type="button" size="sm" disabled={busy} onClick={saveLocal}>
          Запиши измерване
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy || !canSend} onClick={fetchFromBvf}>
          Зареди от БФВ
        </Button>
      </div>
      {!canSend ? (
        <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}>
          За изпращане към федерацията първо свържи състезателя с БФВ.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          Все още няма записани показатели.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="uiTable" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Вис.</th>
                <th>Тегло</th>
                <th>Размах</th>
                <th>Атака</th>
                <th>Блок</th>
                <th>БФВ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{fmtDate(row.measured_at)}</td>
                  <td>{row.height_cm ?? "—"}</td>
                  <td>{row.weight_kg ?? "—"}</td>
                  <td>{row.full_extent_cm ?? "—"}</td>
                  <td>{row.attack_cm ?? "—"}</td>
                  <td>{row.block_cm ?? "—"}</td>
                  <td>{row.synced ? "✓" : "○"}</td>
                  <td>
                    {!row.synced && canSend ? (
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => sendToBvf(row.id)}>
                        Изпрати
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
