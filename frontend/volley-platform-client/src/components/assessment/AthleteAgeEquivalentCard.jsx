import { useEffect, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import "./assessment.css";

function fmtAge(v) {
  if (v === null || v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

// Цвят спрямо разликата „еквивалент − собствена възраст".
function deltaClass(delta) {
  if (delta == null) return "talentBadge--good";
  if (delta >= 1.5) return "talentBadge--great";
  if (delta >= 0.5) return "talentBadge--good";
  if (delta > -0.5) return "talentBadge--warn";
  return "talentBadge--bad";
}

function deltaText(t) {
  if (t.delta_years == null) return null;
  const d = t.delta_years;
  if (d >= 0.5) return `с ${fmtAge(Math.abs(d))} г. напред`;
  if (d <= -0.5) return `с ${fmtAge(Math.abs(d))} г. назад`;
  return "на ниво за възрастта";
}

/**
 * Възрастов еквивалент: на каква възраст отговаря представянето на детето,
 * по кривата възраст → средно от живите норми за неговия пол. Индикативен,
 * надстроечен слой — НЕ променя официалната оценка.
 */
export default function AthleteAgeEquivalentCard({ athleteId }) {
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
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_AGE_EQUIVALENT(athleteId));
        if (alive) setData(res.data || null);
      } catch (err) {
        if (alive) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на възрастовия еквивалент.");
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
    return (
      <p className="assessMuted">
        Все още няма достатъчно данни за възрастов еквивалент (нужни са поне 2 възрастови групи с по 5+ деца за
        същия тест и пол).
      </p>
    );
  }

  const tests = data.tests || [];

  return (
    <div className="motivWrap">
      {data.own_age != null ? (
        <div className="motivSummary">
          <span className="motivStat">
            Възраст на детето: <strong>{fmtAge(data.own_age)} г.</strong>
          </span>
        </div>
      ) : null}

      <div className="motivGrid">
        {tests.map((t) => {
          const text = deltaText(t);
          const suffix =
            t.status === "above_oldest" ? " (над най-голямата група)"
              : t.status === "below_youngest" ? " (под най-малката група)"
              : "";
          return (
            <div key={t.test_code} className="motivTest">
              <div className="motivTestName">{t.test_name}</div>

              <div className="motivValueRow">
                <span className="motivValue">{fmtAge(t.latest)}</span>
                <span className="motivUnit">{t.unit}</span>
              </div>

              <div className="motivGoal">
                Представя се като средно дете на <strong>{fmtAge(t.equivalent_age)} г.</strong>
                {suffix}
              </div>

              {text ? (
                <div className="motivBadges">
                  <span
                    className={`talentBadge talentBadgeSm ${deltaClass(t.delta_years)}`}
                    title="Разлика спрямо собствената възраст на детето"
                  >
                    {text}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="assessMuted rawLegend">
        „Възрастов еквивалент" сравнява резултата с кривата на средните по възрасти (живи норми за този пол).
        Ориентир е — индикативен при малко данни и не променя официалната оценка.
      </p>
    </div>
  );
}
