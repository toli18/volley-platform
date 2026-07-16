import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { isCompetitionEvent } from "../../utils/competitionKinds";
import { monthBounds } from "../../utils/teamAttendanceMatrix";
import { teamRoomLoginPath } from "../../utils/teamRoomAuth";
import { Button, Input, Modal } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

const SHEET_MAX_PLAYERS = 14;

export default function CoachTeamHubOverview({
  team,
  teamIdNum,
  members = [],
  memberCount,
  portalItems,
  canManage,
  onTab,
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [statsLoading, setStatsLoading] = useState(true);
  const [trainingCount, setTrainingCount] = useState(null);
  const [attendanceLabel, setAttendanceLabel] = useState("—");
  const [attendanceHint, setAttendanceHint] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetStep, setSheetStep] = useState(1);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState([]);
  const [sheetForm, setSheetForm] = useState({
    competition: "",
    venue_city: "",
    age_group: "",
    sheet_date: todayIso(),
    jersey_color: "",
    head_coach: "",
    assistant_1: "",
    assistant_2: "",
  });

  const monthKey = monthKeyNow();
  const meta = teamMetaLine(team);
  const roster = useMemo(() => (Array.isArray(members) ? members : []), [members]);

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

  const openTeamSheet = () => {
    const ids = roster.map((m) => Number(m.athlete_id)).filter(Boolean);
    setSelectedAthleteIds(ids.slice(0, SHEET_MAX_PLAYERS));
    setSheetStep(1);
    setSheetForm({
      competition: "",
      venue_city: "",
      age_group: team?.age_group || "",
      sheet_date: todayIso(),
      jersey_color: "",
      head_coach: user?.name || user?.email || "",
      assistant_1: "",
      assistant_2: "",
    });
    setSheetOpen(true);
  };

  const closeTeamSheet = () => {
    if (sheetBusy) return;
    setSheetOpen(false);
    setSheetStep(1);
  };

  const goToAthletesStep = () => {
    setSheetStep(2);
  };

  const toggleAthlete = (athleteId) => {
    const id = Number(athleteId);
    if (selectedAthleteIds.includes(id)) {
      setSelectedAthleteIds((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (selectedAthleteIds.length >= SHEET_MAX_PLAYERS) {
      toast.error(`Можете да изберете най-много ${SHEET_MAX_PLAYERS} състезатели.`);
      return;
    }
    setSelectedAthleteIds((prev) => [...prev, id]);
  };

  const selectAllAthletes = () => {
    const ids = roster.map((m) => Number(m.athlete_id)).filter(Boolean);
    if (ids.length > SHEET_MAX_PLAYERS) {
      toast.error(`Изберете до ${SHEET_MAX_PLAYERS} състезатели (отборът има ${ids.length}).`);
      setSelectedAthleteIds(ids.slice(0, SHEET_MAX_PLAYERS));
      return;
    }
    setSelectedAthleteIds(ids);
  };

  const downloadTeamSheet = async () => {
    if (selectedAthleteIds.length === 0) {
      toast.error("Изберете поне един състезател.");
      return;
    }
    try {
      setSheetBusy(true);
      const res = await axiosInstance.post(
        API_PATHS.TEAM_SHEET_PDF(teamIdNum),
        {
          competition: sheetForm.competition.trim() || null,
          venue_city: sheetForm.venue_city.trim() || null,
          age_group: sheetForm.age_group.trim() || null,
          sheet_date: sheetForm.sheet_date || null,
          jersey_color: sheetForm.jersey_color.trim() || null,
          head_coach: sheetForm.head_coach.trim() || null,
          assistant_1: sheetForm.assistant_1.trim() || null,
          assistant_2: sheetForm.assistant_2.trim() || null,
          athlete_ids: selectedAthleteIds,
        },
        { responseType: "blob" },
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timov-list-${teamIdNum}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setSheetOpen(false);
      setSheetStep(1);
      toast.success("Тимовият лист е генериран.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно генериране на тимов лист."));
    } finally {
      setSheetBusy(false);
    }
  };

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
    {
      id: "program-week",
      label: "Програмна седмица",
      onClick: () => navigate(`/coach/program-week?team_id=${teamIdNum}`),
    },
    {
      id: "team-sheet",
      label: "Генерирай тимов лист",
      onClick: openTeamSheet,
    },
    {
      id: "matches",
      label: "Мач / Ротации",
      onClick: () => navigate(`/coach/teams/${teamIdNum}/matches`),
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

      <Modal
        open={sheetOpen}
        onClose={closeTeamSheet}
        dismissable={!sheetBusy}
        title={sheetStep === 1 ? "Тимов лист (О-2) · Стъпка 1" : "Тимов лист (О-2) · Стъпка 2"}
        size="compact"
      >
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            {sheetStep === 1 ? "Попълнете данните за листа" : "Изберете състезателите (до 14)"}
          </p>

          {sheetStep === 1 ? (
            <>
              <Input
                placeholder="Състезание"
                value={sheetForm.competition}
                onChange={(e) => setSheetForm((p) => ({ ...p, competition: e.target.value }))}
              />
              <Input
                placeholder="Място / град на състезанието"
                value={sheetForm.venue_city}
                onChange={(e) => setSheetForm((p) => ({ ...p, venue_city: e.target.value }))}
              />
              <Input
                placeholder="Възраст"
                value={sheetForm.age_group}
                onChange={(e) => setSheetForm((p) => ({ ...p, age_group: e.target.value }))}
              />
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Дата</span>
                <Input
                  type="date"
                  value={sheetForm.sheet_date}
                  onChange={(e) => setSheetForm((p) => ({ ...p, sheet_date: e.target.value }))}
                />
              </label>
              <Input
                placeholder="Цвят на екип"
                value={sheetForm.jersey_color}
                onChange={(e) => setSheetForm((p) => ({ ...p, jersey_color: e.target.value }))}
              />
              <Input
                placeholder="Старши треньор"
                value={sheetForm.head_coach}
                onChange={(e) => setSheetForm((p) => ({ ...p, head_coach: e.target.value }))}
              />
              <Input
                placeholder="Помощник-треньор 1"
                value={sheetForm.assistant_1}
                onChange={(e) => setSheetForm((p) => ({ ...p, assistant_1: e.target.value }))}
              />
              <Input
                placeholder="Помощник-треньор 2"
                value={sheetForm.assistant_2}
                onChange={(e) => setSheetForm((p) => ({ ...p, assistant_2: e.target.value }))}
              />
              <div className="uiModalActions">
                <Button disabled={sheetBusy} onClick={goToAthletesStep}>
                  Напред · Състезатели
                </Button>
                <Button variant="secondary" disabled={sheetBusy} onClick={closeTeamSheet}>
                  Отказ
                </Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                    Състезатели ({selectedAthleteIds.length}/{SHEET_MAX_PLAYERS})
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={sheetBusy || roster.length === 0}
                      onClick={selectAllAthletes}
                      style={{ border: "none", background: "none", color: "#0f766e", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
                    >
                      Всички
                    </button>
                    <button
                      type="button"
                      disabled={sheetBusy || selectedAthleteIds.length === 0}
                      onClick={() => setSelectedAthleteIds([])}
                      style={{ border: "none", background: "none", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
                    >
                      Изчисти
                    </button>
                  </div>
                </div>
                {roster.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Няма състезатели в отбора.</p>
                ) : (
                  <div
                    style={{
                      maxHeight: 320,
                      overflow: "auto",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "6px 8px",
                      background: "#f8fafc",
                    }}
                  >
                    {roster.map((m) => {
                      const id = Number(m.athlete_id);
                      const checked = selectedAthleteIds.includes(id);
                      return (
                        <label
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 4px",
                            borderBottom: "1px solid #eef2f7",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={sheetBusy}
                            onChange={() => toggleAthlete(id)}
                          />
                          <span>{m.athlete_name || m.name || `Състезател #${id}`}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                СЕК остава празен; година, място, ръст и разтег се попълват автоматично.
              </p>
              <div className="uiModalActions">
                <Button disabled={sheetBusy || selectedAthleteIds.length === 0} onClick={downloadTeamSheet}>
                  {sheetBusy ? "Генериране..." : "Изтегли PDF"}
                </Button>
                <Button variant="secondary" disabled={sheetBusy} onClick={() => setSheetStep(1)}>
                  Назад
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

