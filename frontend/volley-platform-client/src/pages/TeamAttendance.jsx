import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
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

export default function TeamAttendance() {
  const { teamId } = useParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(todayKey());
  const [attendanceTitle, setAttendanceTitle] = useState("");
  const [attendanceRows, setAttendanceRows] = useState([]);

  const teamIdNum = Number(teamId);

  const loadTeam = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeam(list.find((x) => x.id === teamIdNum) || null);
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
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 12 }}>
          <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
          <Input placeholder="Заглавие на тренировка (по желание)" value={attendanceTitle} onChange={(e) => setAttendanceTitle(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
            <Button disabled={busy || attendanceRows.length === 0} onClick={saveAttendance}>Запази присъствие</Button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button size="sm" onClick={() => quickSetAllAttendance("present")}>Бързо: всички присъстват</Button>
          <Button size="sm" variant="secondary" onClick={() => quickSetAllAttendance("absent")}>Бързо: всички отсъстват</Button>
        </div>

        {attendanceRows.length === 0 ? (
          <EmptyState title="Няма избрани състезатели" description="Добави състезатели в отбора, за да отбелязваш присъствие." />
        ) : (
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
                  <TableCell>{row.athlete_name}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                      <Button size="sm" variant="ghost" onClick={() => quickToggleRow(row.athlete_id, "present")}>+ Присъства</Button>
                      <Button size="sm" variant="ghost" onClick={() => quickToggleRow(row.athlete_id, "absent")}>+ Отсъства</Button>
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
        )}
      </Card>
    </div>
  );
}
