import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { isCompetitionEvent } from "../../utils/competitionKinds";
import { monthBounds } from "../../utils/teamAttendanceMatrix";
import { teamRoomLoginPath } from "../../utils/teamRoomAuth";

const monthKeyNow = () => new Date().toISOString().slice(0, 7);

function formatNewsPreview(item) {
  if (!item) return "Няма публикации";
  if (item.kind === "image") return "Снимка";
  const text = String(item.body || "").trim();
  if (!text) return "Публикация";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function formatNewsDate(item) {
  if (!item?.created_at) return "";
  try {
    return new Date(item.created_at).toLocaleDateString("bg-BG", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function teamMetaLine(team) {
  const parts = [];
  if (team?.age_group) parts.push(team.age_group);
  if (team?.gender === "male") parts.push("М");
  else if (team?.gender === "female") parts.push("Ж");
  if (team?.season) parts.push(team.season);
  return parts.length ? parts.join(" · ") : null;
}

function StatCard({ label, value, hint, onClick, disabled }) {
  return (
    <button type="button" className="coachMobileHubStatCard" onClick={onClick} disabled={disabled}>
      <span className="coachMobileHubStatValue">{value}</span>
      <span className="coachMobileHubStatLabel">{label}</span>
      {hint ? <span className="coachMobileHubStatHint">{hint}</span> : null}
    </button>
  );
}

export default function CoachTeamHubOverview({
  team,
  teamIdNum,
  memberCount,
  portalItems,
  canManage,
  onTab,
}) {
  const navigate = useNavigate();
  const [statsLoading, setStatsLoading] = useState(true);
  const [trainingCount, setTrainingCount] = useState(null);
  const [attendanceLabel, setAttendanceLabel] = useState("—");
  const [attendanceHint, setAttendanceHint] = useState("");

  const monthKey = monthKeyNow();
  const meta = teamMetaLine(team);

  const lastNews = useMemo(() => {
    const list = Array.isArray(portalItems) ? portalItems : [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  }, [portalItems]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatsLoading(true);
        const { from, to } = monthBounds(monthKey);
        const [scheduleRes, reportRes] = await Promise.all([
          axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
            params: { from, to, team_id: teamIdNum, include_cancelled: false },
          }),
          axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_REPORT(teamIdNum), {
            params: { from_date: from, to_date: to },
          }).catch(() => ({ data: null })),
        ]);
        if (!alive) return;

        const occ = Array.isArray(scheduleRes.data?.items) ? scheduleRes.data.items : [];
        const trainings = occ.filter((it) => Number(it.team_id) === teamIdNum && !isCompetitionEvent(it));
        setTrainingCount(trainings.length);

        const report = reportRes.data;
        const sessions = Number(report?.sessions_count || 0);
        const rows = Array.isArray(report?.rows) ? report.rows : [];
        if (sessions === 0 || rows.length === 0) {
          setAttendanceLabel("—");
          setAttendanceHint(sessions === 0 ? "Няма записи" : "");
        } else {
          let presentLate = 0;
          let total = 0;
          let absent = 0;
          for (const r of rows) {
            presentLate += Number(r.present || 0) + Number(r.late || 0);
            total += Number(r.total || 0);
            absent += Number(r.absent || 0);
          }
          const rate = total > 0 ? Math.round((presentLate / total) * 100) : 0;
          setAttendanceLabel(`${rate}%`);
          setAttendanceHint(absent > 0 ? `${absent} отсъств.` : `${sessions} сесии`);
        }
      } catch {
        if (!alive) return;
        setTrainingCount(null);
        setAttendanceLabel("—");
        setAttendanceHint("");
      } finally {
        if (alive) setStatsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamIdNum, monthKey]);

  const statsBusy = statsLoading;

  const quickActions = [
    {
      id: "attendance",
      label: "Присъствие (месец)",
      onClick: () => navigate(`/coach/teams/${teamIdNum}/attendance-month`),
    },
    {
      id: "schedule",
      label: "График на отбора",
      onClick: () => navigate(`/coach/schedule?team_id=${teamIdNum}`),
    },
    ...(canManage
      ? [
          { id: "news", label: "Новини", onClick: () => onTab("news") },
          { id: "chat", label: "Чат", onClick: () => onTab("chat") },
        ]
      : []),
    { id: "roster", label: "Състав", onClick: () => onTab("roster") },
    {
      id: "room",
      label: "Стая на отбора",
      href: teamRoomLoginPath(),
      external: true,
    },
  ];

  return (
    <section className="coachMobileHubSection coachMobileHubSection--overview">
      {meta ? <p className="coachMobileMuted coachMobileHubMeta">{meta}</p> : null}

      <div className="coachMobileHubStatGrid" aria-busy={statsBusy}>
        <StatCard
          label="Състав"
          value={memberCount}
          hint={memberCount === 1 ? "състезател" : "състезатели"}
          onClick={() => onTab("roster")}
        />
        <StatCard
          label="Тренировки"
          value={statsBusy ? "…" : trainingCount ?? "—"}
          hint="този месец"
          onClick={() => navigate(`/coach/schedule?team_id=${teamIdNum}`)}
          disabled={statsBusy}
        />
        <StatCard
          label="Присъствие"
          value={statsBusy ? "…" : attendanceLabel}
          hint={statsBusy ? "" : attendanceHint || "този месец"}
          onClick={() => navigate(`/coach/teams/${teamIdNum}/attendance-month`)}
          disabled={statsBusy}
        />
        <StatCard
          label="Последна новина"
          value={statsBusy && canManage ? "…" : formatNewsPreview(lastNews)}
          hint={lastNews ? formatNewsDate(lastNews) : canManage ? "публикувай в Новини" : ""}
          onClick={() => (canManage ? onTab("news") : onTab("roster"))}
          disabled={statsBusy && canManage}
        />
      </div>

      <div className="coachMobileQuickGrid coachMobileHubQuickGrid">
        {quickActions.map((action) =>
          action.href ? (
            <Link
              key={action.id}
              to={action.href}
              className="coachMobileQuickBtn"
              target={action.external ? "_blank" : undefined}
              rel={action.external ? "noreferrer" : undefined}
            >
              {action.label}
            </Link>
          ) : (
            <button key={action.id} type="button" className="coachMobileQuickBtn" onClick={action.onClick}>
              {action.label}
            </button>
          )
        )}
      </div>

      <Link to={`/teams/${teamIdNum}`} className="coachMobileHubDesktopLink">
        Пълен профил (десктоп)
      </Link>
    </section>
  );
}
