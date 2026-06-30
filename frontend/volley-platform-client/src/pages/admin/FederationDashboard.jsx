// src/pages/admin/FederationDashboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, AdminSection, AdminStatCard, Button, Card, EmptyState } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };

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

          <AdminSection title="Динамика по прозорци">
            <Card>
              {!data.trend?.length ? (
                <EmptyState title="Няма данни" description="Появява се след поне един финализиран прозорец." />
              ) : data.trend.length < 2 ? (
                <p className="uiMuted">
                  Засега има само един прозорец с данни. Динамиката (посоката във времето) става смислена след
                  втория финализиран прозорец.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#607693" }}>
                        <th style={{ padding: "6px 8px" }}>Прозорец</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Покритие</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Средно развитие</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Приемане</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trend.map((p) => (
                        <tr key={p.window_id} style={{ borderTop: "1px solid #eef3fa" }}>
                          <td style={{ padding: "6px 8px" }}>{p.window_label}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtPct(p.coverage_pct)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(p.avg_development, 0)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtPct(p.adoption_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="uiMuted" style={{ fontSize: 12, marginTop: 8 }}>
                    Посока във времето: качваме ли покритието, развитието и приемането на програмата.
                  </p>
                </div>
              )}
            </Card>
          </AdminSection>

          <AdminSection title="Участие по тест (качество на данните)">
            <Card>
              {!data.participation?.length ? (
                <EmptyState
                  title="Няма данни"
                  description="Появява се след поне една финализирана сесия в прозореца."
                />
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "#607693" }}>
                          <th style={{ padding: "6px 8px" }}>Тест</th>
                          <th style={{ padding: "6px 8px", textAlign: "right" }}>Измерени</th>
                          <th style={{ padding: "6px 8px", minWidth: 160 }}>Участие</th>
                          <th style={{ padding: "6px 8px" }}>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.participation.map((r) => (
                          <tr key={r.test_code} style={{ borderTop: "1px solid #eef3fa" }}>
                            <td style={{ padding: "6px 8px" }}>{r.test_name}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>
                              {r.measured}/{r.tested_total}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <Bar
                                    pct={Number(r.participation_pct) || 0}
                                    color={r.is_low ? "#b91c1c" : "#0c6a47"}
                                  />
                                </div>
                                <span style={{ minWidth: 42, textAlign: "right" }}>
                                  {fmtPct(r.participation_pct)}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {r.is_low ? (
                                <span className="uiBadge uiBadge--danger">често се пропуска</span>
                              ) : (
                                <span className="uiBadge uiBadge--success">добро покритие</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="uiMuted" style={{ fontSize: 12, marginTop: 8 }}>
                    Дял от тестваните деца, които имат измерен конкретния тест. Нисък дял (под 70%) обикновено
                    значи пропуснат тест — често по-трудните (напр. точност на подаване).
                  </p>
                </>
              )}
            </Card>
          </AdminSection>

          <AdminSection title="Готовност на националните норми">
            <Card>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#0c6a47" }}>
                    {data.norms_readiness?.official ?? 0}
                  </span>
                  <span className="uiMuted" style={{ fontSize: 12 }}>Официални (основа за оценка)</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#1d4ed8" }}>
                    {data.norms_readiness?.ready ?? 0}
                  </span>
                  <span className="uiMuted" style={{ fontSize: 12 }}>Готови за одобрение (≥20)</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#b45309" }}>
                    {data.norms_readiness?.indicative ?? 0}
                  </span>
                  <span className="uiMuted" style={{ fontSize: 12 }}>Индикативни (5–19)</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#64748b" }}>
                    {data.norms_readiness?.low_data ?? 0}
                  </span>
                  <span className="uiMuted" style={{ fontSize: 12 }}>Малко данни (&lt;5)</span>
                </div>
              </div>
              <p className="uiMuted" style={{ fontSize: 12, marginTop: 10 }}>
                Колко близо сме до истински български стандарт по клетки (тест × възраст × пол).{" "}
                <Link to="/admin/national-norms">Отвори Машината за национални норми →</Link>
              </p>
            </Card>
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

          <AdminSection title="Пирамида на талантите (активни деца по възраст и пол)">
            <Card>
              {!data.talent_pyramid?.length ? (
                <EmptyState title="Няма данни" description="Появява се при активни деца с попълнена година на раждане." />
              ) : (
                <>
                  <div style={{ display: "grid", gap: 10 }}>
                    {data.talent_pyramid.map((row) => {
                      const maxTotal = Math.max(...data.talent_pyramid.map((r) => r.total), 1);
                      const fPct = (row.female / maxTotal) * 100;
                      const mPct = (row.male / maxTotal) * 100;
                      return (
                        <div key={row.age_band} style={{ display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#607693" }}>
                            <span>
                              <strong style={{ color: "#334155" }}>{row.age_band}</strong> · общо {row.total} · тествани {row.tested}
                            </span>
                            <span>Ж {row.female} · М {row.male}</span>
                          </div>
                          <div style={{ display: "flex", gap: 4, height: 14 }}>
                            <div style={{ width: `${fPct}%`, background: "#db2777", borderRadius: 4 }} title={`Момичета: ${row.female}`} />
                            <div style={{ width: `${mPct}%`, background: "#1d4ed8", borderRadius: 4 }} title={`Момчета: ${row.male}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="uiMuted" style={{ fontSize: 12, marginTop: 10 }}>
                    <span style={{ color: "#db2777" }}>■</span> момичета · <span style={{ color: "#1d4ed8" }}>■</span> момчета.
                    Базата на пирамидата по възрасти — къде е дебела/тънка и каква част е тествана.
                  </p>
                </>
              )}
            </Card>
          </AdminSection>

          <AdminSection title="Уловът — деца над летвата (спрямо стандарт 2022)">
            <Card>
              {!data.talent_catch?.length ? (
                <EmptyState title="Няма данни" description="Появява се при тествани деца с измерени тестове за пол, покрит от стандарт 2022." />
              ) : (
                <>
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.talent_catch.map((row) => {
                      const genderLabel = row.gender === "female" ? "Момичета" : row.gender === "male" ? "Момчета" : row.gender;
                      const barPct = row.scored ? (row.above_bar / row.scored) * 100 : 0;
                      return (
                        <div key={`${row.age_band}-${row.gender}`} style={{ display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#607693" }}>
                            <span>
                              <strong style={{ color: "#334155" }}>{row.age_band} · {genderLabel}</strong> · оценени {row.scored}
                              {row.is_indicative ? <span title="Малка извадка — индикативно"> *</span> : null}
                            </span>
                            <span>
                              над летвата <strong style={{ color: "#16a34a" }}>{row.above_bar}</strong>
                              {row.avg_talent != null ? ` · ср. ${fmtNum(row.avg_talent, 0)}` : ""}
                            </span>
                          </div>
                          <div style={{ display: "flex", height: 14, background: "#eef2f7", borderRadius: 4, overflow: "hidden" }} title={`Отлично: ${row.excellent} · Много добро: ${row.very_good}`}>
                            <div style={{ width: `${barPct}%`, background: "#16a34a" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="uiMuted" style={{ fontSize: 12, marginTop: 10 }}>
                    „Над летвата" = деца с ниво <strong>Отлично</strong> или <strong>Много добро</strong> спрямо стандарт 2022 за по-голямата възраст.
                    Анонимно и индикативно (малка извадка — „*"); надстроечен слой, който не променя официалните оценки.
                    Поименно — в Скаут таблицата при треньора.
                  </p>
                </>
              )}
            </Card>
          </AdminSection>

          <AdminSection title="Методически индекс по отбори">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              <Card title="Водещи отбори">
                {!data.leaders_risk?.leaders?.length ? (
                  <EmptyState title="Няма данни" description="Все още няма изчислени индекси." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.leaders_risk.leaders.map((t, idx) => (
                      <div key={t.team_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>
                          {idx + 1}. {t.club_name ? <strong>{t.club_name}</strong> : "—"}
                          <span style={{ color: "#607693" }}> · {t.team_name}</span>
                        </span>
                        <span className="uiBadge uiBadge--success">{fmtNum(t.methodical_index, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Отбори за подкрепа">
                {!data.leaders_risk?.risk?.length ? (
                  <EmptyState title="Няма данни" description="Все още няма изчислени индекси." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.leaders_risk.risk.map((t) => (
                      <div key={t.team_id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>
                          {t.club_name ? <strong>{t.club_name}</strong> : "—"}
                          <span style={{ color: "#607693" }}> · {t.team_name}</span>
                        </span>
                        <span className="uiBadge">{fmtNum(t.methodical_index, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <p className="uiMuted" style={{ fontSize: 12, marginTop: 8 }}>
              „За подкрепа" не е класиране за наказание — това са отборите, на които федерацията може да помогне
              най-много (методика, материали, обучение).
            </p>
          </AdminSection>

          <AdminSection title="Регионален методически индекс (6-те структури на БФВ)">
            <Card>
              {!data.regional_index?.length ? (
                <EmptyState
                  title="Няма данни"
                  description="Регионалният индекс се появява след изчислени отборни индекси."
                />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {data.regional_index.map((row) => (
                    <div key={row.region} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#607693" }}>
                        <span>
                          <strong style={{ color: "#334155" }}>{row.region}</strong>
                          {" · "}
                          {row.teams} {row.teams === 1 ? "отбор" : "отбора"}
                          {row.is_indicative && row.teams > 0 ? (
                            <span style={{ color: "#b91c1c" }}> · инд.</span>
                          ) : null}
                        </span>
                        <span>{fmtNum(row.avg_index, 0)}</span>
                      </div>
                      <Bar pct={Number(row.avg_index) || 0} color="#1d4ed8" />
                    </div>
                  ))}
                </div>
              )}
              <p className="uiMuted" style={{ fontSize: 12, marginTop: 8 }}>
                Регионът се определя по града на клуба (официалните регионални структури на БФВ).
              </p>
            </Card>
          </AdminSection>

        </>
      )}
    </div>
  );
}
