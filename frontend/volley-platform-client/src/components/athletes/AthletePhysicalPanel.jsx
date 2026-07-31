import { useEffect, useState } from "react";

import { Button } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("bg-BG");
  } catch {
    return iso;
  }
}

/**
 * Картотечни показатели от тестовете → бутон „Изпрати данни“ към БФВ.
 * Без ръчно преписване.
 */
export default function AthletePhysicalPanel({ athleteId, bvfPlayerId, toast }) {
  const { permanent, tokenBody } = useClubBvfLink();
  const [items, setItems] = useState([]);
  const [fromTests, setFromTests] = useState(null);
  const [busy, setBusy] = useState(false);
  const canSend = Boolean(bvfPlayerId);

  const load = async () => {
    if (!athleteId) return;
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_PHYSICAL_LIST(athleteId));
      setItems(res.data?.items || []);
      setFromTests(res.data?.from_tests || null);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на показатели."));
    }
  };

  useEffect(() => {
    load();
  }, [athleteId]);

  const sendFromTests = async () => {
    if (!canSend) {
      toast?.error("Състезателят трябва да е свързан с БФВ.");
      return;
    }
    if (!permanent) {
      toast?.error("Нужна е постоянна връзка с БФВ (Администрация БФВ).");
      return;
    }
    if (!fromTests?.has_data) {
      toast?.error("Няма тестови данни за изпращане.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PHYSICAL_SEND_FROM_TESTS(athleteId), {
        ...tokenBody(""),
      });
      toast?.success(res.data?.already_synced ? "Тези стойности вече са в БФВ." : "Данните са изпратени към БФВ.");
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно изпращане към БФВ."));
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

  const mapping = fromTests?.mapping || [];
  const hasData = Boolean(fromTests?.has_data);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "grid",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
          От последното тестване
          {fromTests?.measured_at ? (
            <span className="uiMuted" style={{ fontWeight: 500 }}>
              {" "}
              · {fmtDate(fromTests.measured_at)}
            </span>
          ) : null}
        </div>

        {!hasData ? (
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Няма тестови стойности за картотека. Въведи ги в диагностиката / скаутинг.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
            {mapping.map((m) => (
              <div key={m.field} style={{ display: "grid", gap: 2 }}>
                <span className="uiMuted" style={{ fontSize: 11, fontWeight: 700 }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{m.value ?? "—"}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          <Button type="button" size="sm" disabled={busy || !canSend || !hasData} onClick={sendFromTests}>
            Изпрати данни
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
      </div>

      {items.length === 0 ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          Все още няма история на изпращания.
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
