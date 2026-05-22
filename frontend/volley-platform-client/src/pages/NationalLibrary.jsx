import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const AGE_OPTIONS = ["U13", "U14", "U15", "U16", "U17", "U18"];

export default function NationalLibrary() {
  const toast = useToast();
  const navigate = useNavigate();
  const [ageBand, setAgeBand] = useState("U14");
  const [section, setSection] = useState("cycles");
  const [data, setData] = useState({ method_principles: null, cycles: [], drills: [], guidelines: [] });
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
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

  return (
    <div className="uiPage">
      <PageHero
        title="Цикли БФВ и AI генератор"
        subtitle="Мезо/микро периодизация по възраст → генерирайте тренировка. Методическите насоки са в отделен раздел."
        actions={
          <Button as={Link} to="/method-guidelines" variant="secondary" size="sm">
            ← Методически насоки
          </Button>
        }
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
        <Button variant="primary" disabled>
          Цикли
        </Button>
        <Button as={Link} to="/method-guidelines" variant="secondary">
          Методически насоки
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 2fr)", gap: 16 }}>
        <div>
          {loading && <p className="uiMuted">Зареждане...</p>}

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
          {!selectedCycle && <p className="uiMuted">Изберете цикъл отляво.</p>}

          {selectedCycle && (
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
