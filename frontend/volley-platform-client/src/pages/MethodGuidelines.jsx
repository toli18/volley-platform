import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const AGE_OPTIONS = ["U13", "U14", "U15", "U16", "U17", "U18"];

function SectionContent({ section, loading }) {
  if (loading) return <p className="methodHubMuted">Зареждане...</p>;
  if (!section) return <p className="methodHubMuted">Изберете тема отляво.</p>;

  if (section.layout === "cta_cycles") {
    return (
      <div className="methodHubCta">
        <p>{section.intro}</p>
        <Button as={Link} to={section.cta_path || "/national-library"} variant="primary">
          {section.cta_label || "Цикли БФВ"}
        </Button>
      </div>
    );
  }

  if (section.layout === "skill_errors" && section.skills?.length) {
    return (
      <div className="methodHubGrid methodHubGrid--2">
        {section.skills.map((sk) => (
          <div key={sk.skill_key} className="methodHubCard">
            <h3 className="methodHubCardTitle">{sk.name}</h3>
            {sk.pairs.map((p) => (
              <div key={`${sk.skill_key}-${p.error}`} className="methodHubErrorPair">
                <div className="methodHubError">
                  <span className="methodHubLabel methodHubLabel--err">Грешка</span>
                  {p.error}
                </div>
                <div className="methodHubCorrection">
                  <span className="methodHubLabel methodHubLabel--ok">Корекция</span>
                  {p.correction}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (section.layout === "step_cards" && section.blocks?.length) {
    return (
      <div className="methodHubGrid methodHubGrid--2">
        {section.blocks.map((b) => (
          <div key={b.title} className="methodHubCard">
            <h3 className="methodHubCardTitle">{b.title}</h3>
            <ol className="methodHubSteps">
              {b.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  }

  if (section.layout === "principle_cards") {
    return (
      <>
        <div className="methodHubGrid methodHubGrid--2">
          {section.blocks?.map((b) => (
            <div key={b.title} className="methodHubCard methodHubCard--principle">
              <h3 className="methodHubCardTitle">{b.title}</h3>
              <p>{b.body}</p>
            </div>
          ))}
        </div>
        {section.numbered_steps?.length ? (
          <div className="methodHubCard" style={{ marginTop: 16 }}>
            <h3 className="methodHubCardTitle">Стъпки на обучение</h3>
            <ol className="methodHubSteps">
              {section.numbered_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </>
    );
  }

  if (section.layout === "age_bands" && section.blocks?.length) {
    return (
      <div className="methodHubStack">
        {section.blocks.map((b) => (
          <div key={b.age_key} className="methodHubCard methodHubCard--age">
            <h3 className="methodHubCardTitle">{b.label}</h3>
            <div className="methodHubTwoCol">
              <div>
                <h4 className="methodHubSubhead">Фокус</h4>
                <ul>
                  {b.focus.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="methodHubSubhead">Методически указания</h4>
                <ul>
                  {b.method.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.layout === "position_cards" && section.blocks?.length) {
    return (
      <div className="methodHubGrid methodHubGrid--2">
        {section.blocks.map((b) => (
          <div key={b.title} className="methodHubCard">
            <h3 className="methodHubCardTitle">{b.title}</h3>
            <h4 className="methodHubSubhead">Основни задачи</h4>
            <ul>
              {b.tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <h4 className="methodHubSubhead">Ключови умения</h4>
            <ul>
              {b.skills.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <div className="methodHubTips">
              {b.tips.map((t, i) => (
                <div key={i}>{t}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="methodHubStack">
      {section.blocks?.map((b) => (
        <div key={b.title} className="methodHubCard">
          <h3 className="methodHubCardTitle">{b.title}</h3>
          <ul>
            {b.bullets?.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function MethodGuidelines() {
  const toast = useToast();
  const [ageBand, setAgeBand] = useState("U14");
  const [hub, setHub] = useState(null);
  const [activeSlug, setActiveSlug] = useState("common-mistakes");
  const [section, setSection] = useState(null);
  const [loadingHub, setLoadingHub] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);

  const loadHub = useCallback(async () => {
    try {
      setLoadingHub(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_COACH_HUB, {
        params: { age_band: ageBand },
      });
      setHub(res.data);
      if (res.data?.default_slug && !activeSlug) setActiveSlug(res.data.default_slug);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при зареждане");
    } finally {
      setLoadingHub(false);
    }
  }, [ageBand, toast]);

  const loadSection = useCallback(async () => {
    if (!activeSlug) return;
    try {
      setLoadingSection(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_COACH_HUB_SECTION(activeSlug), {
        params: { age_band: ageBand },
      });
      setSection(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
      setSection(null);
    } finally {
      setLoadingSection(false);
    }
  }, [activeSlug, ageBand, toast]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  useEffect(() => {
    loadSection();
  }, [loadSection]);

  const activeTitle = useMemo(() => {
    for (const g of hub?.groups || []) {
      const s = g.sections?.find((x) => x.slug === activeSlug);
      if (s) return s.title_bg;
    }
    return section?.title_bg || "";
  }, [hub, activeSlug, section]);

  return (
    <div className="uiPage methodHubPage">
      <PageHero
        title={hub?.title || "Методически насоки"}
        subtitle={hub?.subtitle || "Професионални ресурси за волейболни треньори"}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="methodHubAgeLabel">
              Възраст:{" "}
              <select className="uiInput" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
                {AGE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <Button as={Link} to="/textbook" variant="secondary" size="sm">
              Учебник БФВ
            </Button>
            <Button as={Link} to="/national-library" variant="secondary" size="sm">
              Цикли БФВ → AI
            </Button>
          </div>
        }
      />

      <div className="methodHubLayout">
        <aside className="methodHubSidebar">
          {loadingHub ? (
            <p className="methodHubMuted">...</p>
          ) : (
            hub?.groups?.map((g) => (
              <div key={g.id} className="methodHubNavGroup">
                <div className="methodHubNavGroupTitle">{g.title}</div>
                {g.sections.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    className={`methodHubNavItem${activeSlug === s.slug ? " methodHubNavItem--active" : ""}`}
                    onClick={() => setActiveSlug(s.slug)}
                  >
                    {s.title_bg}
                  </button>
                ))}
              </div>
            ))
          )}
        </aside>

        <main className="methodHubMain">
          <header className="methodHubMainHead">
            <h2>{activeTitle || section?.title_bg}</h2>
            {section?.subtitle_bg ? <p className="methodHubMuted">{section.subtitle_bg}</p> : null}
          </header>
          <SectionContent section={section} loading={loadingSection} />
        </main>
      </div>
    </div>
  );
}
