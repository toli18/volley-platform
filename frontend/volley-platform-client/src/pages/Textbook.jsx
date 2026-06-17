import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, EmptyState, PageHero } from "../components/ui";
import MobileDrawer from "../components/shell/MobileDrawer";
import { useToast } from "../components/ToastProvider";
import useMediaQuery from "../utils/useMediaQuery";
import {
  PLAN_BAND_LABELS,
  PLAN_BAND_ORDER,
  TEXTBOOK_AGE_FILTER_OPTIONS,
} from "../utils/ageBands";

const QUICK_PLAN_PREVIEW = 3;

function titleCase(s) {
  if (!s) return "";
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function SessionTimeline({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="textbookTimeline">
      <h3 className="textbookSubhead">Структура на тренировката</h3>
      {blocks.map((b, i) => (
        <div key={i} className={`textbookTimeline__item textbookTimeline__item--${b.type}`}>
          {b.type === "time_block" && (
            <>
              <span className="textbookTimeline__time">
                {b.start}–{b.end}
              </span>
              <span className="textbookTimeline__label">{b.label}</span>
            </>
          )}
          {b.type === "training_day" && (
            <>
              <span className="textbookTimeline__time">Тр. {b.day_num}</span>
              <span className="textbookTimeline__label">
                <strong>{b.weekday}:</strong> {b.label}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionBadges({ section }) {
  if (!section) return null;
  return (
    <div className="textbookBadges">
      {section.category_label && <span className="textbookBadge">{section.category_label}</span>}
      {section.part_label && <span className="textbookBadge textbookBadge--muted">{section.part_label}</span>}
      {section.age_band && section.age_band !== "all" && (
        <span className="textbookBadge textbookBadge--age">{section.age_band}</span>
      )}
      {section.session_code && <span className="textbookBadge textbookBadge--plan">{section.session_code}</span>}
      {section.session_phase && (
        <span className="textbookBadge textbookBadge--phase">{section.session_phase}</span>
      )}
    </div>
  );
}

export default function Textbook() {
  const toast = useToast();
  const navigate = useNavigate();
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [index, setIndex] = useState(null);
  const [section, setSection] = useState(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [expandedPlanBands, setExpandedPlanBands] = useState(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobileLayout = useMediaQuery("(max-width: 768px)");

  const sortedPlanBands = useMemo(() => {
    const byAge = index?.session_plans_by_age || {};
    const ordered = PLAN_BAND_ORDER.filter((band) => (byAge[band] || []).length > 0);
    const rest = Object.keys(byAge).filter(
      (band) => band !== "all" && !PLAN_BAND_ORDER.includes(band) && (byAge[band] || []).length > 0
    );
    return [...ordered, ...rest];
  }, [index?.session_plans_by_age]);

  const togglePlanBand = (band) => {
    setExpandedPlanBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  };

  const activeSlug = routeSlug || searchParams.get("s") || "";
  const query = searchParams.get("q") || "";
  const ageFilter = searchParams.get("age") || "all";
  const partFilter = searchParams.get("part") || "";
  const categoryFilter = searchParams.get("category") || "";

  const loadIndex = useCallback(async () => {
    try {
      setLoadingIndex(true);
      const params = {};
      if (query) params.q = query;
      if (ageFilter && ageFilter !== "all") params.age_band = ageFilter;
      if (partFilter) params.part = partFilter;
      if (categoryFilter) params.category = categoryFilter;
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_TEXTBOOK, { params });
      setIndex(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка при зареждане на учебника");
    } finally {
      setLoadingIndex(false);
    }
  }, [query, ageFilter, partFilter, categoryFilter, toast]);

  const loadSection = useCallback(async (slug) => {
    if (!slug) {
      setSection(null);
      return;
    }
    try {
      setLoadingSection(true);
      const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_TEXTBOOK_SECTION(slug));
      setSection(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Секцията не е намерена");
      setSection(null);
    } finally {
      setLoadingSection(false);
    }
  }, [toast]);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    loadSection(activeSlug);
  }, [activeSlug, loadSection]);

  const openSlug = (slug) => {
    navigate(`/textbook/${slug}`);
    if (isMobileLayout) setSidebarOpen(false);
  };

  const renderSidebarNav = () => (
    <>
      {loadingIndex && <p className="methodHubMuted">Зареждане…</p>}

      {showSearch && searchResults && (
        <div className="textbookSidebarBlock">
          <div className="methodHubNavGroupTitle">Резултати ({searchResults.length})</div>
          {searchResults.length === 0 && <p className="methodHubMuted">Няма съвпадения.</p>}
          {searchResults.map((s) => (
            <button
              key={s.slug}
              type="button"
              className={`methodHubNavItem${activeSlug === s.slug ? " methodHubNavItem--active" : ""}`}
              onClick={() => openSlug(s.slug)}
            >
              <span className="textbookNavTitle">{titleCase(s.title_bg)}</span>
              {s.session_code && <span className="textbookNavMeta">{s.session_code}</span>}
            </button>
          ))}
        </div>
      )}

      {!showSearch &&
        (index?.navigation || []).map((group) => (
          <div key={group.id} className="methodHubNavGroup">
            <div className="methodHubNavGroupTitle">{group.title}</div>
            {(group.sections || []).map((s) => (
              <button
                key={s.slug}
                type="button"
                className={`methodHubNavItem${activeSlug === s.slug ? " methodHubNavItem--active" : ""}`}
                onClick={() => openSlug(s.slug)}
              >
                <span className="textbookNavTitle">{titleCase(s.title_bg)}</span>
                {s.kind === "session_plan" && s.session_code && (
                  <span className="textbookNavMeta">{s.session_code}</span>
                )}
              </button>
            ))}
          </div>
        ))}

      {!showSearch && index?.session_plans_by_age && sortedPlanBands.length > 0 && (
        <div className="textbookSidebarBlock">
          <div className="methodHubNavGroupTitle">
            Бърз достъп — конспекти (
            {Object.values(index.session_plans_by_age)
              .flat()
              .filter(Boolean).length}
            )
          </div>
          {sortedPlanBands.map((band) => {
            const plans = index.session_plans_by_age[band] || [];
            const expanded = expandedPlanBands.has(band);
            const visible = expanded ? plans : plans.slice(0, QUICK_PLAN_PREVIEW);
            const hiddenCount = Math.max(0, plans.length - QUICK_PLAN_PREVIEW);
            return (
              <div key={band} className="textbookQuickAge">
                <span className="textbookQuickAge__label">
                  {PLAN_BAND_LABELS[band] || band} · {plans.length}
                </span>
                {visible.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    className={`methodHubNavItem methodHubNavItem--compact${activeSlug === p.slug ? " methodHubNavItem--active" : ""}`}
                    onClick={() => openSlug(p.slug)}
                  >
                    {p.session_code || titleCase(p.title_bg)}
                  </button>
                ))}
                {hiddenCount > 0 ? (
                  <button type="button" className="textbookQuickAge__toggle" onClick={() => togglePlanBand(band)}>
                    {expanded ? "По-малко" : `+${hiddenCount} още`}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const searchResults = index?.search_results;
  const showSearch = Boolean(query || (ageFilter && ageFilter !== "all") || partFilter || categoryFilter);

  const goToGenerator = () => {
    if (!section?.ai_params) return;
    const p = new URLSearchParams({
      ageBand: section.ai_params.ageBand || "U14",
      textbookSlug: section.ai_params.textbookSlug || section.slug,
    });
    if (section.ai_params.sessionCode) p.set("sessionCode", section.ai_params.sessionCode);
    navigate(`/ai-generator?${p.toString()}`);
  };

  return (
    <div className="uiPage textbookPage">
      <PageHero
        title="Учебник БФВ"
        subtitle="Официална методика — принципи, периодизация, техника и готови план-конспекти. Свързано с AI генератора."
        actions={
          <Button as={Link} to="/national-library" variant="secondary" size="sm">
            Годишна програма
          </Button>
        }
      />

      <div className="textbookToolbar">
        <input
          className="uiInput textbookSearch"
          type="search"
          placeholder="Търсене в учебника…"
          value={query}
          onChange={(e) => updateFilter("q", e.target.value)}
        />
        <select className="uiInput" value={ageFilter} onChange={(e) => updateFilter("age", e.target.value)}>
          {TEXTBOOK_AGE_FILTER_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? "Всички възрасти" : PLAN_BAND_LABELS[a] || a}
            </option>
          ))}
        </select>
        <select className="uiInput" value={partFilter} onChange={(e) => updateFilter("part", e.target.value)}>
          <option value="">Всички теми</option>
          {(index?.filters?.parts || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="uiInput" value={categoryFilter} onChange={(e) => updateFilter("category", e.target.value)}>
          <option value="">Всички категории</option>
          {(index?.filters?.categories || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mobilePageToolbar">
        <button type="button" className="mobilePageToolbarBtn mobilePageToolbarBtn--primary" onClick={() => setSidebarOpen(true)}>
          ≡ Съдържание
        </button>
      </div>

      <div className="methodHubLayout textbookLayout">
        <aside className="methodHubSidebar textbookSidebar mobileSidebarHost--desktopOnly">{renderSidebarNav()}</aside>

        <main className="methodHubMain textbookMain">
          {!activeSlug && !loadingIndex && (
            <EmptyState
              title="Изберете тема отляво"
              description={`${index?.section_count || 0} секции — теория, периодизация и ${Object.values(index?.session_plans_by_age || {}).flat().length} план-конспекта по възраст.`}
            />
          )}

          {activeSlug && loadingSection && <p className="methodHubMuted">Зареждане на секция…</p>}

          {section && !loadingSection && (
            <>
              <nav className="textbookBreadcrumb">
                <Link to="/textbook">Учебник</Link>
                {section.part_label && (
                  <>
                    <span>/</span>
                    <button type="button" onClick={() => updateFilter("part", section.part)}>
                      {section.part_label}
                    </button>
                  </>
                )}
              </nav>

              <header className="textbookMainHead">
                <h2>{section.title_bg}</h2>
                <SectionBadges section={section} />
                {section.summary_bg && <p className="methodHubMuted textbookSummary">{section.summary_bg}</p>}
              </header>

              {section.kind === "session_plan" && (
                <div className="textbookCtaBar">
                  <Button variant="primary" onClick={goToGenerator}>
                    Генерирай тази тренировка с AI
                  </Button>
                  <span className="uiMuted">Конспектът от учебника се подава на генератора като контекст.</span>
                </div>
              )}

              {section.kind === "session_plan" && section.annual_links?.length > 0 && (
                <div className="textbookAnnualLinks" role="navigation">
                  <span className="textbookAnnualLinks__label">В годишната програма:</span>
                  {section.annual_links.map((link) => (
                    <Link
                      key={`${link.age_band}-${link.meso_number}-${link.week}`}
                      className="textbookAnnualLinks__chip"
                      to={`/national-library?ageBand=${encodeURIComponent(link.age_band)}&meso=${link.meso_number}&week=${link.week}&day=1`}
                    >
                      Мезо {link.meso_number} · седмица {link.week}
                      {link.period_label ? ` (${link.period_label})` : ""}
                    </Link>
                  ))}
                </div>
              )}

              <SessionTimeline blocks={section.session_blocks} />

              <article className="textbookBody">
                {(section.paragraphs || []).map((para, i) => {
                  const isBullet = para.startsWith("* ") || para.startsWith("• ");
                  if (isBullet) {
                    return (
                      <li key={i} className="textbookBullet">
                        {para.replace(/^[*•]\s*/, "")}
                      </li>
                    );
                  }
                  if (/^\d+[\.)]\s/.test(para)) {
                    return (
                      <p key={i} className="textbookPara textbookPara--numbered">
                        {para}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="textbookPara">
                      {para}
                    </p>
                  );
                })}
              </article>

              {section.related?.length > 0 && (
                <section className="textbookRelated">
                  <h3 className="textbookSubhead">Свързани теми</h3>
                  <div className="textbookRelatedGrid">
                    {section.related.map((r) => (
                      <button
                        key={r.slug}
                        type="button"
                        className="textbookRelatedCard"
                        onClick={() => openSlug(r.slug)}
                      >
                        <span className="textbookRelatedCard__title">{titleCase(r.title_bg)}</span>
                        <span className="textbookRelatedCard__meta">
                          {r.category_label}
                          {r.age_band !== "all" ? ` · ${r.age_band}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <footer className="textbookPager">
                {section.prev_slug ? (
                  <button type="button" className="textbookPager__btn" onClick={() => openSlug(section.prev_slug)}>
                    ← {titleCase(section.prev_title)}
                  </button>
                ) : (
                  <span />
                )}
                {section.next_slug ? (
                  <button type="button" className="textbookPager__btn" onClick={() => openSlug(section.next_slug)}>
                    {titleCase(section.next_title)} →
                  </button>
                ) : (
                  <span />
                )}
              </footer>
            </>
          )}
        </main>
      </div>

      <MobileDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} title="Съдържание на учебника">
        <aside className="methodHubSidebar textbookSidebar methodHubSidebar--inline">{renderSidebarNav()}</aside>
      </MobileDrawer>
    </div>
  );
}
