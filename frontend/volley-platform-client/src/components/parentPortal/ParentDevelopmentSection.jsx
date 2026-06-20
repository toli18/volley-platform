import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Card } from "../ui";
import DevelopmentScoreChart from "../assessment/DevelopmentScoreChart";
import "../assessment/assessment.css";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };

export default function ParentDevelopmentSection({ isSession, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const path = isSession
          ? API_PATHS.PARENT_PORTAL_DEVELOPMENT_ME
          : API_PATHS.PARENT_PORTAL_DEVELOPMENT_TOKEN(token);
        const res = await axiosInstance.get(path);
        if (alive) setData(res.data || null);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isSession, token]);

  const windowMap = useMemo(() => {
    const map = {};
    for (const w of data?.windows || []) {
      map[w.id] = { season: w.season, phaseLabel: PHASE_LABELS[w.phase] || w.phase };
    }
    return map;
  }, [data]);

  if (loading) {
    return (
      <Card title="Развитие">
        <p className="parentPortalHighlightMuted">Зареждане...</p>
      </Card>
    );
  }

  // Без съгласие — секцията не се показва изобщо (не подсказваме за наличие на данни).
  if (!data?.consent_granted) return null;

  const scores = data.scores || [];
  const deficits = (data.deficits || []).slice(0, 4);

  return (
    <Card title="Развитие">
      {scores.length ? (
        <>
          <DevelopmentScoreChart scores={scores} windowMap={windowMap} />
          {deficits.length ? (
            <>
              <p className="devSectionTitle" style={{ marginTop: 14 }}>
                Фокус области{data.main_focus ? ` · основен: ${data.main_focus}` : ""}
              </p>
              <div className="deficitFocus">
                {deficits.map((d) => (
                  <span
                    key={d.domain}
                    className={`deficitChip ${d.is_deficit ? "deficitChip--bad" : "deficitChip--ok"}`}
                  >
                    {d.domain}: {Math.round(d.normalized)}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <p className="parentPortalHighlightMuted" style={{ marginTop: 12 }}>
            Данните са методически и индикативни. За въпроси се обърнете към треньора.
          </p>
        </>
      ) : (
        <p className="parentPortalHighlightMuted">Все още няма споделени резултати от диагностика.</p>
      )}
    </Card>
  );
}
