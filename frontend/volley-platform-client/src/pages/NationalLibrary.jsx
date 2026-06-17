import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";
import { NATIONAL_LIBRARY_AGE_OPTIONS } from "../utils/ageBands";

const PERIOD_BADGE = {
  prep: "Подготвителен",
  competitive: "Състезателен",
  transition: "Преходен",
};

function focusLabel(focus) {
  if (!focus?.length) return "";
  return focus.slice(0, 2).join(", ");
}

export default function NationalLibrary() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ageBand, setAgeBand] = useState(() => searchParams.get("ageBand") || "U16");
  const [expandedMacro, setExpandedMacro] = useState(1);
  const [annual, setAnnual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [selectedCell, setSelectedCell] = useState({ week: 1, day: 1 });

  useEffect(() => {
    const band = searchParams.get("ageBand");
    if (band) setAgeBand(band);
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY, {
        params: { age_band: ageBand },
      });
      setAnnual(res.data?.annual_program || null);
      setSelectedCycle(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при зареждане");
    } finally {
      setLoading(false);
    }
  }, [ageBand, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const mesoRaw = searchParams.get("meso");
    const weekRaw = searchParams.get("week");
    const dayRaw = searchParams.get("day");
    if (!annual || !mesoRaw || selectedCycle) return;
    const mesoNum = Number(mesoRaw);
    if (!Number.isFinite(mesoNum)) return;
    const allMesos = [...(annual.mesos_by_macro?.[1] || []), ...(annual.mesos_by_macro?.[2] || [])];
    const target = allMesos.find((m) => Number(m.meso_number) === mesoNum);
    if (!target?.id) return;
    openCycle(target.id).then(() => {
      if (weekRaw || dayRaw) {
        setSelectedCell({
          week: weekRaw ? Number(weekRaw) : 1,
          day: dayRaw ? Number(dayRaw) : 1,
        });
      }
    });
  }, [annual, selectedCycle, searchParams]);

  const hasAnnual = Boolean(annual?.mesos_by_macro?.[1]?.length || annual?.mesos_by_macro?.[2]?.length);

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
      return res.data;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при цикъл");
      return null;
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

  const cellDay = (weekRow, dayIndex) => {
    const days = weekRow?.days || [];
    return days.find((d) => Number(d.day) === dayIndex) || days[dayIndex - 1];
  };

  const goToGenerator = (week, day) => {
    if (!selectedCycle?.id) return;
    const wk = weekCards.find((w) => Number(w.week) === Number(week));
    const dayObj = cellDay(wk, day);
    const params = new URLSearchParams({
      ageBand,
      cycleId: String(selectedCycle.id),
      cycleWeek: String(week),
      cycleDay: String(day),
    });
    const tbSlug = dayObj?.textbook_slug || wk?.textbook_slug || selectedCycle?.annual_program?.primary_textbook_slug;
    if (tbSlug) params.set("textbookSlug", tbSlug);
    if (dayObj?.session_code) params.set("sessionCode", dayObj.session_code);
    navigate(`/ai-generator?${params.toString()}`);
  };

  const renderMesoCard = (m) => (
    <Card
      key={m.id}
      className={`nationalPlannerCycleCard nationalPlannerMesoCard${selectedCycle?.id === m.id ? " nationalPlannerCycleCard--active" : ""}`}
      style={{ marginBottom: 6, padding: 10, cursor: "pointer" }}
      onClick={() => openCycle(m.id)}
    >
      <div className="nationalPlannerMesoCard__head">
        <strong>Мезо {m.meso_number}</strong>
        {m.period && (
          <span className={`nationalPlannerBadge nationalPlannerBadge--${m.period}`}>
            {m.period_label || PERIOD_BADGE[m.period] || m.period}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13 }}>{m.title_bg.replace(/^Мезо \d+ — /, "")}</div>
      {m.summary_bg && (
        <div className="uiMuted" style={{ fontSize: 12, marginTop: 4 }}>
          {m.summary_bg}
        </div>
      )}
    </Card>
  );

  return (
    <div className="uiPage">
      <PageHero
        title="Годишна програма БФВ"
        subtitle="Макро I/II → 11 мезоцикъла → седмица → тренировка. Конспекти от учебника се подават автоматично към AI."
        actions={
          <Button as={Link} to="/textbook" variant="secondary" size="sm">
            Учебник БФВ
          </Button>
        }
      />

      <Card style={{ padding: 16, marginBottom: 16, background: "var(--surface-2, #f0f4ff)" }}>
        <strong>Как работи</strong>
        <ol style={{ margin: "8px 0 0 18px", lineHeight: 1.6 }}>
          <li>Изберете възраст и мезо от годишната програма (от учебника БФВ).</li>
          <li>В таблицата кликнете клетка (седмица × тренировка).</li>
          <li>
            <strong>Генерирай с AI</strong> — планът включва мезо, период и конспект от учебника.
          </li>
        </ol>
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <label>
          Възраст:{" "}
          <select className="uiInput" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            {NATIONAL_LIBRARY_AGE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {annual?.age_band_note && (
          <span className="uiMuted" style={{ fontSize: 13 }}>
            {annual.age_band_note}
          </span>
        )}
        <Button as={Link} to="/textbook" variant="secondary">
          Методика в учебника
        </Button>
      </div>

      <div className="nationalPlannerLayout">
        <div className="nationalPlannerSidebar">
          {loading && <p className="uiMuted">Зареждане...</p>}

          {!loading && !hasAnnual && (
            <EmptyState
              title="Годишната програма се зарежда"
              description="Данните идват от учебника БФВ. Опитайте U16 или U18, или презаредете след минута. Ако проблемът остане — свържете се с администратор."
            />
          )}

          {!loading && hasAnnual && (
            <>
              {(annual.macros || []).map((macro) => (
                <div key={macro.id} className="nationalPlannerMacroGroup">
                  <button
                    type="button"
                    className="nationalPlannerMacroHead"
                    onClick={() => setExpandedMacro(macro.macro_id || macro.id)}
                  >
                    <span>{macro.title_bg}</span>
                    <span className="uiMuted">{expandedMacro === (macro.macro_id || 1) ? "▾" : "▸"}</span>
                  </button>
                  {expandedMacro === (macro.macro_id || macro.id) &&
                    (annual.mesos_by_macro?.[macro.macro_id || 1] || []).map(renderMesoCard)}
                </div>
              ))}
              {annual.textbook_slug && (
                <Button
                  as={Link}
                  to={`/textbook/${annual.textbook_slug}`}
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: 8 }}
                >
                  Периодизация в учебника
                </Button>
              )}
            </>
          )}
        </div>

        <Card className="nationalPlannerMain" style={{ padding: 16, minHeight: 320 }}>
          {!selectedCycle && <p className="uiMuted">Изберете мезоцикъл от годишната програма.</p>}

          {selectedCycle?.cycle_type === "macro" && (
            <div>
              <h2 style={{ marginTop: 0 }}>{selectedCycle.title_bg}</h2>
              <p className="uiMuted">{selectedCycle.summary_bg}</p>
              <p>
                Изберете конкретен <strong>мезоцикъл</strong> отляво, за да видите седмици и тренировки.
              </p>
              {selectedCycle.annual_program?.textbook_reference && (
                <Button
                  as={Link}
                  to={`/textbook/${selectedCycle.annual_program.textbook_reference}`}
                  variant="secondary"
                  size="sm"
                >
                  Отвори периодизацията в учебника
                </Button>
              )}
            </div>
          )}

          {selectedCycle && selectedCycle.cycle_type !== "macro" && (
            <>
              <div className="nationalPlannerMainHead">
                <div>
                  <h2 style={{ marginTop: 0 }}>{selectedCycle.title_bg}</h2>
                  {selectedCycle.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
                </div>
                {selectedCycle.annual_program && (
                  <div className="nationalPlannerMetaBadges">
                    {selectedCycle.annual_program.meso_number && (
                      <span className="nationalPlannerMetaBadge">Мезо {selectedCycle.annual_program.meso_number}</span>
                    )}
                    {selectedCycle.annual_program.period_label && (
                      <span className={`nationalPlannerBadge nationalPlannerBadge--${selectedCycle.annual_program.period}`}>
                        {selectedCycle.annual_program.period_label}
                      </span>
                    )}
                    {selectedCycle.annual_program.primary_session_code && (
                      <Link
                        to={`/textbook/${selectedCycle.annual_program.primary_textbook_slug}`}
                        className="nationalPlannerMetaBadge nationalPlannerMetaBadge--link"
                      >
                        {selectedCycle.annual_program.primary_session_code}
                      </Link>
                    )}
                  </div>
                )}
              </div>
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
                          {w.session_code && (
                            <span className="nationalPlannerTable__weekPlan uiMuted">{w.session_code}</span>
                          )}
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
                                {day.session_code && (
                                  <span className="nationalPlannerCell__plan uiMuted">{day.session_code}</span>
                                )}
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
                          Мезо {selectedCycle.meso_number || selectedCycle.structure_json?.meso_number}:{" "}
                          {selectedCycle.title_bg?.replace(/^Мезо \d+ — /, "") || selectedCycle.title_bg}
                        </strong>
                        <p className="uiMuted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                          Седмица {selectedCell.week}: {wk.theme} · {day.label}
                        </p>
                        <p className="uiMuted" style={{ margin: "6px 0 0" }}>
                          {day.theme}
                          {day.session_goal ? ` — ${day.session_goal}` : ""}
                        </p>
                        {(day.textbook_slug || wk.textbook_slug) && (
                          <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                            <Link to={`/textbook/${day.textbook_slug || wk.textbook_slug}`}>
                              Конспект в учебника{day.session_code ? `: ${day.session_code}` : ""}
                            </Link>
                          </p>
                        )}
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
