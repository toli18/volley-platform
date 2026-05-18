import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import ParentScheduleViews from "../components/parentPortal/ParentScheduleViews";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { resolveStaticUrl } from "../utils/staticUrl";
import { competitionKindLabel } from "../utils/competitionKinds";
import { formatDaysUntil } from "../utils/parentPortalDates";
import { formatLocationDisplay } from "../utils/parentPortalSchedule";
import { Card, EmptyState } from "../components/ui";

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

function TeamPortalShell({ children }) {
  return (
    <div className="parentPortalShell teamPortalShell">
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img src="/bfvb-logo.png" alt="БФВ" className="parentPortalLogo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div>
            <div className="parentPortalBrand">Volley Coach Platform</div>
            <div className="parentPortalBrandSub">Отборна стая</div>
          </div>
        </div>
      </header>
      <main className="parentPortalMain">{children}</main>
      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}

function formatFeedTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function TeamPortalTextFeed({ items }) {
  if (!items?.length) {
    return (
      <EmptyState
        title="Няма обявления"
        description="Треньорът ще публикува важни съобщения за отбора тук."
      />
    );
  }

  return (
    <div className="teamPortalPublicFeed teamPortalPublicFeed--text">
      {items.map((item, index) => (
        <article
          key={item.id}
          className={`teamPortalPublicFeedItem${index === 0 ? " teamPortalPublicFeedItem--latest" : ""}`}
        >
          {index === 0 ? <div className="teamPortalPublicFeedLatestBadge">Последна обява</div> : null}
          <p className="teamPortalPublicFeedText">{item.body}</p>
          <time className="teamPortalPublicFeedTime" dateTime={item.created_at}>
            {formatFeedTime(item.created_at)}
          </time>
        </article>
      ))}
    </div>
  );
}

function TeamPortalGallery({ items }) {
  if (!items?.length) return null;

  return (
    <div className="teamPortalPublicFeed teamPortalPublicFeed--gallery">
      {items.map((item, index) => (
        <article
          key={item.id}
          className={`teamPortalPublicFeedItem teamPortalPublicFeedItem--image${index === 0 ? " teamPortalPublicFeedItem--latest" : ""}`}
        >
          {index === 0 ? <div className="teamPortalPublicFeedLatestBadge">Последна снимка</div> : null}
          <a href={resolveStaticUrl(item.url)} target="_blank" rel="noreferrer" className="teamPortalPublicFeedImgLink">
            <img
              src={resolveStaticUrl(item.url)}
              alt={item.file_name || "Снимка"}
              className="teamPortalPublicFeedImg"
              loading={index === 0 ? "eager" : "lazy"}
            />
          </a>
          <time className="teamPortalPublicFeedTime" dateTime={item.created_at}>
            {formatFeedTime(item.created_at)}
          </time>
        </article>
      ))}
    </div>
  );
}

function NextMatchBlock({ item }) {
  if (!item) {
    return (
      <p className="parentPortalHighlightMuted parentPortalNextEventEmpty">
        Няма предстоящ мач или турнир.
      </p>
    );
  }
  const daysUntil = formatDaysUntil(item.date);
  const loc = formatLocationDisplay(item.location);
  return (
    <div className="parentPortalNextEventBlock parentPortalNextEventBlock--competition">
      <p className="parentPortalHighlightMetaRow">
        <span className="uiBadge uiBadge--warning">{competitionKindLabel(item)}</span>
        {daysUntil ? <span className="parentPortalDaysUntil">{daysUntil}</span> : null}
      </p>
      <p className="parentPortalHighlightMain">{formatDateBg(item.date)}</p>
      <p className="parentPortalHighlightDetail">
        <span className="uiBadge uiBadge--secondary">Час</span>{" "}
        {item.start_time} – {item.end_time}
      </p>
      {loc ? (
        <p className="parentPortalHighlightDetail parentPortalHighlightDetail--location" title={loc}>
          <span className="uiBadge uiBadge--secondary">Място</span> {loc}
        </p>
      ) : null}
    </div>
  );
}

export default function TeamPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.TEAM_PORTAL_GET(token));
        if (!cancelled) setData(res.data || null);
      } catch (err) {
        if (!cancelled) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Линкът е невалиден или изтекъл.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const fetchScheduleMonth = useCallback(
    async (monthKey) => {
      const res = await axiosInstance.get(API_PATHS.TEAM_PORTAL_SCHEDULE(token), {
        params: { month: monthKey },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
    [token],
  );

  const attendance = data?.attendance_summary;
  const hasAttendance = (attendance?.total ?? 0) > 0;

  const { textItems, imageItems } = useMemo(() => {
    const all = data?.items || [];
    return {
      textItems: all.filter((item) => item.kind !== "image"),
      imageItems: all.filter((item) => item.kind === "image" && item.url),
    };
  }, [data?.items]);

  return (
    <TeamPortalShell>
      <div className="parentPortalPage teamPortalPage">
        {loading ? <Card title="Зареждане..."><p>Моля, изчакай...</p></Card> : null}
        {!loading && error ? <EmptyState title="Достъпът е отказан" description={error} /> : null}
        {!loading && !error && data ? (
          <>
            <header className="parentPortalHero">
              <h1 className="parentPortalHeroTitle">{data.team_name}</h1>
              <p className="parentPortalHeroSub">
                {data.club_name ? `${data.club_name} · ` : ""}
                Новини и график за отбора
              </p>
            </header>

            <section className="parentPortalHighlightGrid" aria-label="Статистика на отбора">
              <div className="parentPortalHighlightCard">
                <h2 className="parentPortalHighlightTitle">Присъствие на отбора</h2>
                {hasAttendance ? (
                  <>
                    <p className="parentPortalHighlightMain">
                      <span className="uiBadge uiBadge--info">{attendance.attendance_rate_percent}%</span>
                    </p>
                    <p className="parentPortalHighlightDetail">
                      Последните 90 дни · {attendance.present + attendance.late} от {attendance.total} записа
                    </p>
                    <p className="parentPortalHighlightMuted" style={{ fontSize: "12px", marginTop: "4px" }}>
                      Присъства: {attendance.present}
                      {attendance.late ? ` · Закъснели: ${attendance.late}` : ""}
                      {attendance.absent ? ` · Отсъстващи: ${attendance.absent}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="parentPortalHighlightMuted">
                    Още няма достатъчно записи за присъствие.
                  </p>
                )}
              </div>
              <div className="parentPortalHighlightCard parentPortalHighlightCard--schedule">
                <h2 className="parentPortalHighlightTitle">Следващ мач</h2>
                <NextMatchBlock item={data.next_competition} />
              </div>
            </section>

            <section id="team-portal-news" className="teamPortalNewsSection" aria-label="Новини">
              <Card title="Новини">
                <TeamPortalTextFeed items={textItems} />
              </Card>
            </section>

            <section className="parentPortalScheduleSection" aria-label="График">
              <Card title="График">
                <ParentScheduleViews
                  token={token}
                  initialItems={data.monthly_schedule}
                  scheduleMonthKey={data.schedule_month_key}
                  formatMonthKey={formatMonthKey}
                  fetchScheduleMonth={fetchScheduleMonth}
                  initialWeekStart={data.week_start}
                  showTeamLegend={false}
                  scheduleHint="Зала и час в клетката. Докоснете ден за детайли."
                />
              </Card>
            </section>

            {imageItems.length > 0 ? (
              <section id="team-portal-gallery" className="teamPortalGallerySection" aria-label="Снимки">
                <Card title="Снимки">
                  <TeamPortalGallery items={imageItems} />
                </Card>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </TeamPortalShell>
  );
}
