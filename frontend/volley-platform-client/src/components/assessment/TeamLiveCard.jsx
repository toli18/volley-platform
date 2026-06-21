import { useMemo } from "react";
import "./assessment.css";
import { netJump, NET_JUMP_APPROACH_CODE, NET_JUMP_REACH_CODE } from "../../utils/netJump";

const BEST_N = 8;
// Категориите, които формират „силата" на отбора (без чиста антропометрия).
const SCORED_CATEGORIES = new Set(["technical", "speed", "physical"]);

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bestNAverage(rawValues, direction) {
  const nums = rawValues.filter((v) => v != null);
  nums.sort((a, b) => (direction === "lower_better" ? a - b : b - a));
  const top = nums.slice(0, BEST_N);
  if (!top.length) return { avg: null, count: 0 };
  const mean = top.reduce((s, v) => s + v, 0) / top.length;
  return { avg: Math.round(mean * 10) / 10, count: top.length };
}

/**
 * Жива „отборна карта" — средната стойност на best-8 (както се класира отбор)
 * по всеки показател, изчислена на момента от въведените сурови стойности.
 * Дава на треньора усещане за нивото на отбора, докато въвежда.
 */
export default function TeamLiveCard({ tests = [], athletes = [], values = {} }) {
  const rows = useMemo(() => {
    const scored = tests.filter((t) => SCORED_CATEGORIES.has(t.category));
    const out = scored.map((t) => {
      const vals = athletes.map((a) => toNum(values?.[a.athlete_id]?.[t.code]));
      const { avg, count } = bestNAverage(vals, t.direction);
      return { code: t.code, name: t.name, unit: t.unit, avg, count };
    });

    const codes = new Set(tests.map((t) => t.code));
    if (codes.has(NET_JUMP_APPROACH_CODE) && codes.has(NET_JUMP_REACH_CODE)) {
      const netVals = athletes.map((a) => {
        const row = values?.[a.athlete_id];
        const n = netJump(row?.[NET_JUMP_APPROACH_CODE], row?.[NET_JUMP_REACH_CODE]);
        return n == null ? null : n;
      });
      const { avg, count } = bestNAverage(netVals, "higher_better");
      out.push({ code: "__net_jump", name: "Чист отскок", unit: "см", avg, count, derived: true });
    }
    return out;
  }, [tests, athletes, values]);

  const hasAny = rows.some((r) => r.avg != null);

  return (
    <div className="teamLiveCard">
      <div className="teamLiveHead">
        <h3 className="devSectionTitle" style={{ margin: 0 }}>
          Отборна карта (best-{BEST_N})
        </h3>
        <span className="assessMuted">средно на 8-те най-добри</span>
      </div>
      {!hasAny ? (
        <p className="assessMuted">Въведете резултати, за да се изчисли отборното ниво.</p>
      ) : (
        <div className="teamLiveGrid">
          {rows.map((r) => (
            <div key={r.code} className={`teamLiveCell${r.derived ? " teamLiveCell--derived" : ""}`}>
              <span className="teamLiveName" title={r.name}>
                {r.name}
              </span>
              <span className="teamLiveValue">
                {r.avg != null ? r.avg : "—"}
                <span className="teamLiveUnit"> {r.unit}</span>
              </span>
              <span className="teamLiveMeta">n={r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
