import { useEffect, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import MotivationView from "./MotivationView";
import "./assessment.css";

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

  return <MotivationView data={data} />;
}
