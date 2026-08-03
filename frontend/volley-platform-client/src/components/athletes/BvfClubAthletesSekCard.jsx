import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import BvfCreateAthleteModal from "./BvfCreateAthleteModal";
import BvfLinkByEgnModal from "./BvfLinkByEgnModal";
import { Button, Card, EmptyState, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function readinessLabel(r) {
  switch (r) {
    case "ready_create":
      return "Готов за създаване";
    case "ready_create_need_photo":
      return "Липсва снимка";
    case "can_link":
      return "Може връзка по ЕГН";
    case "can_link_need_data":
      return "ЕГН има · липсват данни";
    case "need_data":
      return "Липсват данни";
    case "in_sek":
      return "В СЕК";
    default:
      return r || "—";
  }
}

/**
 * Таб „Състезатели“ в Админ БФВ: локални атлети → В СЕК / Липсват.
 * Link по ЕГН първо; create при готовност; задача към груповия треньор при липса на снимка/данни.
 */
export default function BvfClubAthletesSekCard({ toast, permanent }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [subTab, setSubTab] = useState("missing"); // missing | in_sek
  const [q, setQ] = useState("");
  const [linkTarget, setLinkTarget] = useState(null);
  const [createTarget, setCreateTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_ATHLETES_SEK_BOARD);
      setBoard(res.data || null);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на състезателите."));
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const list = subTab === "in_sek" ? board?.in_sek || [] : board?.missing_sek || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) => {
      const hay = `${r.athlete_name || ""} ${r.egn || ""} ${r.coach_name || ""} ${r.bvf_player_number || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [board, subTab, q]);

  const requestTask = async (athleteId) => {
    try {
      setBusyId(athleteId);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_REQUEST_SEK_TASK(athleteId), {});
      toast?.success(
        res.data?.coach_name
          ? `Съобщено на ${res.data.coach_name}: ${res.data.sek_task_detail || "липсва снимка/данни"}`
          : "Задачата е записана за груповия треньор.",
      );
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно изпращане към треньора."));
    } finally {
      setBusyId(null);
    }
  };

  const counts = board?.counts || {};

  return (
    <>
      <Card title="Състезатели → СЕК">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
          Локалните състезатели на клуба. Първо <strong>Свържи по ЕГН</strong> (ако вече е в СЕК), иначе{" "}
          <strong>Създай в СЕК</strong> при пълни данни + снимка. При липса — съобщи на груповия треньор.
        </p>

        {!permanent ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b45309" }}>
            За link/create е нужна постоянна връзка с БФВ (API ключ в таб „Връзка“).
          </p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <button
            type="button"
            className={`uiButton${subTab === "missing" ? "" : " uiButton--secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setSubTab("missing")}
          >
            Липсват в СЕК ({counts.missing_sek ?? 0})
          </button>
          <button
            type="button"
            className={`uiButton${subTab === "in_sek" ? "" : " uiButton--secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setSubTab("in_sek")}
          >
            Създадени в СЕК ({counts.in_sek ?? 0})
          </button>
          <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={load}>
            {loading ? "Зареждане…" : "Обнови"}
          </Button>
          <span className="uiBadge">Задачи: {counts.open_tasks ?? 0}</span>
          <span className="uiBadge">Готови за create: {counts.ready_create ?? 0}</span>
        </div>

        <label style={{ display: "grid", gap: 4, maxWidth: 320, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Търсене</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="име / ЕГН / треньор" />
        </label>

        {loading && !board ? (
          <p className="uiMuted">Зареждане…</p>
        ) : !rows.length ? (
          <EmptyState
            title={subTab === "in_sek" ? "Няма свързани в СЕК" : "Няма липсващи"}
            description={subTab === "in_sek" ? "Все още няма локални състезатели с БФВ id." : "Всички активни са в СЕК или филтърът е празен."}
          />
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 520, border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table className="uiTable" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Име</th>
                  <th>Треньор</th>
                  <th>Статус</th>
                  <th>Липси</th>
                  <th style={{ minWidth: 220 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.athlete_id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/coach/athletes/${r.athlete_id}`}>{r.athlete_name}</Link>
                      {r.bvf_player_number ? (
                        <div className="uiMuted" style={{ fontSize: 12, fontWeight: 400 }}>
                          № {r.bvf_player_number}
                        </div>
                      ) : null}
                    </td>
                    <td>{r.coach_name || "—"}</td>
                    <td>
                      <span
                        className={`uiBadge${
                          r.in_sek
                            ? " uiBadge--success"
                            : r.can_create
                              ? " uiBadge--success"
                              : r.readiness === "ready_create_need_photo"
                                ? " uiBadge--warning"
                                : ""
                        }`}
                      >
                        {readinessLabel(r.readiness)}
                      </span>
                      {r.sek_task_code ? (
                        <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>Задача: {r.sek_task_code}</div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 12, color: "#64748b", maxWidth: 180 }}>
                      {(r.missing || []).length ? (r.missing || []).join(", ") : "—"}
                    </td>
                    <td>
                      {r.in_sek ? (
                        <Link to={`/coach/athletes/${r.athlete_id}`}>
                          <Button type="button" size="sm" variant="secondary">
                            Профил
                          </Button>
                        </Link>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!r.can_link || !permanent || busyId === r.athlete_id}
                            onClick={() => setLinkTarget(r)}
                            title={!r.can_link ? "Нужен е ЕГН (10 цифри)" : undefined}
                          >
                            Свържи по ЕГН
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={!r.can_create || !permanent || busyId === r.athlete_id}
                            onClick={() => setCreateTarget(r)}
                            title={!r.can_create ? "Нужни са пълни данни и локална снимка" : undefined}
                          >
                            Създай в СЕК
                          </Button>
                          {!r.can_create ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busyId === r.athlete_id}
                              onClick={() => requestTask(r.athlete_id)}
                            >
                              {busyId === r.athlete_id ? "…" : "Съобщи на треньора"}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BvfLinkByEgnModal
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        athleteId={linkTarget?.athlete_id}
        athleteName={linkTarget?.athlete_name}
        initialEgn={linkTarget?.egn || ""}
        toast={toast}
        onLinked={() => {
          setLinkTarget(null);
          load();
        }}
      />

      <BvfCreateAthleteModal
        open={Boolean(createTarget)}
        onClose={() => setCreateTarget(null)}
        athleteId={createTarget?.athlete_id}
        athleteName={createTarget?.athlete_name}
        initialEgn={createTarget?.egn || ""}
        missing={createTarget?.missing || []}
        toast={toast}
        onCreated={() => {
          setCreateTarget(null);
          load();
        }}
      />
    </>
  );
}
