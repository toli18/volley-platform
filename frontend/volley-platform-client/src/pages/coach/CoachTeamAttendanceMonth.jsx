import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { loadTeamAttendanceMatrix } from "../../utils/teamAttendanceMatrix";
import { Button, EmptyState } from "../../components/ui";

const monthKeyNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const STATUS_SYMBOL = {
  present: { label: "✓", className: "coachAttMatrixCell--present", title: "Присъства" },
  late: { label: "З", className: "coachAttMatrixCell--late", title: "Закъсня" },
  absent: { label: "—", className: "coachAttMatrixCell--absent", title: "Отсъства" },
  excused: { label: "И", className: "coachAttMatrixCell--excused", title: "Извинен" },
};

export default function CoachTeamAttendanceMonth() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const teamIdNum = Number(teamId);
  const [monthKey, setMonthKey] = useState(monthKeyNow());
  const [teamName, setTeamName] = useState("");
  const [matrix, setMatrix] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const teamsRes = await axiosInstance.get(API_PATHS.TEAMS_LIST);
        const { matrix: data, usedFallback: fallback, error: loadError } = await loadTeamAttendanceMatrix(
          axiosInstance,
          teamIdNum,
          monthKey
        );
        if (!alive) return;
        const teams = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        const team = teams.find((t) => t.id === teamIdNum);
        setTeamName(team?.name || `Отбор #${teamIdNum}`);
        setMatrix(data);
        setUsedFallback(Boolean(fallback));
        setError(loadError || "");
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Грешка при зареждане на присъствието.");
        setMatrix(null);
        setUsedFallback(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamIdNum, monthKey]);

  const statusMap = useMemo(() => {
    const map = new Map();
    for (const c of matrix?.cells || []) {
      map.set(`${c.athlete_id}:${c.session_id}`, c.status);
    }
    return map;
  }, [matrix]);

  const openSession = (session) => {
    const title = encodeURIComponent(session.label || "Тренировка");
    navigate(`/teams/${teamIdNum}/attendance?date=${encodeURIComponent(session.date)}&title=${title}`);
  };

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;

  const athletes = matrix?.athletes || [];
  const sessions = matrix?.sessions || [];

  return (
    <div className="coachMobilePage coachMobilePage--attMatrix">
      <div className="coachAttMatrixHead">
        <Link to="/coach/attendance" className="coachMobileQuickBtn coachAttMatrixBack">
          ← Отбори
        </Link>
        <h2 className="coachMobileHubTeamName">{teamName}</h2>
        <label className="coachAttMatrixMonth">
          <span className="coachMobileMuted">Месец</span>
          <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
        </label>
      </div>

      {usedFallback ? (
        <p className="coachMobileMuted coachAttMatrixFallbackNote">
          Прегледът е събран от дневните записи. След обновяване на сървъра таблицата ще се зарежда по-бързо.
        </p>
      ) : null}

      <div className="coachAttMatrixLegend">
        <span className="coachAttMatrixLegendItem coachAttMatrixCell--present">✓ Присъства</span>
        <span className="coachAttMatrixLegendItem coachAttMatrixCell--late">З Закъсня</span>
        <span className="coachAttMatrixLegendItem coachAttMatrixCell--absent">— Отсъства</span>
        <span className="coachAttMatrixLegendItem coachAttMatrixCell--excused">И Извинен</span>
        <span className="coachAttMatrixLegendItem coachAttMatrixCell--empty">· Няма запис</span>
      </div>

      {athletes.length === 0 ? (
        <EmptyState title="Няма състезатели" description="Добави състав към отбора, за да водиш присъствие." />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="Няма тренировки с присъствие"
          description="За този месец няма записани сесии. Маркирай присъствие от „Днес“ или от графика."
        />
      ) : (
        <div className="coachAttMatrixWrap">
          <table className="coachAttMatrixTable">
            <thead>
              <tr>
                <th className="coachAttMatrixStickyCol">Състезател</th>
                {sessions.map((s) => (
                  <th key={s.session_id} className="coachAttMatrixSessionCol">
                    <button type="button" className="coachAttMatrixSessionBtn" onClick={() => openSession(s)} title="Редакция за целия ден">
                      {s.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => (
                <tr key={a.athlete_id}>
                  <th className="coachAttMatrixStickyCol coachAttMatrixAthleteName">{a.athlete_name}</th>
                  {sessions.map((s) => {
                    const st = statusMap.get(`${a.athlete_id}:${s.session_id}`);
                    const meta = st ? STATUS_SYMBOL[st] : null;
                    return (
                      <td key={s.session_id}>
                        <button
                          type="button"
                          className={`coachAttMatrixCell${meta ? ` ${meta.className}` : " coachAttMatrixCell--empty"}`}
                          title={meta?.title || "Няма запис — отвори деня"}
                          onClick={() => openSession(s)}
                        >
                          {meta?.label || "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => navigate(`/teams/${teamIdNum}/report`)}>
        Обобщен отчет (период)
      </Button>
    </div>
  );
}
