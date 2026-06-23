import { useEffect, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import "./assessment.css";

// Цветово ниво по словесната оценка 2022 (споделено с таланта/скаута).
const LEVEL_CLASS = {
  Незадоволително: "talentBadge--bad",
  Задоволително: "talentBadge--warn",
  "Много добро": "talentBadge--good",
  Отлично: "talentBadge--great",
};

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Цвят на връстниковия процентил по същата скала като нивата.
function peerClass(p) {
  if (p >= 80) return "talentBadge--great";
  if (p >= 60) return "talentBadge--good";
  if (p >= 40) return "talentBadge--warn";
  return "talentBadge--bad";
}

/**
 * Мотивационен изглед за детето: позитивна, проста картина върху вече въведените
 * резултати — личен рекорд, подобрение, следваща цел, „спрямо големите" (талант)
 * и леко сравнение с връстниците. НЕ променя официалните оценки.
 */
export default function AthleteMotivationCard({ athleteId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!athleteId) return undefined;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_MOTIVATION(athleteId));
        if (alive) setData(res.data || null);
      } catch (err) {
        if (alive) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на мотивационния изглед.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteId]);

  if (loading) return <p className="assessMuted">Зареждане...</p>;
  if (error) return <p className="assessMuted">{error}</p>;
  if (!data || !(data.tests || []).length) {
    return <p className="assessMuted">Все още няма достатъчно резултати за мотивационен изглед.</p>;
  }

  const tests = data.tests || [];

  return (
    <div className="motivWrap">
      <div className="motivSummary">
        <span className="motivStat">
          <strong>{data.improved_count}</strong> подобрени теста
        </span>
        <span className="motivStat">
          <strong>{data.personal_best_count}</strong> нови лични рекорда
        </span>
        {data.talent_index != null ? (
          <span className={`talentBadge ${LEVEL_CLASS[data.talent_index_label] || "talentBadge--good"}`}>
            Спрямо големите ({data.reference_age_band}): {fmt(data.talent_index)} · {data.talent_index_label}
          </span>
        ) : null}
      </div>

      <div className="motivGrid">
        {tests.map((t) => {
          const improvedClass =
            t.improved === true ? "motivDelta--up" : t.improved === false ? "motivDelta--down" : "";
          return (
            <div key={t.test_code} className="motivTest">
              <div className="motivTestName">{t.test_name}</div>

              <div className="motivValueRow">
                <span className="motivValue">{fmt(t.latest)}</span>
                <span className="motivUnit">{t.unit}</span>
              </div>

              {t.is_new_record ? (
                <div className="motivRecord">Нов личен рекорд!</div>
              ) : t.is_personal_best ? (
                <div className="motivRecord motivRecord--soft">Личен рекорд</div>
              ) : null}

              {t.improved === true && t.delta != null ? (
                <div className={`motivDelta ${improvedClass}`}>
                  ▲ Подобри се с {fmt(Math.abs(t.delta))} {t.unit} (от {fmt(t.prev)})
                </div>
              ) : t.improved === false && t.delta != null ? (
                <div className={`motivDelta ${improvedClass}`}>
                  Спрямо миналия път: {fmt(t.prev)} → {fmt(t.latest)} {t.unit}
                </div>
              ) : (
                <div className="motivDelta motivDelta--first">Първо измерване</div>
              )}

              {t.next_goal ? (
                <div className="motivGoal">
                  Следваща цел: <strong>{t.next_goal.next_level}</strong> — остават{" "}
                  {fmt(t.next_goal.gap)} {t.unit} (до {fmt(t.next_goal.target_raw)})
                </div>
              ) : null}

              <div className="motivBadges">
                {t.talent_score != null ? (
                  <span
                    className={`talentBadge talentBadgeSm ${LEVEL_CLASS[t.talent_label] || "talentBadge--good"}`}
                    title="Колко покриваш летвата на по-големите (национален стандарт 2022)"
                  >
                    Спрямо големите: {fmt(t.talent_score)} · {t.talent_label}
                  </span>
                ) : null}
                {t.peer_percentile != null ? (
                  <span
                    className={`talentBadge talentBadgeSm ${peerClass(t.peer_percentile)}`}
                    title={`По-добър от ${fmt(t.peer_percentile)}% от връстниците (извадка: ${t.peer_sample})`}
                  >
                    По-добър от {fmt(t.peer_percentile)}% връстници{t.peer_indicative ? " *" : ""}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="assessMuted rawLegend">
        Това е окуражителен изглед за детето — върху реално въведените резултати. „Спрямо големите" и
        „% връстници" са ориентири (индикативни при малка извадка „*") и не променят официалната оценка.
      </p>
    </div>
  );
}
