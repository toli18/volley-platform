import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { MATCH_FORMATS, MATCH_STATUS_LABEL, positionShort, shortPlayerName } from "../../utils/matchPositions";
import { EmptyState } from "../../components/ui";
import { normalizeError } from "../../utils/normalizeError";

function cell(v) {
  if (v == null || v === "" || v === 0) return "·";
  return v;
}

function StatTable({ rows }) {
  if (!rows?.length) {
    return <p className="coachMobileMuted">Няма записи за този изглед.</p>;
  }
  return (
    <div className="matchReportTableWrap">
      <table className="matchLiveStatTable matchReportTable">
        <thead>
          <tr>
            <th>#</th>
            <th>Име</th>
            <th>Поз</th>
            <th title="Точки (атака+ас+блок)">Тч</th>
            <th title="Точки атака">Ат+</th>
            <th title="Грешки атака">Ат−</th>
            <th title="% атака">Ат%</th>
            <th title="Асове">Ас</th>
            <th title="Грешки сервис">Ср−</th>
            <th title="Блок">Бл</th>
            <th title="Защита">Защ</th>
            <th title="Посрещане #">#</th>
            <th title="Посрещане +">+</th>
            <th title="Посрещане −">−</th>
            <th title="Грешка посрещане">П−</th>
            <th title="Средно посрещане">Поср</th>
            <th>Гр</th>
            <th>Разтълкуване</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.athlete_id}>
              <td>{row.jersey_number}</td>
              <td className="matchLiveStatTableName">{shortPlayerName(row.athlete_name) || row.athlete_name}</td>
              <td>{positionShort(row.position)}</td>
              <td>{cell(row.points)}</td>
              <td>{cell(row.kills)}</td>
              <td>{cell(row.attack_err)}</td>
              <td>{row.attack_pct != null ? `${row.attack_pct}%` : "·"}</td>
              <td>{cell(row.aces)}</td>
              <td>{cell(row.serve_err)}</td>
              <td>{cell(row.blocks)}</td>
              <td>{cell(row.digs)}</td>
              <td>{cell(row.pass_hash)}</td>
              <td>{cell(row.pass_plus)}</td>
              <td>{cell(row.pass_minus)}</td>
              <td>{cell(row.pass_err)}</td>
              <td>{row.pass_avg != null ? row.pass_avg : "·"}</td>
              <td>{cell(row.errors)}</td>
              <td className="matchLiveStatTableSum">{row.summary || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoachMatchReport() {
  const { teamId, matchId } = useParams();
  const teamIdNum = Number(teamId);
  const matchIdNum = Number(matchId);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all"); // all | set:N

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.TEAM_MATCH_REPORT(teamIdNum, matchIdNum));
        if (!alive) return;
        setReport(res.data);
      } catch (err) {
        if (!alive) return;
        setError(normalizeError(err, "Неуспешно зареждане на отчета."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamIdNum, matchIdNum]);

  const formatLabel = useMemo(() => {
    const code = report?.format || "bo5";
    return MATCH_FORMATS.find((f) => f.code === code)?.label || "3 от 5";
  }, [report?.format]);

  const rows = useMemo(() => {
    if (!report) return [];
    if (tab === "all") return report.athletes || [];
    const setNum = Number(String(tab).replace("set:", ""));
    const block = (report.by_set || []).find((s) => Number(s.set_number) === setNum);
    return block?.athletes || [];
  }, [report, tab]);

  if (loading) return <p className="coachMobileMuted">Зареждане на отчет...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;
  if (!report) return null;

  const wonLabel =
    report.match_won_by === "us" ? "Победа" : report.match_won_by === "opp" ? "Загуба" : MATCH_STATUS_LABEL[report.status] || report.status;

  return (
    <section className="matchReportPage">
      <div className="matchReportTop">
        <Link to={`/coach/teams/${teamIdNum}/matches`} className="matchLiveBack">
          ← Мачове
        </Link>
        <div className="matchReportMeta">
          <h2>vs {report.opponent_name || "противник"}</h2>
          <p>
            {formatLabel} · {report.sets_won_us}:{report.sets_won_opp} · {wonLabel} · {report.system}
            {report.match_date ? ` · ${report.match_date}` : ""}
            {report.venue ? ` · ${report.venue}` : ""}
          </p>
        </div>
        <div className="matchReportTopActions">
          <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchReportLinkBtn">
            Настройки
          </Link>
          {report.status !== "finished" ? (
            <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}/live`} className="matchReportLinkBtn matchReportLinkBtn--live">
              Live
            </Link>
          ) : null}
        </div>
      </div>

      {(report.sets || []).length > 0 ? (
        <div className="matchLiveSetStrip" aria-label="Резултат по геймове">
          {(report.sets || []).map((s) => (
            <span key={s.set_number} className={s.status === "finished" ? "is-done" : "is-live"}>
              G{s.set_number} {s.our_score}:{s.opp_score}
            </span>
          ))}
        </div>
      ) : null}

      <div className="matchReportInsights">
        <h3>Изводи</h3>
        <ul>
          {(report.insights || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="matchReportEventCount">{report.event_count || 0} записани действия</p>
      </div>

      <div className="matchReportTabs" role="tablist" aria-label="Филтър по гейм">
        <button
          type="button"
          role="tab"
          className={tab === "all" ? "is-active" : ""}
          aria-selected={tab === "all"}
          onClick={() => setTab("all")}
        >
          Целият мач
        </button>
        {(report.by_set || []).map((s) => (
          <button
            key={s.set_number}
            type="button"
            role="tab"
            className={tab === `set:${s.set_number}` ? "is-active" : ""}
            aria-selected={tab === `set:${s.set_number}`}
            onClick={() => setTab(`set:${s.set_number}`)}
          >
            Гейм {s.set_number}
          </button>
        ))}
      </div>

      <StatTable rows={rows} />
    </section>
  );
}
