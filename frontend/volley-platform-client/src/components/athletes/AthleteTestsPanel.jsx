import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, EmptyState } from "../ui";
import AthletePhysicalPanel from "./AthletePhysicalPanel";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import {
  displayCategoryLabel,
  displayTalentLabel,
  displayUnitLabel,
  talentLevelClass,
} from "../../utils/talentDisplay";
import "../assessment/assessment.css";

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function peerClass(p) {
  if (p >= 80) return "talentBadge--great";
  if (p >= 60) return "talentBadge--good";
  if (p >= 40) return "talentBadge--warn";
  return "talentBadge--develop";
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
          <div className="athleteTestCards">
            {tested.map((t) => {
              const c = cellMap[t.code];
              const cat = displayCategoryLabel(t.category);
              const unit = displayUnitLabel(t.unit);
              const talentLabel = displayTalentLabel(c.talent_label);
              const normLabel = displayTalentLabel(c.score_2022_label);
              const showNorm = c.score_2022 != null;
              return (
                <article key={t.code} className="athleteTestCard">
                  <div className="athleteTestCardName" title={t.name}>
                    {t.name}
                  </div>
                  <div className="athleteTestCardMeta">
                    {cat}
                    {unit ? ` · ${unit}` : ""}
                  </div>
                  <div className="athleteTestCardValue">
                    {fmt(c.raw_value)}
                    {unit ? <span className="athleteTestCardValueUnit"> {unit}</span> : null}
                  </div>

                  <div className="athleteTestCardMetrics">
                    {showNorm ? (
                      <div className="athleteTestCardMetric">
                        <span className="athleteTestCardMetricLabel" title="Национален стандарт 2022">
                          Норма &apos;22
                        </span>
                        <span
                          className={`talentBadge talentBadgeSm ${talentLevelClass(c.score_2022_label)}`}
                          title={normLabel || ""}
                        >
                          {fmt(c.score_2022)}
                          {normLabel ? ` · ${normLabel}` : ""}
                        </span>
                      </div>
                    ) : null}

                    <div className="athleteTestCardMetric">
                      <span className="athleteTestCardMetricLabel">Връстници</span>
                      {c.peer_percentile != null ? (
                        <span
                          className={`talentBadge talentBadgeSm ${peerClass(c.peer_percentile)}`}
                          title={`n=${c.peer_sample || 0}${c.peer_indicative ? " · ориентировъчно" : ""}`}
                        >
                          {fmt(c.peer_percentile)}%{c.peer_indicative ? "*" : ""}
                        </span>
                      ) : (
                        <span className="athleteTestCardHint">—</span>
                      )}
                    </div>

                    <div className="athleteTestCardMetric">
                      <span className="athleteTestCardMetricLabel">Талант</span>
                      {c.talent_score != null ? (
                        <span
                          className={`talentBadge talentBadgeSm ${talentLevelClass(c.talent_label)}`}
                          title={talentLabel || ""}
                        >
                          {fmt(c.talent_score)}
                          {talentLabel ? ` · ${talentLabel}` : ""}
                        </span>
                      ) : (
                        <span className="athleteTestCardHint">—</span>
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
            Стойностите се взимат автоматично от тестовете. Изпращат се само полетата, които федерацията приема:
            височина, тегло, размах/разтег, атака (отскок със засилване), блок (отскок с 2 ръце).
          </p>
        </div>
        <AthletePhysicalPanel
          athleteId={athleteId}
          bvfPlayerId={bvfPlayerId}
          toast={toast}
          ageBand={row?.age_band}
          gender={row?.gender}
        />
      </section>
    </div>
  );
}
