import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import "./assessment.css";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };
const CATEGORY_LABELS = {
  technical: "Технически",
  speed: "Бързина",
  physical: "Физически",
  anthropometry: "Антропометрия",
};
const CATEGORY_ORDER = ["technical", "speed", "physical", "anthropometry"];

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * Таблица с реалните (сурови) стойности по тест × прозорец — допълва графиката
 * с нормализирани оценки. Показва и автоматично изчисления „чист отскок".
 */
export default function AthleteRawResultsTable({ athleteId }) {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!athleteId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_RESULTS(athleteId));
        if (alive) setWindows(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (alive) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на реалните стойности.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteId]);

  const { columns, groups, netJumpRow } = useMemo(() => {
    const cols = [...windows].sort((a, b) => a.window_id - b.window_id);

    // Обединен каталог от тестове през всички прозорци (запазва ред и категория).
    const testMeta = new Map();
    for (const w of cols) {
      for (const r of w.results || []) {
        if (!testMeta.has(r.test_code)) {
          testMeta.set(r.test_code, {
            code: r.test_code,
            name: r.test_name,
            unit: r.unit,
            category: r.category,
            sort_order: r.sort_order ?? 0,
          });
        }
      }
    }

    // Бърз достъп: window_id → test_code → result
    const cellLookup = new Map();
    for (const w of cols) {
      const m = new Map();
      for (const r of w.results || []) m.set(r.test_code, r);
      cellLookup.set(w.window_id, m);
    }

    const byCat = {};
    for (const meta of testMeta.values()) {
      (byCat[meta.category] ||= []).push(meta);
    }
    const grouped = CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      tests: byCat[cat]
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
        .map((meta) => ({
          ...meta,
          cells: cols.map((w) => cellLookup.get(w.window_id)?.get(meta.code) || null),
        })),
    }));

    const hasNetJump = cols.some((w) => w.net_jump != null);
    const netRow = hasNetJump ? cols.map((w) => w.net_jump) : null;

    return { columns: cols, groups: grouped, netJumpRow: netRow };
  }, [windows]);

  if (loading) return <p className="assessMuted">Зареждане на реалните стойности...</p>;
  if (error) return <p className="assessMuted">{error}</p>;
  if (!columns.length) return <p className="assessMuted">Няма въведени резултати за този състезател.</p>;

  return (
    <div className="assessGridWrap">
      <table className="assessGrid rawValuesTable">
        <thead>
          <tr>
            <th className="assessStickyCol">Тест</th>
            {columns.map((w) => (
              <th key={w.window_id} className="assessTestCol">
                <span className="assessTestName">{w.season || `Прозорец #${w.window_id}`}</span>
                <span className="assessTestUnit">{PHASE_LABELS[w.phase] || w.phase || ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragmented key={group.category}>
              <tr className="rawCatRow">
                <th className="assessStickyCol" colSpan={columns.length + 1}>
                  {group.label}
                </th>
              </tr>
              {group.tests.map((t) => (
                <tr key={t.code}>
                  <th className="assessStickyCol assessAthleteName" title={t.name}>
                    {t.name}
                    <span className="rawUnit"> ({t.unit})</span>
                  </th>
                  {t.cells.map((cell, idx) => (
                    <td key={idx} className="rawCell">
                      <span className="rawRaw">{fmt(cell?.raw_value)}</span>
                      {cell?.normalized != null ? (
                        <span className="rawNorm" title="Нормализирана оценка (0–100)">
                          {fmt(cell.normalized)}
                          {cell.is_indicative ? "*" : ""}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragmented>
          ))}
          {netJumpRow ? (
            <tr className="rawNetJumpRow">
              <th className="assessStickyCol assessAthleteName" title="Отскок след засилване − разтег">
                Чист отскок <span className="rawUnit">(см)</span>
              </th>
              {netJumpRow.map((v, idx) => (
                <td key={idx} className="assessDerivedCell">
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="assessMuted rawLegend">
        Голямото число е реалната стойност; малкото в синьо е нормализираната оценка (0–100). „*" означава
        индикативна оценка (малка извадка/липсва норма).
      </p>
    </div>
  );
}

// Малък помощник: групиращ ред + редовете му, без да добавя DOM възел.
function Fragmented({ children }) {
  return <>{children}</>;
}
