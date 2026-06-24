import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useAuth } from "../auth/AuthContext";
import TrainingSessionAdjustModal from "../components/schedule/TrainingSessionAdjustModal";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const normalizeError = (err, fallback = "Грешка при работа с присъствието.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const shortStatusLabel = (value) => {
  if (value === "present") return "Тук";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Няма";
  if (value === "excused") return "Извинен";
  return value || "";
};

const roleValue = (user) => {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
};

export default function TeamAttendance() {
  const { teamId } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [sessionAdjustOpen, setSessionAdjustOpen] = useState(false);
  const initialDate = searchParams.get("date") || todayKey();
  const initialTitle = searchParams.get("title") || "";
  const [attendanceDate, setAttendanceDate] = useState(initialDate);
  const [attendanceTitle, setAttendanceTitle] = useState(initialTitle);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [dayTraining, setDayTraining] = useState(null);
  const [dayTrainingLoading, setDayTrainingLoading] = useState(false);

  const teamIdNum = Number(teamId);
  const isHeadCoach = roleValue(user) === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const loadTeam = async () => {
    const [teamsRes, coachesRes] = await Promise.all([
      axiosInstance.get(API_PATHS.TEAMS_LIST),
      axiosInstance.get(API_PATHS.FEES_COACHES_LIST).catch(() => ({ data: [] })),
    ]);
    const list = Array.isArray(teamsRes.data) ? teamsRes.data : [];
    setTeam(list.find((x) => x.id === teamIdNum) || null);
    setCoaches(Array.isArray(coachesRes.data) ? coachesRes.data : []);
  };

  const loadAttendance = async (dateKey) => {
    if (!teamIdNum || !dateKey) return;
    const res = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_GET(teamIdNum), { params: { date: dateKey } });
    setAttendanceRows(Array.isArray(res.data?.items) ? res.data.items : []);
    setAttendanceTitle(res.data?.title || "");
  };

  useEffect(() => {
    const run = async () => {
      try {
        setBusy(true);
        await Promise.all([loadTeam(), loadAttendance(attendanceDate)]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [teamIdNum]);

  useEffect(() => {
    const run = async () => {
      try {
        await loadAttendance(attendanceDate);
      } catch (err) {
        toast.error(normalizeError(err, "Грешка при зареждане на присъствието."));
      }
    };
    run();
  }, [attendanceDate]);

  const loadDayTraining = async () => {
    if (!teamIdNum || !attendanceDate) {
      setDayTraining(null);
      return;
    }
    try {
      setDayTrainingLoading(true);
      const res = await axiosInstance.get(API_PATHS.AI_TRAINING_FOR_DAY, {
        params: { team_id: teamIdNum, date: attendanceDate },
      });
      setDayTraining(res.data?.training || null);
    } catch {
      setDayTraining(null);
    } finally {
      setDayTrainingLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      await loadDayTraining();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [teamIdNum, attendanceDate]);

  const generateHref = () => {
    const p = new URLSearchParams();
    p.set("team_id", String(teamIdNum));
    p.set("date", attendanceDate);
    if (attendanceTitle) p.set("title", attendanceTitle);
    return `/ai-generator?${p.toString()}`;
  };

  const quickSetAllAttendance = (status) => {
    setAttendanceRows((prev) => prev.map((x) => ({ ...x, status })));
  };

  const quickToggleRow = (athleteId, status) => {
    setAttendanceRows((prev) => prev.map((x) => (x.athlete_id === athleteId ? { ...x, status } : x)));
  };

  const saveAttendance = async () => {
    if (!teamIdNum || !attendanceDate) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.TEAM_ATTENDANCE_SAVE(teamIdNum), {
        date: attendanceDate,
        title: attendanceTitle || null,
        items: attendanceRows.map((r) => ({
          athlete_id: r.athlete_id,
          status: r.status || "present",
          note: r.note || null,
        })),
      });
      toast.success("Присъствието е запазено.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на присъствието."));
    } finally {
      setBusy(false);
    }
  };

  if (!team) {
    return (
      <div className="uiPage">
        <PageHero title="Присъствие" subtitle="Отборът не е намерен или нямаш достъп." actions={<Link to="/teams"><Button variant="secondary">Назад</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title={`Присъствие: ${team.name}`}
        subtitle="Отделен екран за дата, бързо маркиране и запис."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link to={`/teams/${teamIdNum}/report`}>
              <Button>Отчет</Button>
            </Link>
            <Link to={`/teams/${teamIdNum}`}>
              <Button variant="secondary">Назад към отбора</Button>
            </Link>
          </div>
        }
      />

      <Card title="Маркиране на присъствие">
        <div className="teamAttendanceSticky">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
            <Button size="sm" variant="secondary" type="button" onClick={() => setAttendanceDate(todayKey())}>
              Днес
            </Button>
            <Button size="sm" type="button" onClick={() => quickSetAllAttendance("present")}>
              Всички: присъстват
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => quickSetAllAttendance("absent")}>
              Всички: отсъстват
            </Button>
            <Button size="sm" disabled={busy || attendanceRows.length === 0} onClick={saveAttendance}>
              Запази
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={busy || !attendanceDate}
              onClick={() => setSessionAdjustOpen(true)}
            >
              Отмени / коригирай тренировката
            </Button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
          <Input placeholder="Заглавие на тренировка (по желание)" value={attendanceTitle} onChange={(e) => setAttendanceTitle(e.target.value)} />
          <div className="teamAttendanceDesktop" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
            <Button disabled={busy || attendanceRows.length === 0} onClick={saveAttendance}>
              Запази присъствие
            </Button>
          </div>
        </div>

        {attendanceRows.length === 0 ? (
          <EmptyState title="Няма избрани състезатели" description="Добави състезатели в отбора, за да отбелязваш присъствие." />
        ) : (
          <>
            <div className="teamAttendanceMobile">
              {attendanceRows.map((row) => (
                <div key={row.athlete_id} className="teamAttendanceCard">
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {row.athlete_name}
                    {row.parent_absence_notice ? (
                      <span className="uiBadge uiBadge--warning teamAttendanceParentNotice" title={row.parent_absence_note || "Родителят е съобщил за отсъствие"}>
                        Извинение от родител
                      </span>
                    ) : null}
                  </div>
                  <div className="teamAttendanceQuickRow">
                    {(["present", "late", "absent", "excused"]).map((st) => (
                      <Button
                        key={st}
                        size="sm"
                        variant={String(row.status || "present") === st ? "primary" : "secondary"}
                        type="button"
                        onClick={() => quickToggleRow(row.athlete_id, st)}
                      >
                        {shortStatusLabel(st)}
                      </Button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Input
                      placeholder="Бележка"
                      value={row.note || ""}
                      onChange={(e) =>
                        setAttendanceRows((prev) =>
                          prev.map((x) => (x.athlete_id === row.athlete_id ? { ...x, note: e.target.value } : x))
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="teamAttendanceDesktop">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Бележка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRows.map((row) => (
                    <TableRow key={row.athlete_id}>
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span>{row.athlete_name}</span>
                          {row.parent_absence_notice ? (
                            <span
                              className="uiBadge uiBadge--warning teamAttendanceParentNotice"
                              title={row.parent_absence_note || "Родителят е съобщил за отсъствие"}
                            >
                              Извинение от родител
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select
                            className="uiInput"
                            value={row.status || "present"}
                            onChange={(e) =>
                              setAttendanceRows((prev) =>
                                prev.map((x) => (x.athlete_id === row.athlete_id ? { ...x, status: e.target.value } : x))
                              )
                            }
                          >
                            <option value="present">Присъства</option>
                            <option value="late">Закъсня</option>
                            <option value="absent">Отсъства</option>
                            <option value="excused">Извинен</option>
                          </select>
                          <Button size="sm" variant="ghost" type="button" onClick={() => quickToggleRow(row.athlete_id, "present")}>
                            + Присъства
                          </Button>
                          <Button size="sm" variant="ghost" type="button" onClick={() => quickToggleRow(row.athlete_id, "absent")}>
                            + Отсъства
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Бележка"
                          value={row.note || ""}
                          onChange={(e) =>
                            setAttendanceRows((prev) =>
                              prev.map((x) => (x.athlete_id === row.athlete_id ? { ...x, note: e.target.value } : x))
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Card title="Тренировка за деня">
        {dayTrainingLoading ? (
          <p className="uiMuted" style={{ margin: 0 }}>Проверка…</p>
        ) : dayTraining ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              Има генерирана тренировка: <strong>{dayTraining.title}</strong>
            </span>
            <Link to={`/trainings/${dayTraining.id}`}>
              <Button>Продължи с тренировката →</Button>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="uiMuted">Няма генерирана тренировка за този ден.</span>
            <Link to={generateHref()}>
              <Button variant="secondary">Генерирай сега</Button>
            </Link>
          </div>
        )}
      </Card>

      <TrainingSessionAdjustModal
        open={sessionAdjustOpen}
        onClose={() => setSessionAdjustOpen(false)}
        teamId={teamIdNum}
        date={attendanceDate}
        isHeadCoach={isHeadCoach}
        currentUserId={currentUserId}
        coaches={coaches}
        onSaved={() => {}}
      />
    </div>
  );
}
