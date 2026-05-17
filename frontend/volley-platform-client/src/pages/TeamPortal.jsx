import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { resolveStaticUrl } from "../utils/staticUrl";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
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

function formatShortDate(iso) {
  if (!iso) return "—";
  const [, m, d] = String(iso).split("-");
  return `${d}.${m}`;
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

  const scheduleByDate = useMemo(() => {
    const map = new Map();
    for (const row of data?.monthly_schedule || []) {
      const arr = map.get(row.date) || [];
      arr.push(row);
      map.set(row.date, arr);
    }
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [data?.monthly_schedule]);

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
                График и новини за отбора
              </p>
            </header>

            <Card title="Новини">
              {(data.items || []).length === 0 ? (
                <EmptyState title="Няма публикации" description="Треньорът ще добави обявления и снимки тук." />
              ) : (
                <div className="teamPortalPublicFeed">
                  {data.items.map((item) => (
                    <article key={item.id} className="teamPortalPublicFeedItem">
                      {item.kind === "image" && item.url ? (
                        <img
                          src={resolveStaticUrl(item.url)}
                          alt={item.file_name || "Снимка"}
                          className="teamPortalPublicFeedImg"
                          loading="lazy"
                        />
                      ) : (
                        <p className="teamPortalPublicFeedText">{item.body}</p>
                      )}
                      <time className="teamPortalPublicFeedTime" dateTime={item.created_at}>
                        {item.created_at ? new Date(item.created_at).toLocaleString("bg-BG") : ""}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`График — ${formatMonthKey(data.schedule_month_key)}`}>
              {scheduleByDate.length === 0 ? (
                <EmptyState title="Няма събития" description="За този месец няма записан график." />
              ) : (
                <div className="teamPortalScheduleList">
                  {scheduleByDate.map(([date, rows]) => (
                    <div key={date} className="teamPortalScheduleDay">
                      <div className="teamPortalScheduleDayLabel">{formatShortDate(date)}</div>
                      <div className="teamPortalScheduleDayEvents">
                        {rows
                          .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
                          .map((row, i) => {
                            const isComp = isCompetitionEvent(row);
                            const label = row.is_cancelled
                              ? "Отменена"
                              : isComp
                                ? competitionKindLabel(row)
                                : "Тренировка";
                            return (
                              <div
                                key={`${date}-${i}`}
                                className={`teamPortalScheduleEvent${row.is_cancelled ? " is-cancelled" : ""}${isComp ? " is-competition" : ""}`}
                              >
                                <span className="teamPortalScheduleEventTime">
                                  {row.start_time} – {row.end_time}
                                </span>
                                <span className="teamPortalScheduleEventMain">
                                  <span className="uiBadge uiBadge--secondary">{label}</span>
                                  {row.location ? ` · ${row.location}` : ""}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </TeamPortalShell>
  );
}
