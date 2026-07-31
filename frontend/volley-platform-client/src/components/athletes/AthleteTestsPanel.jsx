import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, EmptyState } from "../ui";
import AthletePhysicalPanel from "./AthletePhysicalPanel";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import "../assessment/assessment.css";

const LEVEL_CLASS = {
  Незадоволително: "talentBadge--bad",
  Задоволително: "talentBadge--warn",
  "Много добро": "talentBadge--good",
  Отлично: "talentBadge--great",
};

const CATEGORY_LABEL = {
  anthropometry: "Антропометрия",
  physical: "Физически",
  technical: "Технически",
  tactical: "Тактически",
  psychological: "Психологически",
};

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function peerClass(p) {
  if (p >= 80) return "talentBadge--great";
  if (p >= 60) return "talentBadge--good";
  if (p >= 40) return "talentBadge--warn";
  return "talentBadge--bad";
}

/**
 * Единен таб: всички тестове с оценки + БФВ прехвърляне само на картотечните показатели.
 */
export default function AthleteTestsPanel({ athleteId, bvfPlayerId, toast }) {
  const [data, setData] = useState({ tests: [], rows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!athleteId) return;
      try {
        setLoading(true);
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_ATHLETE_SCOUTING(athleteId), {
          params: { include_anthropometry: true },
        });
        if (alive) setData(res.data || { tests: [], rows: [] });
      } catch (err) {
        if (alive) {
          setData({ tests: [], rows: [] });
          toast?.error(normalizeError(err, "Неуспешно зареждане на тестовете."));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteId]);

  const row = data.rows?.[0] || null;
  const cellMap = useMemo(() => {
    const m = {};
    for (const c of row?.cells || []) m[c.test_code] = c;
    return m;
  }, [row]);

  const tested = useMemo(() => {
    return (data.tests || []).filter((t) => {
      const c = cellMap[t.code];
      return c && c.raw_value !== null && c.raw_value !== undefined;
    });
  }, [data.tests, cellMap]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Резултати от диагностиката — същите данни като в скаут таблицата.
            {row?.age_band ? ` Възраст: ${row.age_band}.` : ""}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link to={`/coach/assessment/athletes/${athleteId}`}>
              <Button type="button" size="sm" variant="secondary">
                Карта развитие
              </Button>
            </Link>
            <Link to="/coach/assessment/scouting">
              <Button type="button" size="sm" variant="secondary">
                Обща таблица
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="coachMobileMuted">Зареждане на тестове…</p>
        ) : !tested.length ? (
          <EmptyState
            title="Няма въведени тестове"
            description="Когато има резултати от диагностика / скаутинг, ще се появят тук с оценки."
          />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {tested.map((t) => {
              const c = cellMap[t.code];
              const cat = CATEGORY_LABEL[t.category] || t.category;
              return (
                <article
                  key={t.code}
                  style={{
                    border: "1px solid var(--ui-border, #e5e7eb)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    display: "grid",
                    gap: 10,
                    background: "var(--ui-surface, #fff)",
                  }}
                >
                  <header style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                      <div className="uiMuted" style={{ fontSize: 12 }}>
                        {cat}
                        {t.unit ? ` · ${t.unit}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
                      {fmt(c.raw_value)}
                      {t.unit ? <span className="uiMuted" style={{ fontSize: 13, fontWeight: 600 }}> {t.unit}</span> : null}
                    </div>
                  </header>

                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="uiMuted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                        Стандарт 2022
                      </span>
                      {c.score_2022 != null ? (
                        <span className={`talentBadge ${LEVEL_CLASS[c.score_2022_label] || "talentBadge--good"}`}>
                          {fmt(c.score_2022)} · {c.score_2022_label}
                        </span>
                      ) : (
                        <span className="uiMuted" style={{ fontSize: 13 }}>няма норма</span>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="uiMuted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                        Връстници
                      </span>
                      {c.peer_percentile != null ? (
                        <>
                          <span className={`talentBadge ${peerClass(c.peer_percentile)}`}>
                            {fmt(c.peer_percentile)}%
                            {c.peer_indicative ? "*" : ""}
                          </span>
                          <span className="uiMuted" style={{ fontSize: 12 }}>
                            n={c.peer_sample || 0}
                            {c.peer_indicative ? " · ориентировъчно" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="uiMuted" style={{ fontSize: 13 }}>няма данни</span>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="uiMuted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                        Талант
                      </span>
                      {c.talent_score != null ? (
                        <span className={`talentBadge ${LEVEL_CLASS[c.talent_label] || "talentBadge--good"}`}>
                          {fmt(c.talent_score)} · {c.talent_label}
                        </span>
                      ) : (
                        <span className="uiMuted" style={{ fontSize: 13 }}>няма оценка</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          borderTop: "1px solid var(--ui-border, #e5e7eb)",
          paddingTop: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: 15 }}>Към картотека (БФВ)</h4>
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Само тези показатели могат да се прехвърлят към системата за картотекиране: височина, тегло, размах,
            атака, блок.
          </p>
        </div>
        <AthletePhysicalPanel athleteId={athleteId} bvfPlayerId={bvfPlayerId} toast={toast} />
      </section>
    </div>
  );
}
