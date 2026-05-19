import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ParentScheduleViews from "../components/parentPortal/ParentScheduleViews";
import TeamRoomBottomNav from "../components/teamRoom/TeamRoomBottomNav";
import TeamRoomFeed from "../components/teamRoom/TeamRoomFeed";
import TeamRoomLayout from "../components/teamRoom/TeamRoomLayout";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
import { formatDaysUntil } from "../utils/parentPortalDates";
import { clearTeamRoomToken, getTeamRoomToken, teamRoomLoginPath } from "../utils/teamRoomAuth";
import { Button, EmptyState } from "../components/ui";

const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

function formatMonthKey(mk) {
  if (!mk || !String(mk).includes("-")) return mk || "";
  const [y, m] = String(mk).split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return mk;
  return `${MONTHS_BG[mi]} ${y}`;
}

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

function NextEventChip({ item, label }) {
  if (!item) {
    return <p className="teamRoomMuted">{label}</p>;
  }
  const isComp = isCompetitionEvent(item);
  const daysUntil = formatDaysUntil(item.date);
  return (
    <div className="teamRoomNextEvent">
      <span className={`teamRoomTypeChip teamRoomTypeChip--${isComp ? "competition" : "training"}`}>
        {isComp ? competitionKindLabel(item) : "Тренировка"}
      </span>
      {daysUntil ? <span className="teamRoomDaysUntil">{daysUntil}</span> : null}
      <p className="teamRoomNextEventDate">{formatDateBg(item.date)}</p>
      <p className="teamRoomMuted">
        {item.start_time} – {item.end_time}
        {item.location ? ` · ${item.location}` : ""}
      </p>
    </div>
  );
}

function TabPanel({ id, activeTab, children }) {
  if (activeTab !== id) return null;
  return <section className="teamRoomTabPanel">{children}</section>;
}

export default function TeamRoomPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [feedSeenAt, setFeedSeenAt] = useState(() => localStorage.getItem("team_room_feed_seen_at") || "");

  const load = useCallback(async () => {
    if (!getTeamRoomToken()) {
      navigate(teamRoomLoginPath(), { replace: true });
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_ME);
      setData(res.data || null);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Сесията е изтекла. Влезте отново.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchScheduleMonth = useCallback(async (monthKey) => {
    const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_ME_SCHEDULE, { params: { month: monthKey } });
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const handleLogout = () => {
    clearTeamRoomToken();
    navigate(teamRoomLoginPath(), { replace: true });
  };

  const markFeedSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem("team_room_feed_seen_at", now);
    setFeedSeenAt(now);
  }, []);

  useEffect(() => {
    if (activeTab === "home" && data?.items?.length) {
      markFeedSeen();
    }
  }, [activeTab, data?.items?.length, markFeedSeen]);

  const badges = useMemo(() => {
    const items = data?.items || [];
    if (!items.length) return {};
    const latest = items[0]?.created_at;
    const homeUnread = latest && (!feedSeenAt || new Date(latest) > new Date(feedSeenAt));
    return {
      home: homeUnread,
      messages: true,
    };
  }, [data?.items, feedSeenAt]);

  const attendance = data?.attendance_summary;
  const teamLabel = (data?.teams || []).join(", ") || "—";

  const bottomNav = data ? (
    <TeamRoomBottomNav
      activeTab={activeTab}
      onChange={setActiveTab}
      badges={badges}
      avatarUrl={data.avatar_url || null}
    />
  ) : null;

  return (
    <TeamRoomLayout bottomNav={bottomNav}>
      <div className="teamRoomPage">
        {loading ? <p className="teamRoomMuted">Зареждане...</p> : null}
        {!loading && error ? (
          <EmptyState
            title="Достъпът е отказан"
            description={error}
            action={
              <Button type="button" onClick={() => navigate(teamRoomLoginPath())}>
                Към входа
              </Button>
            }
          />
        ) : null}

        {!loading && !error && data ? (
          <>
            <header className="teamRoomTopBar">
              <div>
                <h1 className="teamRoomTopTitle">{data.athlete_name}</h1>
                <p className="teamRoomTopSub">
                  {data.club_name ? `${data.club_name} · ` : ""}
                  {teamLabel}
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
                Изход
              </Button>
            </header>

            <TabPanel id="home" activeTab={activeTab}>
              <div className="teamRoomHomeGrid">
                <section className="teamRoomCard teamRoomCard--compact" aria-label="Следващи събития">
                  <h2 className="teamRoomCardTitle">Предстои</h2>
                  <NextEventChip item={data.next_training} label="Няма предстояща тренировка." />
                  <NextEventChip item={data.next_competition} label="Няма предстоящо състезание." />
                </section>
              </div>
              <h2 className="teamRoomSectionTitle">Новини</h2>
              <TeamRoomFeed items={data.items} />
            </TabPanel>

            <TabPanel id="schedule" activeTab={activeTab}>
              <h2 className="teamRoomSectionTitle">График — {formatMonthKey(data.schedule_month_key)}</h2>
              <ParentScheduleViews
                fetchScheduleMonth={fetchScheduleMonth}
                initialItems={data.monthly_schedule || []}
                scheduleMonthKey={data.schedule_month_key}
                formatMonthKey={formatMonthKey}
                initialWeekStart={data.week_start}
                showTeamLegend
                scheduleHint="Докоснете ден за детайли."
              />
            </TabPanel>

            <TabPanel id="messages" activeTab={activeTab}>
              <EmptyState
                title="Чатовете идват скоро"
                description="Общи канали и съобщения с треньора ще се появят в следваща версия."
              />
            </TabPanel>

            <TabPanel id="profile" activeTab={activeTab}>
              <section className="teamRoomCard">
                <h2 className="teamRoomCardTitle">Моят профил</h2>
                <dl className="teamRoomProfileDl">
                  <div>
                    <dt>Име</dt>
                    <dd>{data.athlete_name}</dd>
                  </div>
                  {data.birth_year ? (
                    <div>
                      <dt>Година на раждане</dt>
                      <dd>{data.birth_year}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Отбори</dt>
                    <dd>{teamLabel}</dd>
                  </div>
                </dl>
              </section>

              <section className="teamRoomCard">
                <h2 className="teamRoomCardTitle">Присъствие (90 дни)</h2>
                {(attendance?.total ?? 0) > 0 ? (
                  <div className="teamRoomStatRow">
                    <span className="teamRoomStatPill teamRoomStatPill--ok">{attendance.attendance_rate_percent}%</span>
                    <span className="teamRoomMuted">
                      Присъства: {attendance.present}
                      {attendance.late ? ` · Закъснения: ${attendance.late}` : ""}
                    </span>
                  </div>
                ) : (
                  <p className="teamRoomMuted">Още няма достатъчно записи.</p>
                )}
              </section>
            </TabPanel>
          </>
        ) : null}
      </div>
    </TeamRoomLayout>
  );
}
