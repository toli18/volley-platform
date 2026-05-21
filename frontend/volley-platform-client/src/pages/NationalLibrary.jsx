import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const AGE_OPTIONS = ["U13", "U14", "U15", "U16", "U17", "U18"];

const SKILL_LABELS = {
  подаване: "Подаване",
  прием: "Прием",
  разпределение: "Разпределение",
  атака: "Атака",
  блок: "Блок",
  защита: "Защита",
  сервис: "Сервис",
};

export default function NationalLibrary() {
  const toast = useToast();
  const navigate = useNavigate();
  const [ageBand, setAgeBand] = useState("U14");
  const [section, setSection] = useState("cycles");
  const [data, setData] = useState({ method_principles: null, cycles: [], drills: [], guidelines: [] });
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [guidelineSkill, setGuidelineSkill] = useState("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY, {
        params: { age_band: ageBand },
      });
      setData({
        method_principles: res.data?.method_principles || null,
        cycles: res.data?.cycles || [],
        drills: res.data?.drills || [],
        guidelines: res.data?.guidelines || [],
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
    const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_CYCLE(id));
    setSelectedCycle(res.data);
    const w = res.data?.weeks_detail?.[0]?.week;
    setSelectedWeek(w ? Number(w) : 1);
  };

  const goToGenerator = () => {
    const params = new URLSearchParams({
      ageBand,
      cycleId: selectedCycle?.id ? String(selectedCycle.id) : "",
      cycleWeek: String(selectedWeek),
    });
    navigate(`/ai-generator?${params.toString()}`);
  };

  const weekCards = useMemo(() => {
    return selectedCycle?.weeks_detail || selectedCycle?.structure_json?.weeks || [];
  }, [selectedCycle]);

  const guidelineSkills = useMemo(() => {
    return [...new Set((data.guidelines || []).map((g) => g.skill_element))].sort();
  }, [data.guidelines]);

  const filteredGuidelines = useMemo(() => {
    if (guidelineSkill === "all") return data.guidelines || [];
    return (data.guidelines || []).filter((g) => g.skill_element === guidelineSkill);
  }, [data.guidelines, guidelineSkill]);

  return (
    <div className="uiPage">
      <PageHero
        title="Национална методика БФВ"
        subtitle="Методиката от „Наука и спорта“ захранва AI генератора — треньорът получава цикли, план и упражнения, не дълги статии."
      />

      <Card style={{ padding: 16, marginBottom: 16, background: "var(--surface-2, #f0f4ff)" }}>
        <strong>Как работи</strong>
        <ol style={{ margin: "8px 0 0 18px", lineHeight: 1.6 }}>
          <li>Изберете възраст и мезо/микро цикъл.</li>
          <li>Отворете седмица → <strong>Генерирай тренировка с AI</strong>.</li>
          <li>AI използва методиката БФВ + базата упражнения → текстов план и предложени drills.</li>
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
        <Button variant={section === "cycles" ? "primary" : "secondary"} onClick={() => setSection("cycles")}>
          Цикли
        </Button>
        <Button variant={section === "principles" ? "primary" : "secondary"} onClick={() => setSection("principles")}>
          Принципи (кратко)
        </Button>
        <Button variant={section === "guidelines" ? "primary" : "secondary"} onClick={() => setSection("guidelines")}>
          Насоки
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 2fr)", gap: 16 }}>
        <div>
          {loading && <p className="uiMuted">Зареждане...</p>}

          {section === "principles" && data.method_principles && (
            <Card style={{ padding: 12 }}>
              <p className="uiMuted" style={{ fontSize: 13 }}>{data.method_principles.note}</p>
              <ul style={{ marginTop: 8 }}>
                {(data.method_principles.principles || []).map((p, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {section === "guidelines" && (
            <>
              <select
                className="uiInput"
                style={{ marginBottom: 8, width: "100%" }}
                value={guidelineSkill}
                onChange={(e) => setGuidelineSkill(e.target.value)}
              >
                <option value="all">Всички елементи</option>
                {guidelineSkills.map((s) => (
                  <option key={s} value={s}>
                    {SKILL_LABELS[s] || s}
                  </option>
                ))}
              </select>
              {filteredGuidelines.map((g) => (
                <Card key={g.id} style={{ marginBottom: 8, padding: 12 }}>
                  <div className="uiMuted" style={{ fontSize: 12 }}>{SKILL_LABELS[g.skill_element] || g.skill_element}</div>
                  <p>
                    <strong>Грешка:</strong> {g.error_bg}
                  </p>
                  <p style={{ marginTop: 6 }}>
                    <strong>Корекция:</strong> {g.correction_bg}
                  </p>
                </Card>
              ))}
            </>
          )}

          {section === "cycles" &&
            data.cycles.map((c) => (
              <Card
                key={c.id}
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

        <Card style={{ padding: 16, minHeight: 280 }}>
          {section !== "cycles" && <p className="uiMuted">Изберете таб „Цикли“ за генериране на тренировка.</p>}

          {section === "cycles" && !selectedCycle && <p className="uiMuted">Изберете цикъл отляво.</p>}

          {section === "cycles" && selectedCycle && (
            <>
              <h2>{selectedCycle.title_bg}</h2>
              {selectedCycle.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
              <p className="uiMuted" style={{ marginTop: 8 }}>{selectedCycle.ai_hint}</p>

              <label style={{ display: "block", marginTop: 16 }}>
                Седмица от цикъла:{" "}
                <select
                  className="uiInput"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                >
                  {weekCards.map((w) => (
                    <option key={w.week} value={w.week}>
                      Седмица {w.week}: {w.theme}
                    </option>
                  ))}
                </select>
              </label>

              {weekCards
                .filter((w) => Number(w.week) === Number(selectedWeek))
                .map((w) => (
                  <div key={w.week} style={{ marginTop: 12, padding: 12, background: "var(--surface-2, #f5f5f5)", borderRadius: 8 }}>
                    <strong>Фокус: {w.theme}</strong>
                    <p className="uiMuted">Натоварване: {w.load}</p>
                    {w.session_goals?.length > 0 && (
                      <ul>
                        {w.session_goals.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

              <Button variant="primary" style={{ marginTop: 20 }} onClick={goToGenerator}>
                Генерирай тренировка с AI
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
