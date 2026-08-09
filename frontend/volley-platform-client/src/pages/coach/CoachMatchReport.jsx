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

function pctLabel(v) {
  if (v == null) return "—";
  return `${v}%`;
}

function SideOutCards({ sideOut }) {
  if (!sideOut) return null;
  const hasAny =
    (sideOut.side_out_attempts || 0) + (sideOut.break_attempts || 0) + (sideOut.points_for || 0) > 0;
  if (!hasAny) return null;
  return (
    <div className="matchReportSideOut">
      <div className="matchReportSideOutCard">
        <span className="matchReportSideOutLabel">Side-out</span>
        <strong>
          {sideOut.side_out_won || 0}/{sideOut.side_out_attempts || 0}
        </strong>
        <span className="matchReportSideOutPct">{pctLabel(sideOut.side_out_pct)}</span>
        <span className="matchReportSideOutHint">точки при посрещане</span>
      </div>
      <div className="matchReportSideOutCard">
        <span className="matchReportSideOutLabel">Break-point</span>
        <strong>
          {sideOut.break_won || 0}/{sideOut.break_attempts || 0}
        </strong>
        <span className="matchReportSideOutPct">{pctLabel(sideOut.break_pct)}</span>
        <span className="matchReportSideOutHint">точки при наш сервис</span>
      </div>
      <div className="matchReportSideOutCard">
        <span className="matchReportSideOutLabel">Точки</span>
        <strong>
          {sideOut.points_for || 0}:{sideOut.points_against || 0}
        </strong>
        <span className="matchReportSideOutPct">
          {(sideOut.points_for || 0) - (sideOut.points_against || 0) >= 0 ? "+" : ""}
          {(sideOut.points_for || 0) - (sideOut.points_against || 0)}
        </span>
        <span className="matchReportSideOutHint">за нас : противник</span>
      </div>
    </div>
  );
}

function RotationTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="matchReportRotation">
      <h3>По ротация</h3>
      <div className="matchReportTableWrap">
        <table className="matchLiveStatTable matchReportTable">
          <thead>
            <tr>
              <th>R</th>
              <th title="Точки за нас">За нас</th>
              <th title="Точки против">Срещу</th>
              <th title="Разлика">Diff</th>
              <th title="Side-out">SO</th>
              <th title="Side-out %">SO%</th>
              <th title="Break-point">BP</th>
              <th title="Break-point %">BP%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rotation} className={row.point_diff > 0 ? "is-good" : row.point_diff < 0 ? "is-bad" : ""}>
                <td>
                  <strong>R{row.rotation}</strong>
                </td>
                <td>{cell(row.points_for)}</td>
                <td>{cell(row.points_against)}</td>
                <td>
                  {row.point_diff > 0 ? "+" : ""}
                  {row.point_diff}
                </td>
                <td>
                  {row.side_out_won || 0}/{row.side_out_attempts || 0}
                </td>
                <td>{pctLabel(row.side_out_pct)}</td>
                <td>
                  {row.break_won || 0}/{row.break_attempts || 0}
                </td>
                <td>{pctLabel(row.break_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function playerLabel(jersey, name) {
  const short = shortPlayerName(name) || name || "—";
  return jersey ? `#${jersey} ${short}` : short;
}

function SubstitutionsList({ rows, showSet = true }) {
  if (!rows?.length) {
    return (
      <div className="matchReportSubs">
        <h3>Смени</h3>
        <p className="coachMobileMuted">Няма записани смени.</p>
      </div>
    );
  }
  return (
    <div className="matchReportSubs">
      <h3>Смени ({rows.length})</h3>
      <ol className="matchReportSubsList">
        {rows.map((row) => (
          <li key={row.id || `${row.set_number}-${row.out_athlete_id}-${row.in_athlete_id}-${row.our_score}`}>
            <span className="matchReportSubsMeta">
              {showSet ? `G${row.set_number} · ` : ""}
              {row.our_score}:{row.opp_score}
              {row.rotation ? ` · R${row.rotation}` : ""}
            </span>
            <span className="matchReportSubsSwap">
              <span className="matchReportSubsOut">{playerLabel(row.out_jersey, row.out_athlete_name)}</span>
              <span className="matchReportSubsArrow" aria-hidden>
                →
              </span>
              <span className="matchReportSubsIn">{playerLabel(row.in_jersey, row.in_athlete_name)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
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
            <th title="Атака 0 (продължава)">Ат0</th>
            <th title="Грешки атака">Ат−</th>
            <th title="% атака (точки / опити)">Ат%</th>
            <th title="Асове">Ас</th>
            <th title="Грешки сервис">Ср−</th>
            <th title="Блок">Бл</th>
            <th title="Защита">Защ</th>
            <th title="Посрещане #">#</th>
            <th title="Посрещане +">+</th>
            <th title="Посрещане −">−</th>
            <th title="Грешка посрещане">П−</th>
            <th title="Средно посрещане">Поср</th>
            <th title="Отборна грешка">Отб−</th>
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
              <td>{cell(row.attack_zero)}</td>
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
              <td>{cell(row.team_err)}</td>
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

  const activeSet = useMemo(() => {
    if (!report || tab === "all") return null;
    const setNum = Number(String(tab).replace("set:", ""));
    return (report.by_set || []).find((s) => Number(s.set_number) === setNum) || null;
  }, [report, tab]);

  const rows = useMemo(() => {
    if (!report) return [];
    if (tab === "all") return report.athletes || [];
    return activeSet?.athletes || [];
  }, [report, tab, activeSet]);

  const sideOut = tab === "all" ? report?.side_out : activeSet?.side_out;
  const byRotation = tab === "all" ? report?.by_rotation : activeSet?.by_rotation;
  const substitutions = tab === "all" ? report?.substitutions : activeSet?.substitutions;

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

      <SideOutCards sideOut={sideOut} />
      <RotationTable rows={byRotation} />
      <SubstitutionsList rows={substitutions || []} showSet={tab === "all"} />

      <h3 className="matchReportPlayersTitle">По състезател</h3>
      <StatTable rows={rows} />
    </section>
  );
}
