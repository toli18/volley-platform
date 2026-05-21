import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const AGE_OPTIONS = ["all", "U13", "U14", "U15", "U16", "U17", "U18"];

const renderBody = (text) => {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h3 key={i} style={{ marginTop: 12, marginBottom: 6 }}>
          {line.replace(/^##\s+/, "")}
        </h3>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} style={{ marginLeft: 18 }}>
          {line.replace(/^-\s+/, "")}
        </li>
      );
    }
    if (!line.trim()) return <br key={i} />;
    return (
      <p key={i} style={{ margin: "6px 0" }}>
        {line}
      </p>
    );
  });
};

export default function NationalLibrary() {
  const toast = useToast();
  const [ageBand, setAgeBand] = useState("all");
  const [section, setSection] = useState("articles");
  const [data, setData] = useState({ articles: [], cycles: [], drills: [] });
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [selectedDrill, setSelectedDrill] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = ageBand && ageBand !== "all" ? { age_band: ageBand } : {};
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY, { params });
      setData({
        articles: res.data?.articles || [],
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

  const openArticle = async (id) => {
    const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_ARTICLE(id));
    setSelectedArticle(res.data);
    setSelectedCycle(null);
    setSelectedDrill(null);
  };

  const openCycle = async (id) => {
    const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_CYCLE(id));
    setSelectedCycle(res.data);
    setSelectedArticle(null);
    setSelectedDrill(null);
  };

  const openDrill = async (id) => {
    const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_DRILL(id));
    setSelectedDrill(res.data);
    setSelectedArticle(null);
    setSelectedCycle(null);
  };

  const weekCards = useMemo(() => {
    const weeks = selectedCycle?.structure_json?.weeks;
    return Array.isArray(weeks) ? weeks : [];
  }, [selectedCycle]);

  return (
    <div className="uiPage">
      <PageHero
        title="Национална библиотека"
        subtitle="Официална методика и периодизация на БФВ — само текст на български."
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <label>
          Възраст:{" "}
          <select className="uiInput" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "Всички" : a}
              </option>
            ))}
          </select>
        </label>
        <Button variant={section === "articles" ? "primary" : "secondary"} onClick={() => setSection("articles")}>
          Методика
        </Button>
        <Button variant={section === "cycles" ? "primary" : "secondary"} onClick={() => setSection("cycles")}>
          Цикли
        </Button>
        <Button variant={section === "drills" ? "primary" : "secondary"} onClick={() => setSection("drills")}>
          Упражнения
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 2fr)", gap: 16 }}>
        <div>
          {loading && <p className="uiMuted">Зареждане...</p>}
          {!loading && section === "articles" && data.articles.length === 0 && (
            <EmptyState title="Няма статии за този филтър" />
          )}
          {section === "articles" &&
            data.articles.map((a) => (
              <Card key={a.id} style={{ marginBottom: 8, padding: 12, cursor: "pointer" }} onClick={() => openArticle(a.id)}>
                <strong>{a.title_bg}</strong>
                <div className="uiMuted" style={{ fontSize: 13 }}>
                  {a.category} · {a.age_band}
                </div>
              </Card>
            ))}
          {section === "cycles" &&
            data.cycles.map((c) => (
              <Card key={c.id} style={{ marginBottom: 8, padding: 12, cursor: "pointer" }} onClick={() => openCycle(c.id)}>
                <strong>{c.title_bg}</strong>
                <div className="uiMuted" style={{ fontSize: 13 }}>
                  {c.cycle_type} · {c.weeks} седм. · {c.age_band}
                </div>
              </Card>
            ))}
          {section === "drills" &&
            data.drills.map((d) => (
              <Card key={d.id} style={{ marginBottom: 8, padding: 12, cursor: "pointer" }} onClick={() => openDrill(d.id)}>
                <strong>{d.title}</strong>
                <div className="uiMuted" style={{ fontSize: 13 }}>
                  U{d.age_min}–{d.age_max}
                </div>
              </Card>
            ))}
        </div>

        <Card style={{ padding: 16, minHeight: 280 }}>
          {!selectedArticle && !selectedCycle && !selectedDrill && (
            <p className="uiMuted">Изберете елемент от списъка.</p>
          )}
          {selectedArticle && (
            <>
              <h2>{selectedArticle.title_bg}</h2>
              <div>{renderBody(selectedArticle.body_bg)}</div>
            </>
          )}
          {selectedCycle && (
            <>
              <h2>{selectedCycle.title_bg}</h2>
              {selectedCycle.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
              {weekCards.map((w) => (
                <div key={w.week} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border, #ddd)" }}>
                  <strong>
                    Седмица {w.week}: {w.theme}
                  </strong>
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
              <p style={{ marginTop: 16 }}>
                <Link to="/ai-generator">
                  <Button variant="secondary">Отвори AI генератор</Button>
                </Link>
              </p>
            </>
          )}
          {selectedDrill && (
            <>
              <h2>{selectedDrill.title}</h2>
              <p>{selectedDrill.description}</p>
              <h3>Инструкции</h3>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{selectedDrill.instructions}</pre>
              <h3>Акценти</h3>
              <p>{selectedDrill.coaching_points}</p>
              <Link to={`/drills/${selectedDrill.id}`}>
                <Button variant="secondary">Пълен преглед</Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
