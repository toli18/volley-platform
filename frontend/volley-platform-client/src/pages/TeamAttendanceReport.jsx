import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { normalizeError } from "../utils/normalizeError";

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function TeamAttendanceReport() {
  const { teamId } = useParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState(null);
  const [reportPeriod, setReportPeriod] = useState({ from_date: todayKey(), to_date: todayKey() });
  const [attendanceReport, setAttendanceReport] = useState(null);

  const teamIdNum = Number(teamId);

  const loadTeam = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeam(list.find((x) => x.id === teamIdNum) || null);
  };

  const loadAttendanceReport = async (fromDate, toDate) => {
    if (!teamIdNum || !fromDate || !toDate) {
      setAttendanceReport(null);
      return;
    }
    const res = await axiosInstance.get(API_PATHS.TEAM_ATTENDANCE_REPORT(teamIdNum), {
      params: { from_date: fromDate, to_date: toDate },
    });
    setAttendanceReport(res.data || null);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setBusy(true);
        await Promise.all([loadTeam(), loadAttendanceReport(reportPeriod.from_date, reportPeriod.to_date)]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [teamIdNum]);

  useEffect(() => {
    if (!teamIdNum || !reportPeriod.from_date || !reportPeriod.to_date) return;
    const run = async () => {
      try {
        await loadAttendanceReport(reportPeriod.from_date, reportPeriod.to_date);
      } catch (err) {
        toast.error(normalizeError(err, "Грешка при зареждане на отчета."));
      }
    };
    run();
  }, [teamIdNum, reportPeriod.from_date, reportPeriod.to_date]);

  if (!team) {
    return (
      <div className="uiPage">
        <PageHero title="Отчет присъствие" subtitle="Отборът не е намерен или нямаш достъп." actions={<Link to="/coach/teams"><Button variant="secondary">Назад</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title={`Отчет присъствие: ${team.name}`}
        subtitle="Отделен екран за анализ по период."
        actions={
          <div className="heroActionsWrap">
            <Link to={`/teams/${teamIdNum}/attendance`}>
              <Button>Към присъствие</Button>
            </Link>
            <Link to={`/teams/${teamIdNum}`}>
              <Button variant="secondary">Назад към отбора</Button>
            </Link>
          </div>
        }
      />

      <Card title="Период">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Input
            type="date"
            value={reportPeriod.from_date}
            onChange={(e) => setReportPeriod((p) => ({ ...p, from_date: e.target.value }))}
          />
          <Input
            type="date"
            value={reportPeriod.to_date}
            onChange={(e) => setReportPeriod((p) => ({ ...p, to_date: e.target.value }))}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="uiBadge uiBadge--info">Тренировки: {attendanceReport?.sessions_count || 0}</span>
            {busy ? <span className="uiBadge">Зареждане...</span> : null}
          </div>
        </div>
      </Card>

      <Card title="Данни за периода">
        {!attendanceReport || (attendanceReport.rows || []).length === 0 ? (
          <EmptyState title="Няма данни за периода" description="Промени периода или добави присъствия за избрания отбор." />
        ) : (
          <>
            <div className="teamReportDesktop">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Присъства</TableHead>
                    <TableHead>Закъсня</TableHead>
                    <TableHead>Отсъства</TableHead>
                    <TableHead>Извинен</TableHead>
                    <TableHead>Общо</TableHead>
                    <TableHead>% посещаемост</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(attendanceReport.rows || []).map((row) => (
                    <TableRow key={row.athlete_id}>
                      <TableCell>{row.athlete_name}</TableCell>
                      <TableCell>{row.present}</TableCell>
                      <TableCell>{row.late}</TableCell>
                      <TableCell>{row.absent}</TableCell>
                      <TableCell>{row.excused}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${row.attendance_rate_percent >= 80 ? "uiBadge--success" : row.attendance_rate_percent >= 60 ? "uiBadge--warning" : "uiBadge--danger"}`}>
                          {row.attendance_rate_percent}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="teamReportMobile">
              {(attendanceReport.rows || []).map((row) => (
                <article key={`mr-${row.athlete_id}`} className="teamReportCard">
                  <div className="teamReportCardTop">
                    <strong>{row.athlete_name}</strong>
                    <span className={`uiBadge ${row.attendance_rate_percent >= 80 ? "uiBadge--success" : row.attendance_rate_percent >= 60 ? "uiBadge--warning" : "uiBadge--danger"}`}>
                      {row.attendance_rate_percent}%
                    </span>
                  </div>
                  <div className="teamReportGrid">
                    <span>Присъства: {row.present}</span>
                    <span>Закъсня: {row.late}</span>
                    <span>Отсъства: {row.absent}</span>
                    <span>Извинен: {row.excused}</span>
                  </div>
                  <div className="teamReportTotal">Общо тренировки: {row.total}</div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
