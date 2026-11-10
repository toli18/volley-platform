import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { MATCH_FORMATS, MATCH_STATUS_LABEL, positionShort, shortPlayerName } from "../../utils/matchPositions";
import {
  attackEffPct,
  blockTotal,
  buildInsightChips,
  digTotal,
  fmtCell,
  fmtDiff,
  fmtPct,
  num,
  passPerfPct,
  passPosPct,
  serveTotal,
  sumAthletes,
} from "../../utils/matchReportMetrics";
import { openMatchReportPdf } from "../../utils/matchReportPdf";
import { EmptyState } from "../../components/ui";
import { normalizeError } from "../../utils/normalizeError";

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
        <span className="matchReportSideOutPct">{fmtPct(sideOut.side_out_pct)}</span>
        <span className="matchReportSideOutHint">точки при посрещане</span>
      </div>
      <div className="matchReportSideOutCard">
        <span className="matchReportSideOutLabel">Break Point</span>
        <strong>
          {sideOut.break_won || 0}/{sideOut.break_attempts || 0}
        </strong>
        <span className="matchReportSideOutPct">{fmtPct(sideOut.break_pct)}</span>
        <span className="matchReportSideOutHint">точки при наш сервис</span>
      </div>
      <div className="matchReportSideOutCard">
        <span className="matchReportSideOutLabel">Точки</span>
        <strong>
          {sideOut.points_for || 0}:{sideOut.points_against || 0}
        </strong>
        <span className="matchReportSideOutPct">{fmtDiff(num(sideOut.points_for) - num(sideOut.points_against))}</span>
        <span className="matchReportSideOutHint">за нас : противник</span>
      </div>
    </div>
  );
}

function RotationStrip({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="matchReportRotation">
      <div className="matchReportSectionHead">
        <h3>Ротации</h3>
        <span className="matchReportSectionHint">разлика точки за/срещу</span>
      </div>
      <div className="matchReportRotStrip">
        {rows.map((row) => {
          const diff = num(row.point_diff);
          const tone = diff > 0 ? "is-good" : diff < 0 ? "is-bad" : "";
          return (
            <div key={row.rotation} className={`matchReportRotCell ${tone}`}>
              <span className="matchReportRotLab">R{row.rotation}</span>
              <strong>{fmtDiff(diff)}</strong>
              <span className="matchReportRotPts">
                {row.points_for || 0}:{row.points_against || 0}
              </span>
              <span className="matchReportRotSo">
                SO {fmtPct(row.side_out_pct)} · BP {fmtPct(row.break_pct)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function playerLabel(jersey, name) {
  const short = shortPlayerName(name) || name || "·";
  return jersey ? `#${jersey} ${short}` : short;
}

function SubstitutionsList({ rows, showSet = true }) {
  if (!rows?.length) return null;
  return (
    <details className="matchReportSubs" open={rows.length <= 12}>
      <summary>
        Смени <strong>({rows.length})</strong>
      </summary>
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
    </details>
  );
}

function StatTable({ rows }) {
  if (!rows?.length) {
    return <p className="coachMobileMuted">Няма записи за този изглед.</p>;
  }
  const totals = sumAthletes(rows);

  const renderPlayer = (row, key) => (
    <tr key={key}>
      <td>{fmtCell(row.jersey_number)}</td>
      <td className="matchLiveStatTableName">{shortPlayerName(row.athlete_name) || row.athlete_name}</td>
      <td>{positionShort(row.position)}</td>
      <td className="matchReportColStrong">{fmtCell(row.points)}</td>
      <td>{fmtCell(serveTotal(row))}</td>
      <td>{fmtCell(row.serve_err)}</td>
      <td>{fmtCell(row.aces)}</td>
      <td>{fmtCell(row.pass_total)}</td>
      <td>{fmtCell(row.pass_err)}</td>
      <td>{fmtPct(passPosPct(row))}</td>
      <td>{fmtPct(passPerfPct(row))}</td>
      <td>{row.pass_avg != null ? row.pass_avg : "·"}</td>
      <td>{fmtCell(row.attack_attempts)}</td>
      <td>{fmtCell(row.attack_err)}</td>
      <td>{fmtCell(row.kills)}</td>
      <td>{fmtPct(row.attack_pct)}</td>
      <td>{fmtPct(attackEffPct(row))}</td>
      <td>{fmtCell(blockTotal(row))}</td>
      <td>{fmtCell(row.blocks)}</td>
      <td>{fmtCell(row.block_err)}</td>
      <td>{fmtCell(digTotal(row))}</td>
      <td>{fmtCell(row.dig_plus)}</td>
      <td>{fmtCell(row.dig_zero)}</td>
      <td>{fmtCell(row.dig_minus)}</td>
      <td>{fmtCell(row.set_total)}</td>
      <td>{fmtCell(row.set_hash)}</td>
      <td>{fmtCell(row.set_plus)}</td>
      <td>{fmtCell(row.set_minus)}</td>
      <td>{row.set_avg != null ? row.set_avg : "·"}</td>
      <td>{fmtCell(row.errors)}</td>
    </tr>
  );

  return (
    <div className="matchReportTableWrap">
      <table className="matchLiveStatTable matchReportTable matchReportBox">
        <thead>
          <tr className="matchReportGroupRow">
            <th colSpan={3} />
            <th>Тч</th>
            <th colSpan={3}>Сервис</th>
            <th colSpan={5}>Посрещане</th>
            <th colSpan={5}>Атака</th>
            <th colSpan={3}>Блок</th>
            <th colSpan={4}>Защита</th>
            <th colSpan={5}>Вдигане</th>
            <th>Гр</th>
          </tr>
          <tr>
            <th>#</th>
            <th>Име</th>
            <th>Поз</th>
            <th title="Точки (атака + ас + блок)">Tot</th>
            <th title="Общо сервирания">Tot</th>
            <th title="Грешки сервис">Err</th>
            <th title="Асове">Ас</th>
            <th title="Общо посрещания">Tot</th>
            <th title="Грешки посрещане">Err</th>
            <th title="Позитивно (# + +)">Pos%</th>
            <th title="Перфектно (#)">Prf%</th>
            <th title="Средно посрещане">Ср</th>
            <th title="Опити атака">Tot</th>
            <th title="Грешки атака">Err</th>
            <th title="Точки атака">Pt</th>
            <th title="% точки / опити">Pt%</th>
            <th title="Ефективност (точки − грешки) / опити">Eff%</th>
            <th title="Общо блок (точки + touch + грешки)">Tot</th>
            <th title="Блок точки">Pt</th>
            <th title="Грешки блок">Err</th>
            <th title="Общо защита">Tot</th>
            <th title="Защита +">+</th>
            <th title="Защита 0">0</th>
            <th title="Защита −">−</th>
            <th title="Общо вдигания">Tot</th>
            <th title="Вдигане #">#</th>
            <th title="Вдигане +">+</th>
            <th title="Вдигане −">−</th>
            <th title="Средно вдигане">Ср</th>
            <th title="Общо грешки">Tot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => renderPlayer(row, row.athlete_id))}
          <tr className="matchReportTotalsRow">
            <td colSpan={3}>
              <strong>Общо отбор</strong>
            </td>
            <td className="matchReportColStrong">{fmtCell(totals.points)}</td>
            <td>{fmtCell(serveTotal(totals))}</td>
            <td>{fmtCell(totals.serve_err)}</td>
            <td>{fmtCell(totals.aces)}</td>
            <td>{fmtCell(totals.pass_total)}</td>
            <td>{fmtCell(totals.pass_err)}</td>
            <td>{fmtPct(passPosPct(totals))}</td>
            <td>{fmtPct(passPerfPct(totals))}</td>
            <td>{totals.pass_avg != null ? totals.pass_avg : "·"}</td>
            <td>{fmtCell(totals.attack_attempts)}</td>
            <td>{fmtCell(totals.attack_err)}</td>
            <td>{fmtCell(totals.kills)}</td>
            <td>{fmtPct(totals.attack_pct)}</td>
            <td>{fmtPct(attackEffPct(totals))}</td>
            <td>{fmtCell(blockTotal(totals))}</td>
            <td>{fmtCell(totals.blocks)}</td>
            <td>{fmtCell(totals.block_err)}</td>
            <td>{fmtCell(digTotal(totals))}</td>
            <td>{fmtCell(totals.dig_plus)}</td>
            <td>{fmtCell(totals.dig_zero)}</td>
            <td>{fmtCell(totals.dig_minus)}</td>
            <td>{fmtCell(totals.set_total)}</td>
            <td>{fmtCell(totals.set_hash)}</td>
            <td>{fmtCell(totals.set_plus)}</td>
            <td>{fmtCell(totals.set_minus)}</td>
            <td>{totals.set_avg != null ? totals.set_avg : "·"}</td>
            <td>{fmtCell(totals.errors)}</td>
          </tr>
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
  const scopeLabel = tab === "all" ? "Целият мач" : `Гейм ${activeSet?.set_number || ""}`;

  const scopedReport = useMemo(() => {
    if (!report) return null;
    if (tab === "all") return report;
    return {
      ...report,
      athletes: activeSet?.athletes || [],
      opp_errors: activeSet?.opp_errors ?? 0,
      opp_points: activeSet?.opp_points ?? 0,
    };
  }, [report, tab, activeSet]);

  const chips = useMemo(
    () => (scopedReport ? buildInsightChips(scopedReport, { sideOut, byRotation }) : []),
    [scopedReport, sideOut, byRotation]
  );

  if (loading) return <p className="coachMobileMuted">Зареждане на отчет...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;
  if (!report) return null;

  const wonLabel =
    report.match_won_by === "us"
      ? "Победа"
      : report.match_won_by === "opp"
        ? "Загуба"
        : MATCH_STATUS_LABEL[report.status] || report.status;

  const teamTitle = report.team_name || "Наш отбор";

  return (
    <section className="matchReportPage">
      <div className="matchReportTop">
        <Link to={`/coach/teams/${teamIdNum}/matches`} className="matchLiveBack">
          ← Мачове
        </Link>
        <div className="matchReportMeta">
          <p className="matchReportBrand">Volley Platform · Tabellino</p>
          <h2>
            {teamTitle} <span className="matchReportVs">vs</span> {report.opponent_name || "противник"}
          </h2>
          <p className="matchReportScoreLine">
            <strong>
              {report.sets_won_us}:{report.sets_won_opp}
            </strong>{" "}
            · {wonLabel} · {formatLabel} · {report.system}
            {report.match_date ? ` · ${report.match_date}` : ""}
            {report.venue ? ` · ${report.venue}` : ""}
          </p>
        </div>
        <div className="matchReportTopActions">
          <button
            type="button"
            className="matchReportLinkBtn matchReportLinkBtn--pdf"
            onClick={() =>
              openMatchReportPdf({
                report: scopedReport || report,
                athletes: rows,
                sideOut,
                byRotation,
                scopeLabel,
              })
            }
          >
            PDF
          </button>
          <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchReportLinkBtn">
            Настройки
          </Link>
          <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}/video`} className="matchReportLinkBtn">
            Видео
          </Link>
          {report.status !== "finished" ? (
            <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}/live`} className="matchReportLinkBtn matchReportLinkBtn--live">
              Live
            </Link>
          ) : null}
        </div>
      </div>

      {(report.sets || []).length > 0 ? (
        <div className="matchLiveSetStrip matchReportSetStrip" aria-label="Резултат по геймове">
          {(report.sets || []).map((s) => (
            <span key={s.set_number} className={s.status === "finished" ? "is-done" : "is-live"}>
              G{s.set_number} {s.our_score}:{s.opp_score}
            </span>
          ))}
        </div>
      ) : null}

      {chips.length ? (
        <div className="matchReportChips" aria-label="Бързи изводи">
          {chips.map((c) => (
            <div key={c.id} className={`matchReportChip matchReportChip--${c.tone || "neutral"}`}>
              <span className="matchReportChipLabel">{c.label}</span>
              <strong>{c.value}</strong>
              {c.sub ? <span className="matchReportChipSub">{c.sub}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {(report.insights || []).length ? (
        <details className="matchReportInsights">
          <summary>
            Изводи <span className="matchReportEventCount">· {report.event_count || 0} записа</span>
          </summary>
          <ul>
            {(report.insights || []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

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
      <RotationStrip rows={byRotation} />

      <div className="matchReportSectionHead">
        <h3 className="matchReportPlayersTitle">По състезател</h3>
        <span className="matchReportSectionHint">
          Блок Tot = Pt + touch + Err · Защита +/0/− · Pos% = # + + · Eff% = (Pt − Err) / Tot
          {tab === "all" && report.opp_errors
            ? ` · Гр. противник: ${report.opp_errors}`
            : activeSet?.opp_errors
              ? ` · Гр. противник: ${activeSet.opp_errors}`
              : ""}
        </span>
      </div>
      <StatTable rows={rows} />

      <SubstitutionsList rows={substitutions || []} showSet={tab === "all"} />
    </section>
  );
}
