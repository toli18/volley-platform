import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import {
  competitionRosterAction,
  competitionRosterPath,
} from "../../utils/competitionRosterPriority";
import { formatDaysUntil } from "../../utils/parentPortalDates";
import {
  EMPTY_DASHBOARD,
  currentMonthKey,
  loadCoachDashboardData,
  mergeDashboardData,
  readHeadStatsScope,
  writeHeadStatsScope,
} from "../../utils/loadCoachDashboardData";
import { teamColorsForId } from "../../utils/teamColors";
import { Button, EmptyState } from "../../components/ui";

const todayKey = () => new Date().toISOString().slice(0, 10);

function formatDateBg(iso) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("bg-BG", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("bg-BG");
}

function attendancePath(it) {
  const title = `${it.start_time}–${it.end_time} ${it.team_name || ""}`.trim();
  return `/teams/${it.team_id}/attendance?date=${encodeURIComponent(it.date)}&title=${encodeURIComponent(title)}`;
}

function TeamNameLabel({ teamId, teamName, isComp }) {
  if (!teamName && !isComp) return null;
  const tc = teamColorsForId(teamId);
  return (
    <span
      className="coachMobileTeamLabel"
      style={{
        color: isComp ? "#9a3412" : tc.text,
        borderLeftColor: isComp ? "#f59e0b" : tc.border,
      }}
    >
      {teamName}
    </span>
  );
}

function EventCard({ item, onAttendance, programTheme }) {
  const isComp = isCompetitionEvent(item);
  const tc = teamColorsForId(item.team_id);
  const rosterAction = isComp ? competitionRosterAction(item) : null;
  const priority = rosterAction === "generate" ? "danger" : rosterAction === "review" ? "warn" : null;
  return (
    <article
      className={`coachMobileCard coachMobileEventCard${priority ? ` coachMobileEventCard--${priority}` : ""}`}
      style={{ borderLeft: `4px solid ${isComp ? (priority === "danger" ? "#dc2626" : "#f59e0b") : tc.border}` }}
    >
      <EventCardHeader item={item} isComp={isComp} rosterAction={rosterAction} />
      <p className="coachMobileEventDate">{formatDateBg(item.date)}</p>
      <p className="coachMobileMuted">
        {item.start_time} – {item.end_time}
        {item.location ? ` · ${item.location}` : ""}
      </p>
      {!isComp && programTheme?.theme ? (
        <p style={{ margin: "2px 0 6px", fontWeight: 600, fontSize: 13, color: "#2563eb" }}>
          Тема: {programTheme.theme}
          {!programTheme.specific ? (
            <span className="coachMobileMuted" style={{ fontWeight: 400 }}> · седмична</span>
          ) : null}
        </p>
      ) : null}
      {isComp && rosterAction === "generate" ? (
        <p className="coachMobileRosterHint coachMobileRosterHint--danger">Няма тимов лист — генерирай до мача.</p>
      ) : null}
      {isComp && rosterAction === "review" ? (
        <p className="coachMobileRosterHint coachMobileRosterHint--warn">
          Провери тимовия лист
          {item.roster_count != null ? ` (${item.roster_count})` : ""}.
        </p>
      ) : null}
      {!isComp && item.team_id ? (
        <Button type="button" size="sm" onClick={() => onAttendance(item)}>
          Присъствие
        </Button>
      ) : null}
      {isComp && item.competition_id ? (
        <Button
          type="button"
          size="sm"
          variant={rosterAction === "generate" ? undefined : "secondary"}
          onClick={() => onAttendance(item)}
        >
          {rosterAction === "generate"
            ? "Генерирай тимов лист"
            : rosterAction === "review"
              ? "Провери тимовия лист"
              : "Тимов лист"}
        </Button>
      ) : null}
    </article>
  );
}

function EventCardHeader({ item, isComp, rosterAction }) {
  const daysUntil = formatDaysUntil(item.date);
  return (
    <div className="coachMobileEventHead">
      <span className={`coachMobileChip coachMobileChip--${isComp ? "comp" : "train"}`}>
        {isComp ? competitionKindLabel(item) : "Тренировка"}
      </span>
      {daysUntil ? <span className="coachMobileChip coachMobileChip--soon">{daysUntil}</span> : null}
      {rosterAction === "generate" ? (
        <span className="coachMobileChip coachMobileChip--danger">Тимов лист</span>
      ) : null}
      {rosterAction === "review" ? (
        <span className="coachMobileChip coachMobileChip--warn">Провери състава</span>
      ) : null}
      {item.team_name ? (
        <TeamNameLabel teamId={item.team_id} teamName={item.team_name} isComp={isComp} />
      ) : null}
    </div>
  );
}

function TabBadge({ value, tone }) {
  if (!value) return null;
  return (
    <span className={`coachMobileDashTabBadge coachMobileDashTabBadge--${tone || "teal"}`}>
      {value}
    </span>
  );
}

function formatShortDateBg(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

function SectionCard({ title, actions, children }) {
  return (
    <section className="coachMobileCard" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <h2 className="coachMobileSectionTitle" style={{ margin: 0, fontSize: 15 }}>{title}</h2>
        {actions || null}
      </div>
      {children}
    </section>
  );
}

function ListLink({ to, title, meta, warn }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        marginBottom: 8,
        border: `1px solid ${warn ? "#fcd34d" : "#e2e8f0"}`,
        borderRadius: 10,
        padding: 10,
        background: warn ? "#fffbeb" : "#fff",
      }}
    >
      <div style={{ fontWeight: 700, color: warn ? "#92400e" : undefined }}>{title}</div>
      {meta ? <div className="coachMobileMuted" style={{ marginTop: 4, fontSize: 12 }}>{meta}</div> : null}
    </Link>
  );
}

export default function CoachToday() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("today");
  const [headTeamScope, setHeadTeamScope] = useState("all");
  const [programWeek, setProgramWeek] = useState(null);
  const [programThemes, setProgramThemes] = useState({});
  const [loadedSections, setLoadedSections] = useState({});
  const [dash, setDash] = useState(() => ({ ...EMPTY_DASHBOARD, monthKey: currentMonthKey() }));

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const today = todayKey();

  useEffect(() => {
    if (!user?.id || !isHeadCoach) return;
    setHeadTeamScope(readHeadStatsScope(user.id));
  }, [user?.id, isHeadCoach]);

  const onHeadTeamScopeChange = (scope) => {
    setHeadTeamScope(scope);
    if (user?.id) writeHeadStatsScope(user.id, scope);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setLoadedSections((prev) => (prev.content ? { content: true } : {}));
        const data = await loadCoachDashboardData({
          userId: user?.id,
          isHeadCoach,
          headTeamScope,
          sections: ["today"],
        });
        if (!active) return;
        setDash((prev) => {
          const base = {
            ...EMPTY_DASHBOARD,
            monthKey: currentMonthKey(),
            forumItems: prev.forumItems,
            articleItems: prev.articleItems,
            lastTrainings: prev.lastTrainings,
            topDrills: prev.topDrills,
            draftCount: prev.draftCount,
            returnedArticles: prev.returnedArticles,
            monthlyStats: prev.monthlyStats,
          };
          return mergeDashboardData(base, data);
        });
        setLoadedSections((prev) => ({
          today: true,
          ...(prev.content ? { content: true } : {}),
        }));
      } catch (err) {
        const detail = err?.response?.data?.detail;
        if (active) setError(typeof detail === "string" ? detail : "Грешка при зареждане на таблото.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.id, isHeadCoach, headTeamScope]);

  useEffect(() => {
    if (activeTab === "today" || loadedSections[activeTab] || loading) return undefined;
    let active = true;
    const load = async () => {
      try {
        setTabLoading(true);
        setError("");
        const data = await loadCoachDashboardData({
          userId: user?.id,
          isHeadCoach,
          headTeamScope,
          sections: [activeTab],
          includeTrainingStats: !loadedSections.content,
        });
        if (!active) return;
        setDash((prev) => mergeDashboardData(prev, data));
        setLoadedSections((prev) => ({ ...prev, [activeTab]: true }));
      } catch (err) {
        const detail = err?.response?.data?.detail;
        if (active) setError(typeof detail === "string" ? detail : "Грешка при зареждане на раздела.");
      } finally {
        if (active) setTabLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [activeTab, loadedSections, loading, user?.id, isHeadCoach, headTeamScope]);

  useEffect(() => {
    let active = true;
    const fetchWeek = (off) =>
      axiosInstance
        .get(API_PATHS.NATIONAL_METHOD_PROGRAM_WEEK, { params: { week_offset: off } })
        .then((res) => res.data)
        .catch(() => null);
    Promise.all([fetchWeek(0), fetchWeek(1)]).then(([w0, w1]) => {
      if (!active) return;
      if (w0?.has_program) setProgramWeek(w0);
      const map = {};
      [w0, w1].forEach((w) => {
        if (!w || !w.has_program) return;
        const weekTheme = w.week_theme || w.meso_theme || "";
        (w.days || []).forEach((d) => {
          if (!d?.date) return;
          const specific = d.has_program_day ? d.theme : "";
          map[d.date] = { theme: specific || weekTheme, specific: Boolean(specific) };
        });
      });
      setProgramThemes(map);
    });
    return () => {
      active = false;
    };
  }, []);

  const { todayItems, upcomingItems } = useMemo(() => {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 6);
    const horizonKey = horizon.toISOString().slice(0, 10);
    const sorted = [...(dash.scheduleItems || [])].sort((a, b) => {
      const aPri = competitionRosterAction(a) === "generate" ? 0 : competitionRosterAction(a) === "review" ? 1 : 2;
      const bPri = competitionRosterAction(b) === "generate" ? 0 : competitionRosterAction(b) === "review" ? 1 : 2;
      if (aPri !== bPri && a.date === b.date) return aPri - bPri;
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      if (aPri !== bPri) return aPri - bPri;
      return String(a.start_time || "").localeCompare(String(b.start_time || ""));
    });
    return {
      todayItems: sorted.filter((i) => i.date === today),
      upcomingItems: sorted.filter((i) => i.date > today && i.date <= horizonKey).slice(0, 8),
    };
  }, [dash.scheduleItems, today]);

  const rosterAlerts = dash.rosterAlerts || [];
  const greeting = user?.name || user?.email || "Треньор";
  const todayBadge = (dash.activityItems.length || 0) || null;
  const monthlyFeesEnabled = user?.monthly_fees_enabled !== false;
  const statsBadge = monthlyFeesEnabled ? dash.feesSummary.unpaid || null : null;
  const programTc = programWeek?.team_id ? teamColorsForId(programWeek.team_id) : null;
  const trainingsHref = "/coach/trainings";
  const absenceNotices = dash.absenceNotices || [];
  const nonAbsenceActivity = (dash.activityItems || []).filter(
    (item) => item.kind !== "absence" && item.kind !== "roster_generate" && item.kind !== "roster_review",
  );

  const openScheduleItem = (item) => {
    if (isCompetitionEvent(item) && item.competition_id) {
      navigate(competitionRosterPath(item.competition_id));
      return;
    }
    navigate(attendancePath(item));
  };

  return (
    <div className="coachMobilePage">
      <p className="coachMobileGreeting">
        Здравей, <strong>{greeting}</strong>
      </p>
      <p className="coachMobileMuted coachMobileGreetingSub">{formatDateBg(today)}</p>

      {!loading && absenceNotices.length > 0 ? (
        <section className="coachMobileAbsenceBox coachMobileAbsenceBox--compact" aria-label="Извинения от родители">
          <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush coachMobileAbsenceTitle">
            Извинения
            <span className="coachMobileAbsenceCount">{absenceNotices.length}</span>
          </h2>
          <ul className="coachMobileAbsenceList">
            {absenceNotices.map((notice) => {
              const to = notice.team_id
                ? `/teams/${notice.team_id}/attendance?date=${encodeURIComponent(notice.notice_date)}`
                : "/coach/teams";
              return (
                <li key={notice.id} className="coachMobileAbsenceItem">
                  <Link to={to} className="coachMobileAbsenceLink">
                    <strong>{notice.athlete_name}</strong>
                    <span className="coachMobileAbsenceDate">
                      {" "}
                      липсва{" "}
                      {notice.end_date && notice.end_date !== notice.notice_date
                        ? `${formatShortDateBg(notice.notice_date)} – ${formatShortDateBg(notice.end_date)}`
                        : `на ${formatShortDateBg(notice.notice_date)}`}
                    </span>
                    {notice.team_name ? (
                      <span className="coachMobileMuted"> · {notice.team_name}</span>
                    ) : null}
                    {notice.note ? (
                      <span className="coachMobileAbsenceNoteInline"> ({notice.note})</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!loading && rosterAlerts.length > 0 ? (
        <section className="coachMobileAbsenceBox coachMobileRosterBox" aria-label="Тимов лист за състезания">
          <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush coachMobileAbsenceTitle">
            Състезания — действие
            <span className="coachMobileAbsenceCount">{rosterAlerts.length}</span>
          </h2>
          <ul className="coachMobileAbsenceList">
            {rosterAlerts.map((alert) => (
              <li
                key={alert.id}
                className={`coachMobileAbsenceItem${alert.tone === "danger" ? " coachMobileRosterItem--danger" : " coachMobileRosterItem--warn"}`}
              >
                <Link to={alert.to} className="coachMobileAbsenceLink">
                  <strong>{alert.text}</strong>
                  {alert.meta ? <span className="coachMobileMuted"> · {alert.meta}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="coachMobileDashTabs" role="tablist" aria-label="Раздели на таблото">
        {[
          { id: "today", label: "Днес", badge: todayBadge, tone: "teal" },
          { id: "content", label: "Съдържание", badge: null, tone: "teal" },
          { id: "stats", label: "Статистика", badge: statsBadge, tone: "red" },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`coachMobileDashTab${active ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <TabBadge value={tab.badge} tone={tab.tone} />
            </button>
          );
        })}
      </div>

      {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
      {!loading && tabLoading ? <p className="coachMobileMuted">Зареждане на раздела...</p> : null}
      {error ? <EmptyState title="Грешка" description={error} /> : null}

      {!loading && !error && !tabLoading && activeTab === "today" ? (
        <>
          {programWeek ? (
            <Link
              to="/coach/program-week"
              className="coachMobileCard"
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                borderLeft: `4px solid ${programTc?.border || "#2563eb"}`,
                marginBottom: 10,
              }}
            >
              <div className="coachMobileEventHead">
                <span className="coachMobileChip coachMobileChip--train">Програмна седмица</span>
                {programWeek.team_name ? (
                  <TeamNameLabel teamId={programWeek.team_id} teamName={programWeek.team_name} />
                ) : null}
              </div>
              <p style={{ margin: "4px 0 2px", fontWeight: 600 }}>
                Мезо {programWeek.meso_index}/{programWeek.total_mesos}
                {programWeek.week_theme
                  ? ` · ${programWeek.week_theme}`
                  : programWeek.meso_theme
                    ? ` · ${programWeek.meso_theme}`
                    : ""}
              </p>
              <p className="coachMobileMuted" style={{ margin: 0 }}>
                Седмица {programWeek.week_in_meso} от {programWeek.weeks_per_meso} · виж програмата →
              </p>
            </Link>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <h2 className="coachMobileSectionTitle" style={{ margin: 0 }}>График за следващите 7 дни</h2>
            <Link to="/coach/schedule" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
              Пълен график
            </Link>
          </div>
          {todayItems.length === 0 && upcomingItems.length === 0 ? (
            <p className="coachMobileMuted">Няма планирани събития.</p>
          ) : (
            <>
              {todayItems.map((item) => (
                <EventCard
                  key={`${item.team_id}-${item.date}-${item.start_time}-${item.rule_id || item.competition_id}`}
                  item={item}
                  programTheme={programThemes[item.date]}
                  onAttendance={() => openScheduleItem(item)}
                />
              ))}
              {upcomingItems.map((item) => (
                <EventCard
                  key={`up-${item.team_id}-${item.date}-${item.start_time}-${item.competition_id || item.rule_id}`}
                  item={item}
                  programTheme={programThemes[item.date]}
                  onAttendance={() => openScheduleItem(item)}
                />
              ))}
            </>
          )}

          <SectionCard
            title="Последни известия"
            actions={
              <Link to="/forum" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Форум
              </Link>
            }
          >
            {nonAbsenceActivity.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Няма нови известия.</p>
            ) : (
              nonAbsenceActivity.map((item) => (
                <ListLink
                  key={item.id}
                  to={item.to}
                  title={item.text}
                  meta={formatDateTime(item.at)}
                />
              ))
            )}
          </SectionCard>
        </>
      ) : null}

      {!loading && !error && !tabLoading && activeTab === "content" ? (
        <>
          <SectionCard
            title="Твоите последни 5 тренировки"
            actions={
              <Link to={trainingsHref} className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Към тренировките
              </Link>
            }
          >
            {dash.lastTrainings.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Още няма тренировки.</p>
            ) : (
              dash.lastTrainings.map((t) => (
                <ListLink
                  key={t.id}
                  to={`/trainings/${t.id}`}
                  title={t.title || `Тренировка #${t.id}`}
                  meta={`${formatDateTime(t.created_at)} • ${String(t.status || "—")}`}
                />
              ))
            )}
          </SectionCard>

          <SectionCard
            title="Най-често използвани упражнения"
            actions={
              <Link to="/my-drills" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Към упражненията
              </Link>
            }
          >
            {dash.topDrills.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Все още няма статистика.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {dash.topDrills.map((d, idx) => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>
                      {idx + 1}. {d.title}
                    </span>
                    <span className="uiBadge">{d.count} пъти</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Чернови и върнати статии"
            actions={
              <Link to="/articles/my" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Към моите статии
              </Link>
            }
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <span className="uiBadge">Неприключени чернови: {dash.draftCount}</span>
              <span className="uiBadge uiBadge--danger">Върнати статии: {dash.returnedArticles.length}</span>
            </div>
            {dash.returnedArticles.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Няма върнати статии за редакция.</p>
            ) : (
              dash.returnedArticles.map((a) => (
                <ListLink
                  key={a.id}
                  to={`/articles/${a.id}/edit`}
                  title={a.title || `Статия #${a.id}`}
                  meta={`Обновена: ${formatDateTime(a.updated_at || a.created_at)}`}
                  warn
                />
              ))
            )}
          </SectionCard>

          <SectionCard
            title="Последни теми във форума"
            actions={
              <Link to="/forum" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Към форума
              </Link>
            }
          >
            {dash.forumItems.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Още няма теми.</p>
            ) : (
              dash.forumItems.map((post) => (
                <ListLink
                  key={post.id}
                  to={`/forum/${post.id}`}
                  title={`${post.is_pinned ? "📌 " : ""}${post.title}${post.is_locked ? " 🔒" : ""}`}
                  meta={`Отговори: ${post.replies_count || 0} • Активност: ${formatDateTime(post.last_activity_at || post.created_at)}`}
                />
              ))
            )}
          </SectionCard>

          <SectionCard
            title="Последни статии"
            actions={
              <Link to="/articles" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Към статиите
              </Link>
            }
          >
            {dash.articleItems.length === 0 ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Още няма публикувани статии.</p>
            ) : (
              dash.articleItems.map((article) => (
                <ListLink
                  key={article.id}
                  to={`/articles/${article.id}`}
                  title={article.title || `Статия #${article.id}`}
                  meta={`Публикувана: ${formatDateTime(article.created_at)} • Автор: ${article.author_name || `Потребител #${article.author_id}`}`}
                />
              ))
            )}
          </SectionCard>
        </>
      ) : null}

      {!loading && !error && !tabLoading && activeTab === "stats" ? (
        <>
          {isHeadCoach ? (
            <SectionCard title="Обхват на статистиката">
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#475569" }}>Отбори</span>
                <select
                  value={headTeamScope}
                  onChange={(e) => onHeadTeamScopeChange(e.target.value === "mine" ? "mine" : "all")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    fontWeight: 600,
                    background: "#fff",
                  }}
                >
                  <option value="all">Всички отбори в клуба</option>
                  <option value="mine">Само моите отбори</option>
                </select>
              </label>
              <p className="coachMobileMuted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
                Настройката се запазва на това устройство и важи за присъствие и такси в този раздел.
              </p>
            </SectionCard>
          ) : null}

          <SectionCard title="Малка статистика за месеца">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="uiBadge">Създадени тренировки: {dash.monthlyStats.trainingsCreated}</span>
              <span className="uiBadge uiBadge--success">Използвани упражнения: {dash.monthlyStats.drillsUsed}</span>
            </div>
          </SectionCard>

          <SectionCard title={`Присъствие — последни ${dash.attendanceRank.sessionLimit || 10} тренировки`}>
            {!dash.attendanceRank.top?.length && !dash.attendanceRank.bottom?.length ? (
              <p className="coachMobileMuted" style={{ margin: 0 }}>Няма данни за присъствие.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: "#166534" }}>Топ 3 най-редовни</div>
                  {dash.attendanceRank.top.length === 0 ? (
                    <p className="coachMobileMuted" style={{ margin: 0 }}>Няма данни</p>
                  ) : (
                    <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                      {dash.attendanceRank.top.map((a) => (
                        <li key={`top-${a.athlete_id}`}>
                          <strong>{a.athlete_name}</strong>{" "}
                          <span className="uiBadge uiBadge--success">{a.label}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: "#9f1239" }}>Топ 3 най-нередовни</div>
                  {dash.attendanceRank.bottom.length === 0 ? (
                    <p className="coachMobileMuted" style={{ margin: 0 }}>Няма данни</p>
                  ) : (
                    <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                      {dash.attendanceRank.bottom.map((a) => (
                        <li key={`bot-${a.athlete_id}`}>
                          <strong>{a.athlete_name}</strong>{" "}
                          <span className="uiBadge uiBadge--danger">{a.label}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
            <p className="coachMobileMuted" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              Брои се присъства + закъснял спрямо последните {dash.attendanceRank.sessionLimit || 10} тренировки
              {isHeadCoach ? (headTeamScope === "mine" ? " (моите отбори)" : " (всички отбори)") : ""}.
            </p>
          </SectionCard>

          {monthlyFeesEnabled ? (
            <>
          <SectionCard
            title={`Дължими такси (${dash.monthKey})`}
            actions={
              <Link to="/coach/fees" className="coachMobileQuickBtn" style={{ padding: "4px 10px", fontSize: 12 }}>
                Отвори Месечни Такси
              </Link>
            }
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="uiBadge">
                Общо: <strong>{dash.feesSummary.total}</strong>
              </span>
              <span className="uiBadge uiBadge--success">
                Платили: <strong>{dash.feesSummary.paid}</strong>
              </span>
              <span className="uiBadge uiBadge--danger">
                Дължат: <strong>{dash.feesSummary.unpaid}</strong>
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Закъснели плащания">
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Закъснели с повече от 10 дни (този месец)</div>
                {dash.feeOverdue.late10.length === 0 ? (
                  <p className="coachMobileMuted" style={{ margin: 0 }}>Няма</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                    {dash.feeOverdue.late10.map((a) => (
                      <li key={`l10-${a.athlete_id}`}>
                        <strong>{a.athlete_name}</strong>{" "}
                        <span className="uiBadge uiBadge--warning">{a.days_overdue} дни</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Над 2 неплатени такси (последни 3 месеца)</div>
                {dash.feeOverdue.overTwo.length === 0 ? (
                  <p className="coachMobileMuted" style={{ margin: 0 }}>Няма</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                    {dash.feeOverdue.overTwo.map((a) => (
                      <li key={`o2-${a.athlete_id}`}>
                        <strong>{a.athlete_name}</strong>{" "}
                        <span className="uiBadge uiBadge--danger">{a.unpaid_months} такси</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="coachMobileMuted" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              Падеж: 10-о число на месеца. „Над 10 дни“ е само за текущия месец; „над 2 такси“ — последните 3 месеца
              {isHeadCoach ? (headTeamScope === "mine" ? " · моите отбори" : " · всички отбори") : ""}.
            </p>
          </SectionCard>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
