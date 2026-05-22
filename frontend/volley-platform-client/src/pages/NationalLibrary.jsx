import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const AGE_OPTIONS = ["U13", "U14", "U15", "U16", "U17", "U18"];

function focusLabel(focus) {
  if (!focus?.length) return "";
  return focus.slice(0, 2).join(", ");
}

export default function NationalLibrary() {
  const toast = useToast();
  const navigate = useNavigate();
  const [ageBand, setAgeBand] = useState("U14");
  const [data, setData] = useState({ method_principles: null, cycles: [], drills: [] });
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [selectedCell, setSelectedCell] = useState({ week: 1, day: 1 });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY, {
        params: { age_band: ageBand },
      });
      setData({
        method_principles: res.data?.method_principles || null,
        cycles: res.data?.cycles || [],
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при зареждане");
    } finally {
      setLoading(false);
    }
  }, [ageBand, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCycle = async (id) => {
    try {
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_CYCLE(id));
      setSelectedCycle(res.data);
      const firstWeek = res.data?.weeks_detail?.[0]?.week;
      const firstDay = res.data?.weeks_detail?.[0]?.days?.[0]?.day;
      setSelectedCell({
        week: firstWeek ? Number(firstWeek) : 1,
        day: firstDay ? Number(firstDay) : 1,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при цикъл");
    }
  };

  const weekCards = useMemo(() => {
    return selectedCycle?.weeks_detail || selectedCycle?.structure_json?.weeks || [];
  }, [selectedCycle]);

  const slotCount = useMemo(() => {
    const fromApi = selectedCycle?.sessions_per_week;
    if (fromApi) return Number(fromApi);
    const maxDays = weekCards.reduce((m, w) => Math.max(m, (w.days || []).length), 0);
    return maxDays || 4;
  }, [selectedCycle, weekCards]);

  const goToGenerator = (week, day) => {
    if (!selectedCycle?.id) return;
    const params = new URLSearchParams({
      ageBand,
      cycleId: String(selectedCycle.id),
      cycleWeek: String(week),
      cycleDay: String(day),
    });
    navigate(`/ai-generator?${params.toString()}`);
  };

  const cellDay = (weekRow, dayIndex) => {
    const days = weekRow.days || [];
    return days.find((d) => Number(d.day) === dayIndex) || days[dayIndex - 1];
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Цикли БФВ и AI генератор"
        subtitle="Мезо/микро периодизация — изберете седмица и тренировка (3–4 на седмица), после генерирайте план с AI."
        actions={
          <Button as={Link} to="/method-guidelines" variant="secondary" size="sm">
            ← Методически насоки
          </Button>
        }
      />

      <Card style={{ padding: 16, marginBottom: 16, background: "var(--surface-2, #f0f4ff)" }}>
        <strong>Как работи</strong>
        <ol style={{ margin: "8px 0 0 18px", lineHeight: 1.6 }}>
          <li>Изберете възраст и мезо/микро цикъл отляво.</li>
          <li>В таблицата кликнете клетка (седмица × тренировка).</li>
          <li>
            <strong>Генерирай с AI</strong> — планът и упражненията са за конкретния ден от цикъла.
          </li>
        </ol>
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <label>
          Възраст:{" "}
          <select className="uiInput" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <Button as={Link} to="/method-guidelines" variant="secondary">
          Методически насоки
        </Button>
      </div>

      <div className="nationalPlannerLayout">
        <div className="nationalPlannerSidebar">
          {loading && <p className="uiMuted">Зареждане...</p>}
          {!loading && data.cycles.length === 0 && (
            <EmptyState title="Няма цикли" description="За тази възраст няма публикувани цикли." />
          )}
          {data.cycles.map((c) => (
            <Card
              key={c.id}
              className={`nationalPlannerCycleCard${selectedCycle?.id === c.id ? " nationalPlannerCycleCard--active" : ""}`}
              style={{ marginBottom: 8, padding: 12, cursor: "pointer" }}
              onClick={() => openCycle(c.id)}
            >
              <strong>{c.title_bg}</strong>
              <div className="uiMuted" style={{ fontSize: 13 }}>
                {c.cycle_type} · {c.weeks} седм. · {c.age_band}
              </div>
            </Card>
          ))}
        </div>

        <Card className="nationalPlannerMain" style={{ padding: 16, minHeight: 320 }}>
          {!selectedCycle && <p className="uiMuted">Изберете цикъл отляво.</p>}

          {selectedCycle && (
            <>
              <h2 style={{ marginTop: 0 }}>{selectedCycle.title_bg}</h2>
              {selectedCycle.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
              <p className="uiMuted" style={{ marginTop: 8, fontSize: 13 }}>
                {selectedCycle.ai_hint}
              </p>

              <div className="nationalPlannerTableWrap">
                <table className="nationalPlannerTable">
                  <thead>
                    <tr>
                      <th className="nationalPlannerTable__corner">Седмица</th>
                      {Array.from({ length: slotCount }, (_, i) => (
                        <th key={i}>Тренировка {i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekCards.map((w) => (
                      <tr key={w.week}>
                        <th className="nationalPlannerTable__weekHead">
                          <span className="nationalPlannerTable__weekNum">С{w.week}</span>
                          <span className="nationalPlannerTable__weekTheme">{w.theme}</span>
                          <span className="nationalPlannerTable__weekLoad uiMuted">{w.load}</span>
                        </th>
                        {Array.from({ length: slotCount }, (_, i) => {
                          const dayNum = i + 1;
                          const day = cellDay(w, dayNum);
                          const isSelected =
                            Number(selectedCell.week) === Number(w.week) &&
                            Number(selectedCell.day) === dayNum;
                          if (!day) {
                            return (
                              <td key={dayNum} className="nationalPlannerTable__cell nationalPlannerTable__cell--empty">
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={dayNum} className="nationalPlannerTable__cell">
                              <button
                                type="button"
                                className={`nationalPlannerCell${isSelected ? " nationalPlannerCell--selected" : ""}`}
                                onClick={() => setSelectedCell({ week: w.week, day: dayNum })}
                              >
                                <span className="nationalPlannerCell__label">{day.label || `Тр. ${dayNum}`}</span>
                                <span className="nationalPlannerCell__theme">{day.theme}</span>
                                <span className="nationalPlannerCell__focus uiMuted">{focusLabel(day.focus)}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedCell.week && selectedCell.day && (
                <div className="nationalPlannerSelection">
                  {(() => {
                    const wk = weekCards.find((w) => Number(w.week) === Number(selectedCell.week));
                    const day = cellDay(wk, selectedCell.day);
                    if (!wk || !day) return null;
                    return (
                      <>
                        <strong>
                          Седмица {wk.week}: {wk.theme} · {day.label}
                        </strong>
                        <p className="uiMuted" style={{ margin: "6px 0 0" }}>
                          {day.theme}
                          {day.session_goal ? ` — ${day.session_goal}` : ""}
                        </p>
                        <Button
                          variant="primary"
                          style={{ marginTop: 12 }}
                          onClick={() => goToGenerator(selectedCell.week, selectedCell.day)}
                        >
                          Генерирай тази тренировка с AI
                        </Button>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
