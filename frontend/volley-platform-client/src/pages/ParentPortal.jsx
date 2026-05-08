import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusBadgeClass = (value) => {
  if (value === "present") return "uiBadge--success";
  if (value === "late") return "uiBadge--warning";
  if (value === "absent") return "uiBadge--danger";
  if (value === "excused") return "uiBadge--secondary";
  return "uiBadge--secondary";
};

export default function ParentPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.PARENT_PORTAL_GET(token));
        if (!cancelled) setProfile(res.data || null);
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Линкът е невалиден или изтекъл.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="uiPage">
      <PageHero
        title={profile ? `Профил на състезател: ${profile.athlete_name}` : "Родителски портал"}
        subtitle="Информация за присъствие, месечен график и платени такси."
      />

      {loading ? <Card title="Зареждане..."><p>Моля, изчакай...</p></Card> : null}
      {!loading && error ? <EmptyState title="Достъпът е отказан" description={error} /> : null}

      {!loading && !error && profile ? (
        <>
          <Card title="Обща информация">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="uiBadge">Отбори: {(profile.teams || []).join(", ") || "—"}</span>
              <span className="uiBadge">Родител: {profile.parent_name || "—"}</span>
              <span className="uiBadge">Телефон: {profile.parent_phone || "—"}</span>
            </div>
          </Card>

          <Card title="Присъствие">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="uiBadge uiBadge--success">Присъства: {profile.attendance_summary?.present || 0}</span>
              <span className="uiBadge uiBadge--warning">Закъсня: {profile.attendance_summary?.late || 0}</span>
              <span className="uiBadge uiBadge--danger">Отсъства: {profile.attendance_summary?.absent || 0}</span>
              <span className="uiBadge uiBadge--secondary">Извинен: {profile.attendance_summary?.excused || 0}</span>
              <span className="uiBadge uiBadge--info">Процент: {profile.attendance_summary?.attendance_rate_percent || 0}%</span>
            </div>
            {(profile.last_attendance || []).length === 0 ? (
              <EmptyState title="Няма записани присъствия" description="Ще се показват след маркиране от треньора." />
            ) : (
              <div className="parentPortalTableWrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Отбор</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(profile.last_attendance || []).map((row, idx) => (
                    <TableRow key={`${row.date}-${idx}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.team_name || "—"}</TableCell>
                      <TableCell>
                        <span className={`uiBadge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </Card>

          <Card title="График за текущия месец">
            {(profile.monthly_schedule || []).length === 0 ? (
              <EmptyState title="Няма тренировки за този месец" description="Когато треньорът добави тренировки, ще ги виждате тук." />
            ) : (
              <div className="parentPortalTableWrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Час</TableHead>
                    <TableHead>Отбор</TableHead>
                    <TableHead>Зала</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(profile.monthly_schedule || []).map((row, idx) => (
                    <TableRow key={`${row.date}-${row.start_time}-${idx}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.start_time} - {row.end_time}</TableCell>
                      <TableCell>{row.team_name || "—"}</TableCell>
                      <TableCell>{row.location || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </Card>

          <Card title="Такси (последни 12 месеца)">
            <div className="parentPortalTableWrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Месец</TableHead>
                  <TableHead>Сума</TableHead>
                  <TableHead>Платено</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profile.monthly_payments || []).map((row) => (
                  <TableRow key={row.month_key}>
                    <TableCell>{row.month_key}</TableCell>
                    <TableCell>{row.paid ? `${Number(row.amount || 0).toFixed(2)} лв.` : "—"}</TableCell>
                    <TableCell>
                      <span className={`uiBadge ${row.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                        {row.paid ? "Да" : "Не"}
                      </span>
                    </TableCell>
                    <TableCell>{row.paid_at ? new Date(row.paid_at).toLocaleString("bg-BG") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
