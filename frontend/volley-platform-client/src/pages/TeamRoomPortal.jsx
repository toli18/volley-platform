import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ParentScheduleViews from "../components/parentPortal/ParentScheduleViews";
import ParentDevelopmentSection from "../components/parentPortal/ParentDevelopmentSection";
import TeamRoomBottomNav from "../components/teamRoom/TeamRoomBottomNav";
import TeamRoomFeeStatus from "../components/teamRoom/TeamRoomFeeStatus";
import TeamRoomChat from "../components/teamRoom/TeamRoomChat";
import TeamRoomHomeAlerts from "../components/teamRoom/TeamRoomHomeAlerts";
import AthleteMembershipChips from "../components/athletes/AthleteMembershipChips";
import TeamRoomFeed from "../components/teamRoom/TeamRoomFeed";
import TeamRoomLayout from "../components/teamRoom/TeamRoomLayout";
import TeamRoomPushPrompt from "../components/teamRoom/TeamRoomPushPrompt";
import LoginIntro from "../components/auth/LoginIntro";
import useAthletePhoto from "../hooks/useAthletePhoto";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
import { formatDaysUntil } from "../utils/parentPortalDates";
import {
  ackAthleteRoomChange,
  patchProfileAfterScheduleAck,
} from "../utils/teamRoomAck";
import { consumeSwRefreshSearchParam, listenTeamRoomRefresh } from "../utils/teamRoomPortalRefresh";
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

function relativeUntilLabel(item) {
  if (!item?.date) return null;
  const base = formatDaysUntil(item.date);
  if (!base) return null;
  if (base === "Днес" && item.start_time) {
    return `Днес в ${item.start_time}`;
  }
  return base;
}

function NextEventChip({ item, label, onAckChange }) {
  if (!item) {
    return <p className="teamRoomMuted teamRoomNextEventEmpty">{label}</p>;
  }
  const isComp = isCompetitionEvent(item);
  const daysUntil = relativeUntilLabel(item);
  const changeClass = item.highlight_change ? " teamRoomNextEvent--change" : "";
  const handleAck = () => {
    if (!item.highlight_change || !onAckChange) return;
    onAckChange({ markerKey: item.change_marker_key || null, date: item.date });
  };
  return (
    <div
      role={item.highlight_change ? "button" : undefined}
      tabIndex={item.highlight_change ? 0 : undefined}
      onClick={item.highlight_change ? handleAck : undefined}
      onKeyDown={
        item.highlight_change
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleAck();
              }
            }
          : undefined
      }
      className={`teamRoomNextEvent teamRoomNextEvent--hero${
        isComp ? " teamRoomNextEvent--competition" : " teamRoomNextEvent--training"
      }${changeClass}`}
    >
      <div className="teamRoomNextEventTop">
        <span className={`teamRoomTypeChip teamRoomTypeChip--${isComp ? "competition" : "training"}`}>
          {isComp ? competitionKindLabel(item) : "Тренировка"}
        </span>
        {daysUntil ? <span className="teamRoomDaysUntil">{daysUntil}</span> : null}
      </div>
      <p className="teamRoomNextEventDate">{formatDateBg(item.date)}</p>
      <p className="teamRoomNextEventMeta">
        {item.start_time} – {item.end_time}
        {item.location ? ` · ${item.location}` : ""}
      </p>
    </div>
  );
}

function attendanceCheer(rate) {
  const r = Number(rate) || 0;
  if (r >= 90) return "Супер!";
  if (r >= 75) return "Добра серия!";
  if (r >= 50) return "Продължавай така!";
  return null;
}

function AttendancePositiveBlock({ attendance }) {
  if (!(attendance?.total > 0)) {
    return <p className="teamRoomMuted">Още няма достатъчно записи.</p>;
  }
  const presentCount = Number(attendance.present || 0) + Number(attendance.late || 0);
  const cheer = attendanceCheer(attendance.attendance_rate_percent);
  return (
    <div className="teamRoomAttendPositive">
      <div className="teamRoomStatRow">
        <span className="teamRoomStatPill teamRoomStatPill--ok">{attendance.attendance_rate_percent}%</span>
        <span className="teamRoomAttendMain">
          <strong>
            {presentCount} {presentCount === 1 ? "тренировка" : "тренировки"}
          </strong>
          {cheer ? <span className="teamRoomAttendCheer"> · {cheer}</span> : null}
        </span>
      </div>
    </div>
  );
}

function TabPanel({ id, activeTab, children }) {
  if (activeTab !== id) return null;
  return <section className="teamRoomTabPanel">{children}</section>;
}

export default function TeamRoomPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [feedSeenAt, setFeedSeenAt] = useState(() => localStorage.getItem("team_room_feed_seen_at") || "");
  const [liveChatUnread, setLiveChatUnread] = useState(null);
  const [pendingChatTeamId, setPendingChatTeamId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!getTeamRoomToken()) {
      navigate(teamRoomLoginPath(), { replace: true });
      return;
    }
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_ME);
      setData(res.data || null);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Сесията е изтекла. Влезте отново.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return listenTeamRoomRefresh(() => load({ silent: true }));
  }, [load]);

  useEffect(() => {
    const nextSearch = consumeSwRefreshSearchParam(location.search, () => load({ silent: true }));
    if (nextSearch === null) return;
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
  }, [location.search, location.pathname, load, navigate]);

  const fetchScheduleMonth = useCallback(async (monthKey) => {
    const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_ME_SCHEDULE, { params: { month: monthKey } });
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const handleAckScheduleChange = useCallback(async (payload) => {
    try {
      await ackAthleteRoomChange(payload);
    } catch {
      /* ignore */
    }
    setData((prev) => patchProfileAfterScheduleAck(prev, payload));
  }, []);

  const markFeedSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem("team_room_feed_seen_at", now);
    setFeedSeenAt(now);
  }, []);

  const handleOpenHomeNotification = useCallback(
    async (notification) => {
      if (!notification) return;
      const isScheduleDigest = notification.change_type === "schedule_digest";
      try {
        if (notification.change_type === "fee_paid") {
          await ackAthleteRoomChange({ scope: "fee" });
        } else if (isScheduleDigest) {
          await ackAthleteRoomChange({ scope: "schedule" });
        } else {
          await ackAthleteRoomChange({ markerKey: notification.marker_key });
        }
      } catch {
        /* ignore */
      }

      setData((prev) => {
        if (!prev) return prev;
        let next = {
          ...prev,
          home_notifications: (prev.home_notifications || []).filter((n) => {
            if (isScheduleDigest) {
              const t = String(n.change_type || "");
              return !t.includes("training") && !t.includes("competition") && t !== "schedule_digest";
            }
            return n.marker_key !== notification.marker_key;
          }),
        };
        if (notification.change_type === "fee_paid") {
          next = { ...next, fee_change_highlight: false };
        }
        if (notification.target_tab === "schedule") {
          next = patchProfileAfterScheduleAck(next, isScheduleDigest
            ? { scope: "schedule" }
            : {
                markerKey: notification.marker_key,
                date: notification.date_iso,
              });
        }
        return next;
      });

      if (notification.target_tab === "messages" && notification.team_id) {
        setPendingChatTeamId(notification.team_id);
      }
      if (notification.change_type === "feed_post") {
        markFeedSeen();
      }
      setActiveTab(notification.target_tab || "home");
    },
    [markFeedSeen],
  );

  const handleAckFeeHighlight = useCallback(async () => {
    if (!data?.fee_change_highlight) return;
    try {
      await ackAthleteRoomChange({ scope: "fee" });
    } catch {
      /* ignore */
    }
    setData((prev) => (prev ? { ...prev, fee_change_highlight: false } : prev));
  }, [data?.fee_change_highlight]);

  const handleLogout = () => {
    clearTeamRoomToken();
    navigate(teamRoomLoginPath(), { replace: true });
  };

  useEffect(() => {
    if (activeTab !== "messages") {
      setLiveChatUnread(null);
    }
  }, [activeTab]);

  const highlightDates = useMemo(
    () => new Set(data?.pending_schedule_dates || []),
    [data?.pending_schedule_dates],
  );

  const hasUnreadChanges = useMemo(() => {
    if (!data) return false;
    if (data.fee_change_highlight) return true;
    if ((data.pending_schedule_dates?.length ?? 0) > 0) return true;
    if (data.monthly_schedule?.some((i) => i.highlight_change)) return true;
    if (data.next_training?.highlight_change || data.next_competition?.highlight_change) return true;
    return false;
  }, [data]);

  const badges = useMemo(() => {
    const items = data?.items || [];
    const latest = items[0]?.created_at;
    const hasHomeAlerts = (data?.home_notifications?.length ?? 0) > 0;
    const homeUnread =
      hasHomeAlerts ||
      (latest && (!feedSeenAt || new Date(latest) > new Date(feedSeenAt))) ||
      hasUnreadChanges;
    const chatUnread = liveChatUnread ?? data?.chat_unread_count ?? 0;
    return {
      home: homeUnread,
      schedule: hasUnreadChanges,
      messages: chatUnread > 0,
    };
  }, [data?.home_notifications, data?.items, data?.chat_unread_count, feedSeenAt, hasUnreadChanges, liveChatUnread]);

  const attendance = data?.attendance_summary;
  const teamLabel = (data?.teams || []).join(", ") || "—";
  const photoUrl = useAthletePhoto(data?.athlete_id, Boolean(data?.has_photo), {
    // Винаги опитва /me/photo — has_photo от API може да е „оптимистично“ (СЕК id без локален кеш).
    canFetchFromBvf: true,
    photoPath: data?.athlete_id ? API_PATHS.ATHLETE_ROOM_ME_PHOTO : null,
  });
  const feedItems = data?.items || [];
  const hasFeed = feedItems.length > 0;

  const bottomNav = data ? (
    <TeamRoomBottomNav
      activeTab={activeTab}
      onChange={setActiveTab}
      badges={badges}
      avatarUrl={photoUrl || data.avatar_url || null}
    />
  ) : null;

  const headerActions =
    !loading && !error && data ? (
      <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
        Изход
      </Button>
    ) : null;

  return (
    <TeamRoomLayout
      bottomNav={bottomNav}
      headerActions={headerActions}
      clubLogoUrl={data?.club_logo_url}
      clubName={data?.club_name}
    >
      <LoginIntro visibleMs={1800} fadeMs={600} />
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
            <header className="teamRoomAthleteHero">
              <div className="teamRoomAthleteHeroRow">
                <div className="teamRoomAthletePhotoWrap" aria-hidden={!photoUrl}>
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="teamRoomAthletePhoto" />
                  ) : (
                    <span className="teamRoomAthletePhotoPlaceholder">
                      {(data.athlete_name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="teamRoomAthleteHeroText">
                  <h1 className="teamRoomTopTitle">{data.athlete_name}</h1>
                  <p className="teamRoomTopSub">{data.club_name || ""}</p>
                  <AthleteMembershipChips
                    teamNames={data.teams}
                    cardedTeams={data.carded_teams}
                    showEmpty
                  />
                </div>
              </div>
            </header>

            <TabPanel id="home" activeTab={activeTab}>
              <TeamRoomPushPrompt />
              <TeamRoomHomeAlerts
                notifications={data.home_notifications}
                onOpen={handleOpenHomeNotification}
              />
              <div className="teamRoomHomeStack">
                <section className="teamRoomCard teamRoomCard--upcoming" aria-label="Следващи събития">
                  <h2 className="teamRoomCardTitle">Предстои</h2>
                  <NextEventChip
                    item={data.next_training}
                    label="Няма предстояща тренировка."
                    onAckChange={handleAckScheduleChange}
                  />
                  <NextEventChip
                    item={data.next_competition}
                    label="Няма предстоящо състезание."
                    onAckChange={handleAckScheduleChange}
                  />
                </section>

                <section className="teamRoomCard teamRoomCard--attendance" aria-label="Присъствие">
                  <h2 className="teamRoomCardTitle">Присъствие (90 дни)</h2>
                  <AttendancePositiveBlock attendance={attendance} />
                </section>
              </div>
              {data.monthly_fees_enabled !== false ? (
                <TeamRoomFeeStatus
                  fee={data.current_month_fee}
                  formatMonthKey={formatMonthKey}
                  feeChangeHighlight={data.fee_change_highlight}
                  onAckFeeHighlight={handleAckFeeHighlight}
                />
              ) : null}
              {hasFeed ? (
                <>
                  <h2 className="teamRoomSectionTitle">Новини</h2>
                  <TeamRoomFeed items={feedItems} />
                </>
              ) : null}
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
                highlightDates={highlightDates}
                onAckScheduleChange={handleAckScheduleChange}
                scheduleHint="Докоснете ден за детайли. Червените дни имат промяна."
              />
            </TabPanel>

            <TabPanel id="development" activeTab={activeTab}>
              <h2 className="teamRoomSectionTitle">Моето развитие</h2>
              <ParentDevelopmentSection path={API_PATHS.ATHLETE_ROOM_DEVELOPMENT_ME} />
            </TabPanel>

            <TabPanel id="messages" activeTab={activeTab}>
              <h2 className="teamRoomSectionTitle">Отборни чатове</h2>
              <TeamRoomChat
                active={activeTab === "messages"}
                onUnreadChange={setLiveChatUnread}
                openTeamId={pendingChatTeamId}
                onOpenTeamConsumed={() => setPendingChatTeamId(null)}
              />
            </TabPanel>

            <TabPanel id="profile" activeTab={activeTab}>
              {data.monthly_fees_enabled !== false ? (
                <TeamRoomFeeStatus
                  fee={data.current_month_fee}
                  formatMonthKey={formatMonthKey}
                  feeChangeHighlight={data.fee_change_highlight}
                  onAckFeeHighlight={handleAckFeeHighlight}
                />
              ) : null}
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
                <AttendancePositiveBlock attendance={attendance} />
              </section>
            </TabPanel>
          </>
        ) : null}
      </div>
    </TeamRoomLayout>
  );
}
