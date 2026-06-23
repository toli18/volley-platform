import { useEffect, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import "./assessment.css";

// Цветово ниво по словесната оценка (както „бележка в тетрадката").
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

/**
 * Профил на таланта — индикативен изглед „колко детето покрива летвата на
 * по-голяма възраст" (национален стандарт 2022). НЕ променя официалната оценка;
 * стои до таблицата с реалните стойности в Картата за развитие.
 */
export default function TalentProfileCard({ athleteId }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_TALENT_PROFILE(athleteId));
        if (alive) setProfile(res.data || null);
      } catch (err) {
        if (alive) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на профила на таланта.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteId]);

  if (loading) return <p className="assessMuted">Зареждане на профила на таланта...</p>;
  if (error) return <p className="assessMuted">{error}</p>;
  if (!profile) return null;

  if (!profile.covered) {
    return (
      <p className="assessMuted">
        Профилът на таланта се изчислява спрямо националния стандарт 2022 (момичета и
        момчета). За този състезател няма референтна летва.
      </p>
    );
  }
  if (!profile.tests?.length) {
    return (
      <p className="assessMuted">
        Още няма въведени резултати по тестове с национален репер 2022, за да се изчисли
        профил на таланта.
      </p>
    );
  }

  const ref = profile.reference_age_band;
  const idxClass = LEVEL_CLASS[profile.talent_index_label] || "talentBadge--good";

  return (
    <div className="talentCard">
      <div className="talentHead">
        <div className="talentHeadText">
          <span className="talentHeadTitle">
            Спрямо летвата на {ref}
            {profile.is_aspirational ? " · по-голяма възраст" : ""}
          </span>
          <span className="talentHeadSub">Индикативно · не променя официалната оценка</span>
        </div>
        {profile.talent_index != null ? (
          <span className={`talentBadge talentBadge--lg ${idxClass}`}>
            {fmt(profile.talent_index)} · {profile.talent_index_label}
          </span>
        ) : null}
      </div>

      <div className="talentGrid">
        {profile.tests.map((t) => {
          const cls = LEVEL_CLASS[t.talent_label] || "talentBadge--good";
          return (
            <div key={t.test_code} className="talentItem">
              <span className="talentItemName" title={t.test_name || t.test_code}>
                {t.test_name || t.test_code}
              </span>
              <span className={`talentBadge ${cls}`}>
                {fmt(t.talent_score)} · {t.talent_label}
              </span>
              <span className="talentItemRaw">резултат: {fmt(t.raw_value)}</span>
            </div>
          );
        })}
      </div>

      <p className="assessMuted talentNote">
        „Талант" показва колко детето покрива летвата на по-голяма възраст (национален
        стандарт 2022). Това е ориентир за потенциал — официалната оценка за собствената
        възраст остава непроменена.
      </p>
    </div>
  );
}
