import { useCallback, useEffect, useState } from "react";

import useClubBvfLink from "../../hooks/useClubBvfLink";
import { Button, Card, EmptyState } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function statusBg(status) {
  if (status === "ready") return "#ecfdf5";
  if (status === "already_synced") return "#f1f5f9";
  if (status === "error") return "#fef2f2";
  return "#fffbeb";
}

function statusLabel(status) {
  if (status === "ready") return "Готов за изпращане";
  if (status === "already_synced") return "Вече в СЕК";
  if (status === "no_tests") return "Няма тестове";
  if (status === "sent") return "Изпратен";
  if (status === "error") return "Грешка";
  return status || "—";
}

/**
 * Клубен bulk sync: тестове → БФВ developments (Height/Weight/FullExtent/Attack/Block).
 */
export default function BvfClubPhysicalSyncCard({ toast, permanent }) {
  const { tokenBody } = useClubBvfLink();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [onlyPending, setOnlyPending] = useState(true);

  const canCallBvf = permanent || Boolean(token.trim());

  const loadPreview = useCallback(async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_PHYSICAL_CLUB_PREVIEW);
      setPreview(res.data);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен преглед на физическите данни."));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const sendAll = async () => {
    if (!canCallBvf) {
      toast?.error("Първо оторизирай клуба в „Връзка / импорт“ или постави token.");
      return;
    }
    const n = preview?.ready ?? 0;
    if (!n && onlyPending) {
      toast?.error("Няма състезатели с нови данни за изпращане.");
      return;
    }
    if (
      !window.confirm(
        onlyPending
          ? `Изпращане към СЕК за ${n} състезател(и) с нови тестове?`
          : "Изпращане към СЕК за всички с тестове (вкл. вече синхронизирани)?"
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PHYSICAL_CLUB_SEND, {
        ...tokenBody(token),
        only_pending: onlyPending,
      });
      setLastResult(res.data);
      const msg = `Изпратени: ${res.data?.sent || 0} · вече в СЕК: ${res.data?.skipped_synced || 0} · без тестове: ${res.data?.skipped_no_tests || 0} · грешки: ${res.data?.errors || 0}`;
      if (res.data?.errors) toast?.error(msg);
      else toast?.success(msg);
      await loadPreview();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно клубно изпращане. Нужен е write достъп към developments."));
    } finally {
      setBusy(false);
    }
  };

  const items = preview?.items || [];

  return (
    <Card title="Физически данни → СЕК (клуб)">
      <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
        Оеднаквява показателите, които СЕК приема (височина, тегло, разтег, атака, блок), с последните тестове в
        платформата — същото като бутонът в профила, но за всички свързани състезатели.
      </p>

      {preview ? (
        <p style={{ margin: "0 0 10px", fontSize: 14 }}>
          Свързани: <strong>{preview.total_linked}</strong>
          {" · "}
          готови: <strong style={{ color: "#166534" }}>{preview.ready}</strong>
          {" · "}
          вече в СЕК: <strong>{preview.already_synced}</strong>
          {" · "}
          без тестове: <strong style={{ color: "#92400e" }}>{preview.no_tests}</strong>
        </p>
      ) : null}

      {!permanent ? (
        <textarea
          className="uiInput"
          rows={2}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="БФВ token (ако няма постоянна връзка)"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", marginBottom: 8 }}
        />
      ) : null}

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 13 }}>
        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        Само нови / променени (пропусни вече синхронизираните)
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Button type="button" disabled={busy} onClick={sendAll}>
          {busy ? "Изпращане…" : "Изпрати физически данни за клуба"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={loadPreview}>
          Презареди преглед
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Няма свързани състезатели" description="Свържи спортисти със СЕК от таблото по-горе." />
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 320 }}>
          <table className="uiTable">
            <thead>
              <tr>
                <th>Име</th>
                <th>БФВ №</th>
                <th>Статус</th>
                <th>Дата тест</th>
                <th>В / Т / Р / А / Б</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const f = it.fields || {};
                return (
                  <tr key={it.athlete_id} style={{ background: statusBg(it.status) }}>
                    <td style={{ fontWeight: 600 }}>{it.athlete_name}</td>
                    <td>{it.bvf_player_number || it.bvf_player_id}</td>
                    <td>{statusLabel(it.status)}</td>
                    <td>{it.measured_at || "—"}</td>
                    <td style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                      {[f.height_cm, f.weight_kg, f.full_extent_cm, f.attack_cm, f.block_cm]
                        .map((v) => (v == null ? "—" : v))
                        .join(" / ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastResult?.results?.some((r) => r.status === "error") ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#991b1b" }}>
          {(lastResult.results || [])
            .filter((r) => r.status === "error")
            .slice(0, 5)
            .map((r) => (
              <div key={r.athlete_id}>
                {r.athlete_name}: {r.error}
              </div>
            ))}
        </div>
      ) : null}
    </Card>
  );
}
