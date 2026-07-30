import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import { formatDaysUntil } from "../../utils/parentPortalDates";
import { feesLookbackFromMonth } from "../../utils/coachDashboardStats";
import { teamColorsForId } from "../../utils/teamColors";
import { Button, EmptyState } from "../../components/ui";

const todayKey = () => new Date().toISOString().slice(0, 10);
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

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
  return (
    <article
      className="coachMobileCard coachMobileEventCard"
      style={{ borderLeft: `4px solid ${isComp ? "#f59e0b" : tc.border}` }}
    >
      <EventCardHeader item={item} isComp={isComp} />
      <p className="coachMobileEventDate">{formatDateBg(item.date)}</p>
      <p className="coachMobileMuted">
        {item.start_time} – {item.end_time}
        {item.location ? ` · ${item.location}` : ""}
      </p>
      {!isComp && programTheme?.theme ? (
        <p
          style={{
            margin: "2px 0 6px",
            fontWeight: 600,
            fontSize: 13,
            color: "#2563eb",
          }}
        >
          Тема: {programTheme.theme}
          {!programTheme.specific ? (
            <span className="coachMobileMuted" style={{ fontWeight: 400 }}> · седмична</span>
          ) : null}
        </p>
      ) : null}
      {!isComp && item.team_id ? (
        <Button type="button" size="sm" onClick={() => onAttendance(item)}>
          Присъствие
        </Button>
      ) : null}
    </article>
  );
}

function EventCardHeader({ item, isComp }) {
  const daysUntil = formatDaysUntil(item.date);
  return (
    <div className="coachMobileEventHead">
      <span className={`coachMobileChip coachMobileChip--${isComp ? "comp" : "train"}`}>
        {isComp ? competitionKindLabel(item) : "Тренировка"}
      </span>
      {daysUntil ? <span className="coachMobileChip coachMobileChip--soon">{daysUntil}</span> : null}
      {item.team_name ? (
        <TeamNameLabel teamId={item.team_id} teamName={item.team_name} isComp={isComp} />
      ) : null}
    </div>
  );
}

function formatShortDateBg(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

function TabBadge({ value, tone }) {
  if (!value) return null;
  return (
    <span className={`coachMobileDashTabBadge coachMobileDashTabBadge--${tone || "teal"}`}>
      {value}
    </span>
  );
}

export default function CoachToday() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [absenceNotices, setAbsenceNotices] = useState([]);
  const [programWeek, setProgramWeek] = useState(null);
  const [programThemes, setProgramThemes] = useState({});
  const [activeTab, setActiveTab] = useState("today");
  const [feesUnpaid, setFeesUnpaid] = useState(0);

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const myCoachId = Number(user?.id || 0);
  const today = todayKey();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const monthKey = currentMonthKey();
        const [scheduleRes, noticesRes, feesRes] = await Promise.all([
          axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
            params: {
              from: today,
              to,
              ...(!isHeadCoach && myCoachId ? { coach_id: myCoachId } : {}),
            },
          }),
          axiosInstance.get(API_PATHS.COACH_ABSENCE_NOTICES).catch(() => ({ data: [] })),
          axiosInstance
            .get(API_PATHS.FEES_PERIOD_REPORT, {
              params: { from_month: feesLookbackFromMonth(monthKey, 2), to_month: monthKey },
            })
            .catch(() => ({ data: null })),
        ]);
        const list = Array.isArray(scheduleRes.data?.items) ? scheduleRes.data.items : [];
        setItems(list);
        setAbsenceNotices(Array.isArray(noticesRes.data) ? noticesRes.data : []);
        const feesRows = Array.isArray(feesRes.data?.rows) ? feesRes.data.rows : [];
        const unpaid = feesRows.filter((row) => {
          const month = Array.isArray(row.months) ? row.months.find((m) => m?.month_key === monthKey) : null;
          return month ? !month.paid : false;
        }).length;
        setFeesUnpaid(unpaid);
      } catch (err) {
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Грешка при зареждане на графика.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isHeadCoach, myCoachId, today]);

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
    const sorted = [...items].sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      return String(a.start_time || "").localeCompare(String(b.start_time || ""));
    });
    return {
      todayItems: sorted.filter((i) => i.date === today),
      upcomingItems: sorted.filter((i) => i.date > today).slice(0, 5),
    };
  }, [items, today]);

  const greeting = user?.name || user?.email || "Треньор";
  const todayBadge = absenceNotices.length || null;
  const statsBadge = feesUnpaid || null;
  const programTc = programWeek?.team_id ? teamColorsForId(programWeek.team_id) : null;

  return (
    <div className="coachMobilePage">
      <p className="coachMobileGreeting">
        Здравей, <strong>{greeting}</strong>
      </p>
      <p className="coachMobileMuted coachMobileGreetingSub">{formatDateBg(today)}</p>

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
      {error ? <EmptyState title="Грешка" description={error} /> : null}

      {!loading && !error && activeTab === "today" ? (
        <>
          {absenceNotices.length > 0 ? (
            <section className="coachMobileAbsenceBox">
              <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">
                Предварителни извинения
                <span className="coachMobileAbsenceCount">{absenceNotices.length}</span>
              </h2>
              <ul className="coachMobileAbsenceList">
                {absenceNotices.map((notice) => (
                  <li key={notice.id} className="coachMobileAbsenceItem">
                    <div className="coachMobileAbsenceMain">
                      <strong>{notice.athlete_name}</strong>
                      <span className="coachMobileAbsenceDate">
                        ще липсва на {formatShortDateBg(notice.notice_date)}
                      </span>
                    </div>
                    {notice.team_name ? (
                      <TeamNameLabel teamId={notice.team_id} teamName={notice.team_name} />
                    ) : null}
                    {notice.note ? <p className="coachMobileAbsenceNote">{notice.note}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {programWeek ? (
            <Link
              to="/coach/program-week"
              className="coachMobileCard"
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                borderLeft: `4px solid ${programTc?.border || "#2563eb"}`,
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
                {programWeek.week_theme ? ` · ${programWeek.week_theme}` : programWeek.meso_theme ? ` · ${programWeek.meso_theme}` : ""}
              </p>
              <p className="coachMobileMuted" style={{ margin: 0 }}>
                Седмица {programWeek.week_in_meso} от {programWeek.weeks_per_meso} · виж програмата →
              </p>
            </Link>
          ) : null}

          <h2 className="coachMobileSectionTitle">Днес</h2>
          {todayItems.length === 0 ? (
            <p className="coachMobileMuted">Няма планирани събития за днес.</p>
          ) : (
            todayItems.map((item) => (
              <EventCard
                key={`${item.team_id}-${item.date}-${item.start_time}-${item.rule_id || item.competition_id}`}
                item={item}
                programTheme={programThemes[item.date]}
                onAttendance={() => navigate(attendancePath(item))}
              />
            ))
          )}

          {upcomingItems.length > 0 ? (
            <>
              <h2 className="coachMobileSectionTitle">Скоро</h2>
              {upcomingItems.map((item) => (
                <EventCard
                  key={`up-${item.team_id}-${item.date}-${item.start_time}`}
                  item={item}
                  programTheme={programThemes[item.date]}
                  onAttendance={() => navigate(attendancePath(item))}
                />
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/coach/schedule")}>
                Целият график
              </Button>
            </>
          ) : null}
        </>
      ) : null}

      {!loading && !error && activeTab === "content" ? (
        <>
          <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Съдържание</h2>
          <p className="coachMobileMuted" style={{ marginTop: 0, marginBottom: 10 }}>
            Тренировки, упражнения и статии.
          </p>
          <div className="coachMobileQuickGrid">
            <Link to="/coach/trainings" className="coachMobileQuickBtn">
              Моите тренировки
            </Link>
            <Link to="/my-drills" className="coachMobileQuickBtn">
              Упражнения
            </Link>
            <Link to="/articles/my" className="coachMobileQuickBtn">
              Моите статии
            </Link>
            <Link to="/ai-generator" className="coachMobileQuickBtn">
              AI генератор
            </Link>
            <Link to="/forum" className="coachMobileQuickBtn">
              Форум
            </Link>
            <Link to="/coach/program-week" className="coachMobileQuickBtn">
              Програмна седмица
            </Link>
          </div>
        </>
      ) : null}

      {!loading && !error && activeTab === "stats" ? (
        <>
          <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">Статистика</h2>
          <p className="coachMobileMuted" style={{ marginTop: 0, marginBottom: 10 }}>
            Такси, присъствие и преглед по отбори.
          </p>
          <div className="coachMobileQuickGrid">
            <Link to="/coach/fees" className="coachMobileQuickBtn">
              Месечни такси
              {feesUnpaid ? ` (${feesUnpaid})` : ""}
            </Link>
            <Link to="/coach/attendance" className="coachMobileQuickBtn">
              Присъствие
            </Link>
            <Link to="/coach/teams" className="coachMobileQuickBtn">
              Отбори
            </Link>
            <Link to="/coach/assessment" className="coachMobileQuickBtn">
              Диагностика
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
