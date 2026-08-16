import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
import {
  competitionRosterAction,
  competitionRosterPath,
} from "../utils/competitionRosterPriority";
import CoachMethodAssignments from "../components/coach/CoachMethodAssignments";
import Drills from "./Drills";
import {
  currentMonthKey,
  loadCoachDashboardData,
  mergeDashboardData,
  readHeadStatsScope,
  writeHeadStatsScope,
} from "../utils/loadCoachDashboardData";
import { teamColorsForId } from "../utils/teamColors";

const formatDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("bg-BG");
};

const cardLinkStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 10,
  textDecoration: "none",
  color: "#0f172a",
  cursor: "pointer",
};

const dashboardScheduleAttendanceTo = (it) => {
  const title =
    `${it.start_time}–${it.end_time} ${it.team_name || ""}`.trim() || `Тренировка ${it.start_time}`;
  return `/teams/${it.team_id}/attendance?date=${encodeURIComponent(it.date)}&title=${encodeURIComponent(title)}`;
};

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const monthlyFeesEnabled = user?.monthly_fees_enabled !== false;
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [feesSummary, setFeesSummary] = useState({ total: 0, paid: 0, unpaid: 0 });
  const [forumItems, setForumItems] = useState([]);
  const [articleItems, setArticleItems] = useState([]);
  const [lastTrainings, setLastTrainings] = useState([]);
  const [topDrills, setTopDrills] = useState([]);
  const [draftCount, setDraftCount] = useState(0);
  const [returnedArticles, setReturnedArticles] = useState([]);
  const [activityItems, setActivityItems] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({ trainingsCreated: 0, drillsUsed: 0 });
  const [scheduleItems, setScheduleItems] = useState([]);
  const [rosterAlerts, setRosterAlerts] = useState([]);
  const [attendanceRank, setAttendanceRank] = useState({ top: [], bottom: [], sessionLimit: 10 });
  const [feeOverdue, setFeeOverdue] = useState({ late10: [], overTwo: [] });
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("today");
  const [headTeamScope, setHeadTeamScope] = useState("all");
  const [loadedSections, setLoadedSections] = useState({});

  const role = String(user?.role || "").toLowerCase();
  const showCoachDashboard = role === "coach" || role === "club_head_coach";
  const isHeadCoach = role === "club_head_coach";
  const monthKey = useMemo(() => currentMonthKey(), []);

  const applyDashboardPartial = (partial) => {
    setFeesSummary((prev) => partial.feesSummary ?? prev);
    setFeeOverdue((prev) => partial.feeOverdue ?? prev);
    setForumItems((prev) => partial.forumItems ?? prev);
    setArticleItems((prev) => partial.articleItems ?? prev);
    setLastTrainings((prev) => partial.lastTrainings ?? prev);
    setTopDrills((prev) => partial.topDrills ?? prev);
    setDraftCount((prev) => (partial.draftCount !== undefined ? partial.draftCount : prev));
    setReturnedArticles((prev) => partial.returnedArticles ?? prev);
    setActivityItems((prev) => {
      if (!partial.activityItems) return prev;
      return mergeDashboardData({ activityItems: prev }, { activityItems: partial.activityItems }).activityItems;
    });
    setMonthlyStats((prev) => partial.monthlyStats ?? prev);
    setScheduleItems((prev) => partial.scheduleItems ?? prev);
    setRosterAlerts((prev) => partial.rosterAlerts ?? prev);
    setAttendanceRank((prev) => partial.attendanceRank ?? prev);
  };

  useEffect(() => {
    if (!user?.id || !isHeadCoach) return;
    setHeadTeamScope(readHeadStatsScope(user.id));
  }, [user?.id, isHeadCoach]);

  const onHeadTeamScopeChange = (scope) => {
    setHeadTeamScope(scope);
    if (user?.id) writeHeadStatsScope(user.id, scope);
  };

  useEffect(() => {
    if (!showCoachDashboard) return undefined;
    const mq = window.matchMedia("(max-width: 767px)");
    const go = () => {
      if (mq.matches) navigate("/coach/today", { replace: true });
    };
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, [showCoachDashboard, navigate]);

  useEffect(() => {
    if (!showCoachDashboard) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");
        setLoadedSections((prev) => (prev.content ? { content: true } : {}));
        const data = await loadCoachDashboardData({
          userId: user?.id,
          isHeadCoach,
          headTeamScope,
          monthKey,
          sections: ["today"],
        });
        if (!active) return;
        applyDashboardPartial(data);
        setLoadedSections((prev) => ({
          today: true,
          ...(prev.content ? { content: true } : {}),
        }));
      } catch (e) {
        const detail = e?.response?.data?.detail;
        if (active) setError(typeof detail === "string" ? detail : "Грешка при зареждане на началното табло.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDashboard();
    return () => {
      active = false;
    };
  }, [monthKey, showCoachDashboard, user?.id, isHeadCoach, headTeamScope]);

  useEffect(() => {
    if (!showCoachDashboard || activeTab === "today" || loadedSections[activeTab] || loading) {
      return undefined;
    }
    let active = true;
    const loadTab = async () => {
      try {
        setTabLoading(true);
        setError("");
        const data = await loadCoachDashboardData({
          userId: user?.id,
          isHeadCoach,
          headTeamScope,
          monthKey,
          sections: [activeTab],
          includeTrainingStats: !loadedSections.content,
        });
        if (!active) return;
        applyDashboardPartial(data);
        setLoadedSections((prev) => ({ ...prev, [activeTab]: true }));
      } catch (e) {
        const detail = e?.response?.data?.detail;
        if (active) setError(typeof detail === "string" ? detail : "Грешка при зареждане на раздела.");
      } finally {
        if (active) setTabLoading(false);
      }
    };
    loadTab();
    return () => {
      active = false;
    };
  }, [activeTab, loadedSections, loading, showCoachDashboard, user?.id, isHeadCoach, headTeamScope, monthKey]);

  if (!user || !showCoachDashboard) {
    return <Drills />;
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Coach Dashboard"
        subtitle="Най-важното за днес: месечни такси, нови теми във форума и последни статии."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button as={Link} to="/coach-board">
              Тактическа дъска
            </Button>
            <Button as={Link} to="/coach/schedule" variant="secondary">
              График
            </Button>
          </div>
        }
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}
      <CoachMethodAssignments />

      <div
        role="tablist"
        aria-label="Раздели на таблото"
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          margin: "4px 0 16px",
          padding: 4,
          background: "#f1f5f9",
          borderRadius: 12,
          width: "fit-content",
          maxWidth: "100%",
        }}
      >
        {[
          { id: "today", label: "Днес", badge: activityItems.length || null },
          { id: "content", label: "Съдържание", badge: null },
          { id: "stats", label: "Статистика", badge: monthlyFeesEnabled ? feesSummary.unpaid || null : null },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "none",
                cursor: "pointer",
                padding: "9px 16px",
                borderRadius: 9,
                fontWeight: 700,
                fontSize: 14,
                color: active ? "#0f766e" : "#475569",
                background: active ? "#ffffff" : "transparent",
                boxShadow: active ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
                transition: "background 140ms ease, color 140ms ease",
              }}
            >
              {tab.label}
              {tab.badge ? (
                <span
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: "0 6px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    background: tab.id === "stats" ? "#dc2626" : "#0f766e",
                  }}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {(loading || tabLoading) && activeTab !== "today" ? (
        <p style={{ marginBottom: 12, color: "#64748b" }}>Зареждане на раздела...</p>
      ) : null}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {activeTab === "today" && rosterAlerts.length > 0 ? (
        <Card title={`Състезания — действие (${rosterAlerts.length})`}>
          <div style={{ display: "grid", gap: 8 }}>
            {rosterAlerts.map((alert) => (
              <Link
                key={alert.id}
                to={alert.to}
                style={{
                  ...cardLinkStyle,
                  display: "block",
                  background: alert.tone === "danger" ? "#fef2f2" : "#fffbeb",
                  borderColor: alert.tone === "danger" ? "#fecaca" : "#fcd34d",
                }}
              >
                <div style={{ fontWeight: 700, color: alert.tone === "danger" ? "#991b1b" : "#92400e" }}>
                  {alert.text}
                </div>
                {alert.meta ? (
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>{alert.meta}</div>
                ) : null}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
      {activeTab === "today" && (
      <Card
        title="График за следващите 7 дни"
        actions={
          <Button as={Link} to="/coach/schedule" variant="secondary" size="sm">
            Пълен график
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : scheduleItems.length === 0 ? (
          <EmptyState
            title="Няма планирани тренировки"
            description={
              isHeadCoach
                ? "Няма записи в графика на клуба за следващите 7 дни."
                : "Няма записи в графика за теб за следващите 7 дни. Провери пълния график на клуба от бутона по-горе."
            }
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {scheduleItems
              .filter((it) => {
                const horizon = new Date();
                horizon.setDate(horizon.getDate() + 6);
                return String(it.date) <= horizon.toISOString().slice(0, 10);
              })
              .slice(0, 8)
              .map((it, idx) => {
              const isComp = isCompetitionEvent(it);
              const tc = teamColorsForId(it.team_id);
              const rosterAction = isComp ? competitionRosterAction(it) : null;
              const teamLabel = isComp ? competitionKindLabel(it) : it.team_name || `Отбор #${it.team_id}`;
              const row = (
                <>
                  <div style={{ fontWeight: 700 }}>{it.date} · {it.start_time}–{it.end_time}</div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 8px", lineHeight: 1.4 }}>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 16,
                        color: isComp ? (rosterAction === "generate" ? "#991b1b" : "#9a3412") : tc.text,
                        borderLeft: `3px solid ${isComp ? (rosterAction === "generate" ? "#dc2626" : "#f59e0b") : tc.border}`,
                        paddingLeft: 8,
                      }}
                    >
                      {teamLabel}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 13 }}>
                      {isComp && it.team_name ? `${it.team_name} · ` : ""}
                      {it.location ? `· ${it.location}` : ""}
                    </span>
                  </div>
                  {rosterAction === "generate" ? (
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#991b1b" }}>
                      Генерирай тимов лист →
                    </div>
                  ) : null}
                  {rosterAction === "review" ? (
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                      Провери тимовия лист →
                    </div>
                  ) : null}
                </>
              );
              const key = isComp
                ? `comp-${it.competition_id}-${it.date}-${idx}`
                : `rule-${it.rule_id}-${it.date}-${it.start_time}-${idx}`;
              if (isComp) {
                return (
                  <Link
                    key={key}
                    to={competitionRosterPath(it.competition_id)}
                    style={{
                      ...cardLinkStyle,
                      display: "block",
                      background: rosterAction === "generate" ? "#fef2f2" : "#fffbeb",
                      borderColor: rosterAction === "generate" ? "#fecaca" : "#fcd34d",
                    }}
                  >
                    {row}
                  </Link>
                );
              }
              return (
                <Link key={key} to={dashboardScheduleAttendanceTo(it)} style={{ ...cardLinkStyle, display: "block" }}>
                  {row}
                </Link>
              );
            })}
            {scheduleItems.length > 8 && (
              <Link to="/coach/schedule" style={{ marginTop: 2, color: "#0f766e", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                + още в пълния график →
              </Link>
            )}
          </div>
        )}
      </Card>
      )}

      {activeTab === "content" && (
      <>
      <Card
        title="Твоите последни 5 тренировки"
        actions={
          <Button as={Link} to="/my-trainings" variant="secondary" size="sm">
            Към тренировките
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : lastTrainings.length === 0 ? (
          <EmptyState title="Още няма тренировки" description="Създай тренировка от Генератора." />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {lastTrainings.map((t) => (
              <Link key={t.id} to={`/trainings/${t.id}`} style={cardLinkStyle}>
                <div style={{ fontWeight: 700 }}>{t.title || `Тренировка #${t.id}`}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  {formatDate(t.created_at)} • {String(t.status || "—")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Най-често използвани упражнения"
        actions={
          <Button as={Link} to="/my-drills" variant="secondary" size="sm">
            Към упражненията
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : topDrills.length === 0 ? (
          <EmptyState title="Все още няма статистика" description="Запази поне една тренировка с упражнения." />
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {topDrills.map((d, idx) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>
                  {idx + 1}. {d.title}
                </span>
                <span className="uiBadge">{d.count} пъти</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Чернови и върнати статии"
        actions={
          <Button as={Link} to="/articles/my" variant="secondary" size="sm">
            Към моите статии
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="uiBadge">Неприключени чернови: {draftCount}</span>
              <span className="uiBadge uiBadge--danger">Върнати статии: {returnedArticles.length}</span>
            </div>
            {returnedArticles.length === 0 ? (
              <p className="uiMuted">Няма върнати статии за редакция.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {returnedArticles.map((a) => (
                  <Link key={a.id} to={`/articles/${a.id}/edit`} style={{ ...cardLinkStyle, border: "1px solid #f4caca", background: "#fff7f7" }}>
                    <div style={{ fontWeight: 700 }}>{a.title || `Статия #${a.id}`}</div>
                    <div style={{ marginTop: 4, color: "#7f1d1d", fontSize: 13 }}>Обновена: {formatDate(a.updated_at || a.created_at)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      </>
      )}

      {activeTab === "today" && (
      <Card
        title="Последни известия"
        actions={
          <Button as={Link} to="/forum" variant="secondary" size="sm">
            Форум
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : activityItems.length === 0 ? (
          <EmptyState title="Няма нови известия" description="Ще виждаш тук форум активност и промени по статии/упражнения." />
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {activityItems.map((item) => {
              const isAbsence = item.kind === "absence";
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  style={{
                    border: `1px solid ${isAbsence ? "#fcd34d" : "#e2e8f0"}`,
                    borderRadius: 10,
                    padding: 10,
                    background: isAbsence ? "#fffbeb" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 700, color: isAbsence ? "#92400e" : undefined }}>{item.text}</div>
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{formatDate(item.at)}</div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      )}

      {activeTab === "stats" && (
      <>
      {isHeadCoach ? (
        <Card title="Обхват на статистиката">
          <label style={{ display: "grid", gap: 6, maxWidth: 360 }}>
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
          <p style={{ marginTop: 10, marginBottom: 0, color: "#64748b", fontSize: 12 }}>
            Настройката се запазва на това устройство и важи за присъствие и такси в този раздел.
          </p>
        </Card>
      ) : null}

      <Card
        title="Малка статистика за месеца"
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="uiBadge">Създадени тренировки: {monthlyStats.trainingsCreated}</span>
            <span className="uiBadge uiBadge--success">Използвани упражнения: {monthlyStats.drillsUsed}</span>
          </div>
        )}
      </Card>

      <Card title={`Присъствие — последни ${attendanceRank.sessionLimit || 10} тренировки`}>
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : !attendanceRank.top?.length && !attendanceRank.bottom?.length ? (
          <EmptyState
            title="Няма данни за присъствие"
            description="Нужни са записани тренировки с присъствие за избраните отбори."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginTop: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8, color: "#166534" }}>Топ 3 най-редовни</div>
              {attendanceRank.top.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>Няма данни</p>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                  {attendanceRank.top.map((a) => (
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
              {attendanceRank.bottom.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>Няма данни</p>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                  {attendanceRank.bottom.map((a) => (
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
        <p style={{ marginTop: 12, color: "#64748b", fontSize: 12 }}>
          Брои се присъства + закъснял спрямо последните {attendanceRank.sessionLimit || 10} тренировки
          {isHeadCoach ? (headTeamScope === "mine" ? " (моите отбори)" : " (всички отбори)") : ""}.
        </p>
      </Card>

      {monthlyFeesEnabled ? (
        <>
      <Card
        title={`Дължими такси (${monthKey})`}
        actions={
          <Button as={Link} to="/coach/fees" variant="secondary" size="sm">
            Отвори Месечни Такси
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className="uiBadge">
              Общо: <strong>{feesSummary.total}</strong>
            </span>
            <span className="uiBadge uiBadge--success">
              Платили: <strong>{feesSummary.paid}</strong>
            </span>
            <span className="uiBadge uiBadge--danger">
              Дължат: <strong>{feesSummary.unpaid}</strong>
            </span>
          </div>
        )}
      </Card>

      <Card title="Закъснели плащания">
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginTop: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Закъснели с повече от 10 дни (този месец)</div>
              {feeOverdue.late10.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>Няма</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {feeOverdue.late10.map((a) => (
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
              {feeOverdue.overTwo.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>Няма</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {feeOverdue.overTwo.map((a) => (
                    <li key={`o2-${a.athlete_id}`}>
                      <strong>{a.athlete_name}</strong>{" "}
                      <span className="uiBadge uiBadge--danger">{a.unpaid_months} такси</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <p style={{ marginTop: 12, color: "#64748b", fontSize: 12 }}>
          Падеж: 10-о число на месеца. „Над 10 дни“ е само за текущия месец; „над 2 такси“ — последните 3 месеца
          {isHeadCoach ? (headTeamScope === "mine" ? " · моите отбори" : " · всички отбори") : ""}.
        </p>
      </Card>
        </>
      ) : null}

      </>
      )}

      {activeTab === "content" && (
      <>
      <Card
        title="Последни теми във форума"
        actions={
          <Button as={Link} to="/forum" variant="secondary" size="sm">
            Към форума
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : forumItems.length === 0 ? (
          <EmptyState title="Още няма теми" description="Създай първата дискусия за деня." />
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {forumItems.map((post) => (
              <Link
                key={post.id}
                to={`/forum/${post.id}`}
                style={cardLinkStyle}
              >
                <div style={{ fontWeight: 700 }}>
                  {post.is_pinned ? "📌 " : ""}
                  {post.title}
                  {post.is_locked ? " 🔒" : ""}
                </div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  Отговори: {post.replies_count || 0} • Активност: {formatDate(post.last_activity_at || post.created_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Последни статии"
        actions={
          <Button as={Link} to="/articles" variant="secondary" size="sm">
            Към статиите
          </Button>
        }
      >
        {loading ? (
          <p style={{ marginTop: 10 }}>Зареждане...</p>
        ) : articleItems.length === 0 ? (
          <EmptyState title="Още няма публикувани статии" description="Публикувай нова статия, за да се появи тук." />
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {articleItems.map((article) => (
              <Link
                key={article.id}
                to={`/articles/${article.id}`}
                style={cardLinkStyle}
              >
                <div style={{ fontWeight: 700 }}>{article.title || `Статия #${article.id}`}</div>
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                  Публикувана: {formatDate(article.created_at)} • Автор: {article.author_name || `Потребител #${article.author_id}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      </>
      )}
      </div>
    </div>
  );
}
