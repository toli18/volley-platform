// src/pages/admin/FederationDashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, AdminSection, AdminStatCard, Button, Card, EmptyState } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };
const GENDER_LABELS = { male: "Мъже", female: "Жени" };

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на федеративното табло.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на федеративното табло.";
};

const fmtPct = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}%`);
const fmtNum = (v, digits = 1) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(digits));
const fmtDelta = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
};

function IndicativeBadge({ when, sample }) {
  if (!when) return null;
  return (
    <span className="uiBadge uiBadge--danger" title="Малка извадка — данните са индикативни">
      индикативно{sample != null ? ` · n=${sample}` : ""}
    </span>
  );
}

function Bar({ pct, color = "#0c6a47" }) {
  const w = Math.max(2, Math.min(100, Math.round(Number(pct) || 0)));
  return (
    <div style={{ height: 10, background: "#eef3fa", borderRadius: 999 }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 999 }} />
    </div>
  );
}

export default function FederationDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [windows, setWindows] = useState([]);
  const [windowId, setWindowId] = useState("");
  const [gender, setGender] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const ageBandOptions = useRef([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_WINDOWS);
        if (!alive) return;
        setWindows(Array.isArray(res.data) ? res.data : []);
      } catch {
        /* прозорците са по избор — таблото ползва последния по подразбиране */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (windowId) params.set("window_id", windowId);
      if (gender) params.set("gender", gender);
      if (ageBand) params.set("age_band", ageBand);
      const qs = params.toString();
      const res = await axiosInstance.get(
        `${API_PATHS.ASSESSMENT_FEDERATION_DASHBOARD}${qs ? `?${qs}` : ""}`
      );
      setData(res.data || null);
      if (!ageBand) {
        const bands = new Set();
        for (const r of res.data?.development_by_age || []) if (r.age_band) bands.add(r.age_band);
        for (const r of res.data?.norms || []) if (r.age_band) bands.add(r.age_band);
        if (bands.size) ageBandOptions.current = [...bands].sort();
      }
    } catch (err) {
      const msg = normalizeError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId, gender, ageBand]);

  const hasWindow = data && data.window_id != null;
  const maxScore = useMemo(() => {
    const vals = (data?.development_by_age || []).map((r) => Number(r.avg_score) || 0);
    return Math.max(100, ...vals);
  }, [data]);

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Федеративно табло"
        subtitle="Национална диагностична карта v1 — агрегиран изглед, без лични данни на деца."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? "Зареждане..." : "Обнови"}
          </Button>
        }
      />

      <AdminSection title="Филтри">
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span className="uiMuted">Прозорец</span>
              <select value={windowId} onChange={(e) => setWindowId(e.target.value)}>
                <option value="">Последен наличен</option>
                {windows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.season} · {PHASE_LABELS[w.phase] || w.phase}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span className="uiMuted">Пол</span>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Всички</option>
                <option value="male">Мъже</option>
                <option value="female">Жени</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span className="uiMuted">Възрастова група</span>
              <select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                <option value="">Всички</option>
                {ageBandOptions.current.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            {hasWindow ? (
              <span className="uiBadge" style={{ marginLeft: "auto" }}>
                {data.window_label}
              </span>
            ) : null}
          </div>
        </Card>
      </AdminSection>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      {loading && !data ? (
        <p className="uiMuted">Зареждане...</p>
      ) : !hasWindow ? (
        <EmptyState
          title="Няма данни за табло"
          description="Все още няма диагностичен прозорец с финализирани сесии. Таблото става информативно след поне един завършен прозорец (а реперите и развитието — след два)."
        />
      ) : (
        <>
          <AdminSection title="Обзор">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <AdminStatCard title="Покритие">
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#0c6a47" }}>
                    {fmtPct(data.coverage?.coverage_pct)}
                  </span>
                  <span className="uiBadge">
                    Състезатели: {data.coverage?.athletes_tested ?? 0}/{data.coverage?.athletes_total ?? 0}
                  </span>
                  <span className="uiBadge">
                    Отбори: {data.coverage?.teams_tested ?? 0}/{data.coverage?.teams_total ?? 0}
                  </span>
                  <IndicativeBadge when={data.coverage?.is_indicative} />
                </div>
              </AdminStatCard>

              <AdminStatCard title="Приемане (годишна програма)">
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#0c6a47" }}>
                    {fmtPct(data.adoption?.avg_adoption)}
                  </span>
                  <span className="uiBadge">
                    Отбори с програма: {data.adoption?.teams_with_program ?? 0}/{data.adoption?.teams_total ?? 0}
                  </span>
                  <IndicativeBadge when={data.adoption?.is_indicative} />
                </div>
              </AdminStatCard>

              <AdminStatCard title="Дисциплина на измерване">
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#0c6a47" }}>
                    {fmtPct(data.discipline?.avg_discipline)}
                  </span>
                  <span className="uiMuted" style={{ fontSize: 12 }}>
                    Среден дял тествани от състава
                  </span>
                  <IndicativeBadge when={data.discipline?.is_indicative} sample={data.discipline?.sample} />
                </div>
              </AdminStatCard>
            </div>
          </AdminSection>

          <AdminSection title="Развитие по възраст (Δ Development Score)">
            <Card>
              {!data.development_by_age?.length ? (
                <EmptyState title="Няма данни" description="Нужни са поне два прозореца за делта по възраст." />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {data.development_by_age.map((row) => (
                    <div key={row.age_band} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#607693" }}>
                        <span>
                          <strong style={{ color: "#334155" }}>{row.age_band}</strong> · Δ {fmtDelta(row.avg_delta)} · n={row.sample}
                          {row.is_indicative ? <span style={{ color: "#b91c1c" }}> · инд.</span> : null}
                        </span>
                        <span>Score {fmtNum(row.avg_score, 0)}</span>
                      </div>
                      <Bar pct={(Number(row.avg_score) / maxScore) * 100} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </AdminSection>

          <AdminSection title="Лидери и риск (по Методически Индекс)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              <Card title="Лидери">
                {!data.leaders_risk?.leaders?.length ? (
                  <EmptyState title="Няма данни" description="Все още няма изчислени индекси." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.leaders_risk.leaders.map((t, idx) => (
                      <div key={t.team_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{idx + 1}. {t.team_name}</span>
                        <span className="uiBadge uiBadge--success">{fmtNum(t.methodical_index, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Внимание / риск">
                {!data.leaders_risk?.risk?.length ? (
                  <EmptyState title="Няма данни" description="Все още няма изчислени индекси." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.leaders_risk.risk.map((t) => (
                      <div key={t.team_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{t.team_name}</span>
                        <span className="uiBadge uiBadge--danger">{fmtNum(t.methodical_index, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </AdminSection>

          <AdminSection title="Национални репери (тест × възраст × пол)">
            <Card>
              {!data.norms?.length ? (
                <EmptyState
                  title="Няма репери"
                  description="Реперите се натрупват с данните от прозорците."
                />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#607693" }}>
                        <th style={{ padding: "6px 8px" }}>Тест</th>
                        <th style={{ padding: "6px 8px" }}>Възраст</th>
                        <th style={{ padding: "6px 8px" }}>Пол</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Средно</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Извадка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.norms.map((r) => (
                        <tr key={`${r.test_code}-${r.age_band}-${r.gender}`} style={{ borderTop: "1px solid #eef3fa" }}>
                          <td style={{ padding: "6px 8px" }}>{r.test_name}</td>
                          <td style={{ padding: "6px 8px" }}>{r.age_band}</td>
                          <td style={{ padding: "6px 8px" }}>{GENDER_LABELS[r.gender] || r.gender}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(r.mean_value, 2)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>
                            {r.sample}
                            {r.is_indicative ? <span style={{ color: "#b91c1c" }}> *</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="uiMuted" style={{ fontSize: 12, marginTop: 8 }}>
                    * индикативно — малка извадка
                  </p>
                </div>
              )}
            </Card>
          </AdminSection>
        </>
      )}
    </div>
  );
}
