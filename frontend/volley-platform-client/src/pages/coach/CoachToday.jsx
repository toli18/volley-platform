import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import { formatDaysUntil } from "../../utils/parentPortalDates";
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

function attendancePath(it) {
  const title = `${it.start_time}–${it.end_time} ${it.team_name || ""}`.trim();
  return `/teams/${it.team_id}/attendance?date=${encodeURIComponent(it.date)}&title=${encodeURIComponent(title)}`;
}

function EventCard({ item, onAttendance }) {
  const isComp = isCompetitionEvent(item);
  return (
    <article className="coachMobileCard coachMobileEventCard">
      <EventCardHeader item={item} isComp={isComp} />
      <p className="coachMobileEventDate">{formatDateBg(item.date)}</p>
      <p className="coachMobileMuted">
        {item.start_time} – {item.end_time}
        {item.location ? ` · ${item.location}` : ""}
      </p>
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
      {item.team_name ? <span className="coachMobileMuted">{item.team_name}</span> : null}
    </div>
  );
}

function formatShortDateBg(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

export default function CoachToday() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [absenceNotices, setAbsenceNotices] = useState([]);
  const [programWeek, setProgramWeek] = useState(null);

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
        const [scheduleRes, noticesRes] = await Promise.all([
          axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
            params: {
              from: today,
              to,
              ...(!isHeadCoach && myCoachId ? { coach_id: myCoachId } : {}),
            },
          }),
          axiosInstance.get(API_PATHS.COACH_ABSENCE_NOTICES).catch(() => ({ data: [] })),
        ]);
        const list = Array.isArray(scheduleRes.data?.items) ? scheduleRes.data.items : [];
        setItems(list);
        setAbsenceNotices(Array.isArray(noticesRes.data) ? noticesRes.data : []);
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
    axiosInstance
      .get(API_PATHS.NATIONAL_METHOD_PROGRAM_WEEK, { params: { week_offset: 0 } })
      .then((res) => {
        if (active && res.data?.has_program) setProgramWeek(res.data);
      })
      .catch(() => {});
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

  return (
    <div className="coachMobilePage">
      <p className="coachMobileGreeting">
        Здравей, <strong>{greeting}</strong>
      </p>
      <p className="coachMobileMuted coachMobileGreetingSub">{formatDateBg(today)}</p>

      {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
      {error ? <EmptyState title="Грешка" description={error} /> : null}

      {!loading && !error ? (
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
                      <span className="coachMobileMuted">{notice.team_name}</span>
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
              style={{ display: "block", textDecoration: "none", color: "inherit", borderLeft: "4px solid #2563eb" }}
            >
              <div className="coachMobileEventHead">
                <span className="coachMobileChip coachMobileChip--train">Програмна седмица</span>
                {programWeek.team_name ? (
                  <span className="coachMobileMuted">{programWeek.team_name}</span>
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
              <EventCard key={`${item.team_id}-${item.date}-${item.start_time}-${item.rule_id || item.competition_id}`} item={item} onAttendance={() => navigate(attendancePath(item))} />
            ))
          )}

          {upcomingItems.length > 0 ? (
            <>
              <h2 className="coachMobileSectionTitle">Скоро</h2>
              {upcomingItems.map((item) => (
                <EventCard
                  key={`up-${item.team_id}-${item.date}-${item.start_time}`}
                  item={item}
                  onAttendance={() => navigate(attendancePath(item))}
                />
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/coach/schedule")}>
                Целият график
              </Button>
            </>
          ) : null}

          <h2 className="coachMobileSectionTitle">Още</h2>
          <p className="coachMobileMuted" style={{ marginTop: 0, marginBottom: 10 }}>
            Отбори и график са в долната лента.
          </p>
          <div className="coachMobileQuickGrid">
            <Link to="/coach/trainings" className="coachMobileQuickBtn">
              Моите тренировки
            </Link>
            <Link to="/coach/fees" className="coachMobileQuickBtn">
              Такси
            </Link>
            <Link to="/coach/attendance" className="coachMobileQuickBtn">
              Присъствие
            </Link>
            <Link to="/ai-generator" className="coachMobileQuickBtn">
              AI генератор
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
