import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на профила.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на профила.";
};

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "-";
};

const statusBadgeClass = (value) => {
  if (value === "present") return "uiBadge--success";
  if (value === "late") return "uiBadge--warning";
  if (value === "absent") return "uiBadge--danger";
  if (value === "excused") return "uiBadge--secondary";
  return "uiBadge--secondary";
};

export default function TeamAthleteProfile() {
  const { athleteId } = useParams();
  const location = useLocation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const fromPath = new URLSearchParams(location.search).get("from") || "/teams";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteId));
        if (!cancelled) setProfile(res.data || null);
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  if (loading) {
    return (
      <div className="uiPage">
        <PageHero title="Профил състезател" subtitle="Зареждане..." />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="uiPage">
        <PageHero title="Профил състезател" subtitle="Данните не са налични." />
        <EmptyState title="Няма данни" description="Състезателят не е намерен или нямате достъп." />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title={`Профил: ${profile.athlete_name}`}
        subtitle="Присъствие, отбори и последни плащания на едно място."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button as={Link} to={`/monthly-fees?athlete_id=${profile.athlete_id}`} variant="primary">
              Месечни такси и плащане
            </Button>
            <Link to={fromPath}>
              <Button variant="secondary">Назад към Отбори</Button>
            </Link>
          </div>
        }
      />

      <Card title="Основни данни">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div><strong>Състезател:</strong> {profile.athlete_name}</div>
          <div><strong>Родител:</strong> {profile.parent_name || "-"}</div>
          <div><strong>Телефон родител:</strong> {profile.parent_phone || "-"}</div>
          <div><strong>Телефон състезател:</strong> {profile.athlete_phone || "-"}</div>
          <div>
            <strong>Статус:</strong>{" "}
            <span className={`uiBadge ${profile.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
              {profile.is_active ? "Активен" : "Неактивен"}
            </span>
          </div>
          <div><strong>Отбори:</strong> {(profile.teams || []).join(", ") || "-"}</div>
        </div>
      </Card>

      <Card title="Обобщение на присъствие">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="uiBadge uiBadge--success">Присъства: {profile.attendance_summary?.present || 0}</span>
          <span className="uiBadge uiBadge--warning">Закъсня: {profile.attendance_summary?.late || 0}</span>
          <span className="uiBadge uiBadge--danger">Отсъства: {profile.attendance_summary?.absent || 0}</span>
          <span className="uiBadge uiBadge--secondary">Извинен: {profile.attendance_summary?.excused || 0}</span>
          <span className="uiBadge uiBadge--info">Процент: {profile.attendance_summary?.attendance_rate_percent || 0}%</span>
        </div>
      </Card>

      <Card title="Последни присъствия">
        {(profile.last_attendance || []).length === 0 ? (
          <EmptyState title="Няма присъствия" description="Все още няма записани тренировки за този състезател." />
        ) : (
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
                <TableRow key={`${row.date}-${row.team_name}-${idx}`}>
                  <TableCell>{row.date || "-"}</TableCell>
                  <TableCell>{row.team_name || "-"}</TableCell>
                  <TableCell>
                    <span className={`uiBadge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title="Последни плащания (Месечни такси)">
        {(profile.monthly_payments || []).length === 0 ? (
          <EmptyState title="Няма плащания" description="Все още няма записани плащания за този състезател." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месец</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Дата на плащане</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profile.monthly_payments || []).map((row) => (
                <TableRow key={`${row.month_key}-${row.paid_at || ""}`}>
                  <TableCell>{row.month_key}</TableCell>
                  <TableCell>{Number(row.amount || 0).toFixed(2)} лв.</TableCell>
                  <TableCell>{row.paid_at ? new Date(row.paid_at).toLocaleString("bg-BG") : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
