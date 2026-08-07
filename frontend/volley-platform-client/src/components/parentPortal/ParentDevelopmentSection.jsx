import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Card, EmptyState } from "../ui";
import DevelopmentScoreChart from "../assessment/DevelopmentScoreChart";
import MotivationView from "../assessment/MotivationView";
import "../assessment/assessment.css";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };

function formatWindowChipLabel(w) {
  const dateRaw = w.conducted_on || w.start_date;
  if (dateRaw) {
    try {
      const d = new Date(`${String(dateRaw).slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("bg-BG", { day: "numeric", month: "short", year: "numeric" });
      }
    } catch {
      /* fall through */
    }
  }
  if (w.label) return w.label;
  const phase = PHASE_LABELS[w.phase] || w.phase;
  return w.season ? `${phase} · ${w.season}` : phase || `Прозорец #${w.id}`;
}

function formatWindowTitle(w) {
  const chip = formatWindowChipLabel(w);
  const phase = PHASE_LABELS[w.phase] || w.phase;
  const parts = [chip];
  if (w.season && !chip.includes(w.season)) parts.push(w.season);
  if (phase && !chip.includes(phase)) parts.push(phase);
  return parts.filter(Boolean).join(" · ");
}

/**
 * Read-only секция „Развитие" / „Тестове".
 *
 * `variant`:
 * - `"card"` (default) — един Card, за атлетски портал и компактен изглед
 * - `"tab"` — отделен екран с табове по дата на тестиране
 *
 * `onAvailabilityChange({ available })` — за показване на таб „Тестове" в навигацията.
 */
export default function ParentDevelopmentSection({
  isSession,
  token,
  path,
  variant = "card",
  onAvailabilityChange,
  preferEmptyState = false,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeWindowId, setActiveWindowId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const url =
          path ||
          (isSession
            ? API_PATHS.PARENT_PORTAL_DEVELOPMENT_ME
            : API_PATHS.PARENT_PORTAL_DEVELOPMENT_TOKEN(token));
        const res = await axiosInstance.get(url);
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
  }, [isSession, token, path]);

  const windows = useMemo(() => data?.windows || [], [data]);
  const scores = useMemo(() => data?.scores || [], [data]);

  const available = Boolean(data?.consent_granted && scores.length > 0);

  useEffect(() => {
    onAvailabilityChange?.({ available, loading });
  }, [available, loading, onAvailabilityChange]);

  useEffect(() => {
    if (!windows.length) {
      setActiveWindowId(null);
      return;
    }
    setActiveWindowId((prev) => {
      if (prev != null && windows.some((w) => w.id === prev)) return prev;
      return windows[windows.length - 1].id;
    });
  }, [windows]);

  const windowMap = useMemo(() => {
    const map = {};
    for (const w of windows) {
      map[w.id] = { season: w.season, phaseLabel: PHASE_LABELS[w.phase] || w.phase };
    }
    return map;
  }, [windows]);

  const activeWindow = windows.find((w) => w.id === activeWindowId) || null;
  const activeScores = activeWindow
    ? scores.filter((s) => s.window_id === activeWindow.id)
    : scores;
  const isLatestWindow =
    activeWindow && windows.length
      ? activeWindow.id === windows[windows.length - 1].id
      : true;

  if (loading) {
    if (variant === "tab") {
      return null;
    }
    return (
      <Card title="Развитие">
        <p className="parentPortalHighlightMuted">Зареждане...</p>
      </Card>
    );
  }

  if (!data?.consent_granted) {
    if (preferEmptyState) {
      return (
        <EmptyState
          title="Няма споделени резултати"
          description="Когато клубът сподели диагностика, развитието ще се появи тук."
        />
      );
    }
    return null;
  }
  if (!scores.length) {
    if (preferEmptyState) {
      return (
        <EmptyState
          title="Няма споделени резултати"
          description="Все още няма изчислени резултати от тестиране."
        />
      );
    }
    if (variant === "tab") return null;
  }

  const renderScoreBody = (chartScores, { showFocus, showDisclaimer } = {}) =>
    chartScores.length || scores.length ? (
      <>
        <DevelopmentScoreChart
          scores={chartScores.length ? chartScores : scores}
          windowMap={windowMap}
        />
        {showFocus ? (
          <>
            <p className="devSectionTitle" style={{ marginTop: 14 }}>
              Фокус области{data.main_focus ? ` · основен: ${data.main_focus}` : ""}
            </p>
            <div className="deficitFocus">
              {(data.deficits || []).slice(0, 4).map((d) => (
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
        {showDisclaimer ? (
          <p className="parentPortalHighlightMuted" style={{ marginTop: 12 }}>
            Данните са методически и индикативни. За въпроси се обърнете към треньора.
          </p>
        ) : null}
      </>
    ) : (
      <p className="parentPortalHighlightMuted">Все още няма споделени резултати от диагностика.</p>
    );

  const motivation = data.motivation || null;
  const hasMotivation = !!(motivation && (motivation.tests || []).length);
  const focusList = (data.deficits || []).slice(0, 4);
  const homeWorkouts = data.home_workouts || [];

  const homeWorkoutsCard =
    homeWorkouts.length > 0 ? (
      <Card title="Домашни тренировки">
        <p className="parentPortalHighlightMuted" style={{ marginTop: 0 }}>
          Кратки планове за вкъщи / без зала — от треньора по акцентите от тестирането.
        </p>
        {homeWorkouts.map((h) => (
          <details key={h.id} className="parentPortalDetails" style={{ marginTop: 8 }}>
            <summary className="parentPortalDetailsSummary">
              {h.title || "Домашна тренировка"}
              {h.main_focus ? ` · ${h.main_focus}` : ""}
            </summary>
            <div className="parentPortalDetailsBody">
              {h.training_plan_text ? (
                <pre className="deficitPlanText" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {h.training_plan_text}
                </pre>
              ) : (
                <p className="parentPortalHighlightMuted">Няма текст на плана.</p>
              )}
            </div>
          </details>
        ))}
      </Card>
    ) : null;

  if (variant === "tab") {
    return (
      <div className="parentPortalTestsTab">
        {windows.length > 1 ? (
          <div className="parentPortalTestDateTabs" role="tablist" aria-label="Дати на тестиране">
            {windows.map((w) => {
              const selected = w.id === activeWindowId;
              return (
                <button
                  key={w.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`parentPortalTestDateTab${selected ? " is-active" : ""}`}
                  onClick={() => setActiveWindowId(w.id)}
                >
                  {formatWindowChipLabel(w)}
                </button>
              );
            })}
          </div>
        ) : null}

        <Card title={activeWindow ? formatWindowTitle(activeWindow) : "Тестове"}>
          {renderScoreBody(activeScores, {
            showFocus: Boolean(isLatestWindow && focusList.length),
            showDisclaimer: true,
          })}
        </Card>

        {hasMotivation && isLatestWindow ? (
          <Card title="Моят напредък">
            <MotivationView data={motivation} />
          </Card>
        ) : null}

        {homeWorkoutsCard}
      </div>
    );
  }

  return (
    <>
      <Card title="Развитие">
        {renderScoreBody(scores, {
          showFocus: focusList.length > 0,
          showDisclaimer: true,
        })}
      </Card>

      {hasMotivation ? (
        <Card title="Моят напредък">
          <MotivationView data={motivation} />
        </Card>
      ) : null}

      {homeWorkoutsCard}
    </>
  );
}
