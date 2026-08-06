import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { EmptyState } from "../../components/ui";
import "../../components/assessment/assessment.css";

const CATEGORY_LABELS = {
  technical: "Технически",
  speed: "Бързина",
  physical: "Физически",
  anthropometry: "Антропометрия",
};
const CATEGORY_ORDER = ["technical", "speed", "physical", "anthropometry"];

function DirectionTag({ direction }) {
  if (direction === "higher_better") {
    return <span className="batteryTag batteryTag--up">↑ повече = по-добре</span>;
  }
  if (direction === "lower_better") {
    return <span className="batteryTag batteryTag--down">↓ по-малко = по-добре</span>;
  }
  return <span className="batteryTag">контекст</span>;
}

function ageLabel(test) {
  const { age_min, age_max } = test;
  if (age_min == null && age_max == null) return null;
  if (age_min != null && age_max != null) return `${age_min}–${age_max} г.`;
  if (age_min != null) return `${age_min}+ г.`;
  return `до ${age_max} г.`;
}

export default function CoachTestBattery() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY);
        if (!alive) return;
        setTests(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Неуспешно зареждане на тестовата батерия.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const version = tests[0]?.battery_version || "v1.0";

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? tests.filter(
          (t) =>
            String(t.name || "").toLowerCase().includes(q) ||
            String(t.code || "").toLowerCase().includes(q)
        )
      : tests;
    const map = {};
    for (const t of filtered) {
      const cat = CATEGORY_ORDER.includes(t.category) ? t.category : "other";
      (map[cat] ||= []).push(t);
    }
    return map;
  }, [tests, search]);

  const orderedCats = useMemo(() => {
    const cats = [...CATEGORY_ORDER, "other"].filter((c) => grouped[c]?.length);
    return cats;
  }, [grouped]);

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;

  return (
    <div className="coachMobilePage">
      <div className="devHead">
        <Link to="/coach/assessment" className="devBack">
          ← Тестирания
        </Link>
        <h2 className="coachMobileSectionTitle" style={{ margin: 0 }}>
          Тестова батерия <span className="batteryCode">{version}</span>
        </h2>
      </div>

      <div className="assessToolbar">
        <label className="assessField" style={{ flex: 1 }}>
          <span>Търсене по име или код</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="напр. спринт, CMJ..."
          />
        </label>
      </div>

      {orderedCats.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="Няма съвпадения"
          description="Опитайте друго търсене или изчистете полето."
        />
      ) : (
        orderedCats.map((cat) => (
          <section className="batteryGroup" key={cat}>
            <div className="batteryGroupHead">
              <span className="batteryGroupTitle">{CATEGORY_LABELS[cat] || "Други"}</span>
              <span className="batteryGroupCount">{grouped[cat].length} теста</span>
            </div>
            <div className="batteryCards">
              {grouped[cat].map((t) => {
                const age = ageLabel(t);
                return (
                  <article className="batteryCard" key={t.id}>
                    <div className="batteryCardTop">
                      <span className="batteryCardName">{t.name}</span>
                      <span className="batteryCode">{t.code}</span>
                    </div>
                    <div className="batteryMeta">
                      <span className="batteryTag">мерна: {t.unit}</span>
                      <DirectionTag direction={t.direction} />
                      {age ? <span className="batteryTag">възраст: {age}</span> : null}
                    </div>
                    {t.protocol ? <p className="batteryProtocol">{t.protocol}</p> : null}
                    {t.video_url ? (
                      <a
                        className="batteryVideo"
                        href={t.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ▶ Видео протокол
                      </a>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
