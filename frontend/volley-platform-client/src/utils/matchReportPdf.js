// Print / Save-as-PDF for match box score. Native print (Cyrillic).

import { MATCH_FORMATS, MATCH_STATUS_LABEL, positionShort, shortPlayerName } from "./matchPositions";
import {
  attackEffPct,
  blockTotal,
  digTotal,
  fmtDiff,
  num,
  passPerfPct,
  passPosPct,
  serveTotal,
  sumAthletes,
} from "./matchReportMetrics";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function cell(v) {
  if (v == null || v === "" || v === 0) return "·";
  return esc(v);
}

function pct(v) {
  return v == null ? "·" : esc(`${v}%`);
}

function playerRowsHtml(rows) {
  return rows
    .map((row) => {
      const name = shortPlayerName(row.athlete_name) || row.athlete_name || "";
      return `<tr>
        <td class="num">${cell(row.jersey_number)}</td>
        <td class="name">${esc(name)}</td>
        <td>${esc(positionShort(row.position) || "")}</td>
        <td class="num strong">${cell(row.points)}</td>
        <td class="num">${cell(serveTotal(row))}</td>
        <td class="num">${cell(row.serve_err)}</td>
        <td class="num">${cell(row.aces)}</td>
        <td class="num">${cell(row.pass_total)}</td>
        <td class="num">${cell(row.pass_err)}</td>
        <td class="num">${pct(passPosPct(row))}</td>
        <td class="num">${pct(passPerfPct(row))}</td>
        <td class="num">${row.pass_avg != null ? esc(row.pass_avg) : "·"}</td>
        <td class="num">${cell(row.attack_attempts)}</td>
        <td class="num">${cell(row.attack_err)}</td>
        <td class="num">${cell(row.kills)}</td>
        <td class="num">${pct(row.attack_pct)}</td>
        <td class="num">${pct(attackEffPct(row))}</td>
        <td class="num">${cell(blockTotal(row))}</td>
        <td class="num">${cell(row.blocks)}</td>
        <td class="num">${cell(row.block_err)}</td>
        <td class="num">${cell(digTotal(row))}</td>
        <td class="num">${cell(row.dig_plus)}</td>
        <td class="num">${cell(row.dig_zero)}</td>
        <td class="num">${cell(row.dig_minus)}</td>
        <td class="num">${cell(row.set_total)}</td>
        <td class="num">${cell(row.set_hash)}</td>
        <td class="num">${cell(row.set_plus)}</td>
        <td class="num">${cell(row.set_minus)}</td>
        <td class="num">${row.set_avg != null ? esc(row.set_avg) : "·"}</td>
        <td class="num">${cell(row.errors)}</td>
      </tr>`;
    })
    .join("");
}

function totalsRowHtml(tot) {
  return `<tr class="totals">
    <td colspan="3"><strong>Общо отбор</strong></td>
    <td class="num strong">${cell(tot.points)}</td>
    <td class="num">${cell(serveTotal(tot))}</td>
    <td class="num">${cell(tot.serve_err)}</td>
    <td class="num">${cell(tot.aces)}</td>
    <td class="num">${cell(tot.pass_total)}</td>
    <td class="num">${cell(tot.pass_err)}</td>
    <td class="num">${pct(passPosPct(tot))}</td>
    <td class="num">${pct(passPerfPct(tot))}</td>
    <td class="num">${tot.pass_avg != null ? esc(tot.pass_avg) : "·"}</td>
    <td class="num">${cell(tot.attack_attempts)}</td>
    <td class="num">${cell(tot.attack_err)}</td>
    <td class="num">${cell(tot.kills)}</td>
    <td class="num">${pct(tot.attack_pct)}</td>
    <td class="num">${pct(attackEffPct(tot))}</td>
    <td class="num">${cell(blockTotal(tot))}</td>
    <td class="num">${cell(tot.blocks)}</td>
    <td class="num">${cell(tot.block_err)}</td>
    <td class="num">${cell(digTotal(tot))}</td>
    <td class="num">${cell(tot.dig_plus)}</td>
    <td class="num">${cell(tot.dig_zero)}</td>
    <td class="num">${cell(tot.dig_minus)}</td>
    <td class="num">${cell(tot.set_total)}</td>
    <td class="num">${cell(tot.set_hash)}</td>
    <td class="num">${cell(tot.set_plus)}</td>
    <td class="num">${cell(tot.set_minus)}</td>
    <td class="num">${tot.set_avg != null ? esc(tot.set_avg) : "·"}</td>
    <td class="num">${cell(tot.errors)}</td>
  </tr>`;
}

function rotationHtml(rows = []) {
  if (!rows.length) return "";
  const cells = rows
    .map((r) => {
      const diff = num(r.point_diff);
      const cls = diff > 0 ? "good" : diff < 0 ? "bad" : "";
      return `<td class="${cls}"><div class="rotLab">R${esc(r.rotation)}</div><div class="rotDiff">${esc(fmtDiff(diff))}</div><div class="rotPts">${esc(r.points_for)}:${esc(r.points_against)}</div></td>`;
    })
    .join("");
  return `<h2>Ротации (diff)</h2><table class="rot"><tr>${cells}</tr></table>`;
}

function setsHtml(sets = []) {
  if (!sets.length) return "";
  return `<table class="sets"><tr>${sets
    .map(
      (s) =>
        `<td><strong>G${esc(s.set_number)}</strong> ${esc(s.our_score)}:${esc(s.opp_score)}</td>`
    )
    .join("")}</tr></table>`;
}

/**
 * @param {object} opts
 * @param {object} opts.report MatchReportRead
 * @param {object[]} [opts.athletes]
 * @param {object} [opts.sideOut]
 * @param {object[]} [opts.byRotation]
 * @param {string} [opts.scopeLabel]
 */
export function openMatchReportPdf({
  report,
  athletes,
  sideOut,
  byRotation,
  scopeLabel = "Целият мач",
}) {
  const rows = athletes || report?.athletes || [];
  const tot = sumAthletes(rows);
  const so = sideOut || report?.side_out || {};
  const formatLabel =
    MATCH_FORMATS.find((f) => f.code === (report?.format || "bo5"))?.label || "3 от 5";
  const wonLabel =
    report?.match_won_by === "us"
      ? "Победа"
      : report?.match_won_by === "opp"
        ? "Загуба"
        : MATCH_STATUS_LABEL[report?.status] || report?.status || "";
  const teamName = report?.team_name || "Наш отбор";
  const opp = report?.opponent_name || "противник";
  const today = new Date().toLocaleDateString("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const insights = (report?.insights || []).map((line) => `<li>${esc(line)}</li>`).join("");

  const html = `<!DOCTYPE html>
<html lang="bg"><head>
<meta charset="utf-8"/>
<title>Статистика · ${esc(teamName)} vs ${esc(opp)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #111; font-size: 10px; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 11px; margin: 10px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { color: #444; margin: 0 0 8px; }
  .score { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
  .kpi { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
  .kpi div { border: 1px solid #ccc; padding: 4px 8px; min-width: 90px; }
  .kpi strong { display: block; font-size: 14px; }
  .kpi span { color: #555; font-size: 9px; text-transform: uppercase; }
  table.box { width: 100%; border-collapse: collapse; }
  table.box th, table.box td { border: 1px solid #bbb; padding: 2px 3px; white-space: nowrap; }
  table.box th { background: #eee; font-size: 8px; font-weight: 700; text-align: center; }
  table.box td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.box td.name { text-align: left; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
  table.box td.strong { font-weight: 800; }
  table.box tr.totals td { background: #f3f3f3; font-weight: 700; }
  table.box thead tr.grp th { background: #ddd; }
  table.sets td { border: 1px solid #ccc; padding: 3px 8px; }
  table.rot { width: auto; border-collapse: collapse; }
  table.rot td { border: 1px solid #bbb; padding: 4px 10px; text-align: center; min-width: 48px; }
  table.rot td.good { background: #e8f5e9; }
  table.rot td.bad { background: #fce8e6; }
  .rotLab { font-weight: 800; }
  .rotDiff { font-size: 12px; font-weight: 800; }
  .rotPts { color: #555; font-size: 9px; }
  ul.ins { margin: 4px 0 0; padding-left: 16px; columns: 2; column-gap: 18px; }
  ul.ins li { margin: 0 0 2px; break-inside: avoid; }
  .foot { margin-top: 10px; color: #666; font-size: 9px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head><body>
  <h1>${esc(teamName)} vs ${esc(opp)}</h1>
  <div class="score">${esc(report?.sets_won_us ?? 0)} : ${esc(report?.sets_won_opp ?? 0)} · ${esc(wonLabel)}</div>
  <p class="meta">${esc(formatLabel)} · ${esc(report?.system || "")}
    ${report?.match_date ? ` · ${esc(report.match_date)}` : ""}
    ${report?.venue ? ` · ${esc(report.venue)}` : ""}
    · ${esc(scopeLabel)} · ${esc(today)}</p>
  ${setsHtml(report?.sets || [])}

  <div class="kpi">
    <div><span>Side-out</span><strong>${esc(so.side_out_won || 0)}/${esc(so.side_out_attempts || 0)} ${so.side_out_pct != null ? esc(`(${so.side_out_pct}%)`) : ""}</strong></div>
    <div><span>Break-point</span><strong>${esc(so.break_won || 0)}/${esc(so.break_attempts || 0)} ${so.break_pct != null ? esc(`(${so.break_pct}%)`) : ""}</strong></div>
    <div><span>Точки</span><strong>${esc(so.points_for || 0)}:${esc(so.points_against || 0)} (${esc(fmtDiff(num(so.points_for) - num(so.points_against)))})</strong></div>
    <div><span>Гр. противник</span><strong>${esc(report?.opp_errors || 0)}</strong></div>
    <div><span>Атака противник</span><strong>${esc(report?.opp_points || 0)}</strong></div>
    <div><span>Записи</span><strong>${esc(report?.event_count || 0)}</strong></div>
  </div>

  ${(report?.insights || []).length ? `<h2>Изводи</h2><ul class="ins">${insights}</ul>` : ""}

  <h2>По състезател</h2>
  <table class="box">
    <thead>
      <tr class="grp">
        <th colspan="3"></th>
        <th>Тч</th>
        <th colspan="3">Сервис</th>
        <th colspan="5">Посрещане</th>
        <th colspan="5">Атака</th>
        <th colspan="3">Блок</th>
        <th colspan="4">Защита</th>
        <th colspan="5">Вдигане</th>
        <th>Гр</th>
      </tr>
      <tr>
        <th>#</th><th>Име</th><th>Поз</th>
        <th>Tot</th>
        <th>Tot</th><th>Err</th><th>Ас</th>
        <th>Tot</th><th>Err</th><th>Pos%</th><th>Prf%</th><th>Ср</th>
        <th>Tot</th><th>Err</th><th>Pt</th><th>Pt%</th><th>Eff%</th>
        <th>Tot</th><th>Pt</th><th>Err</th>
        <th>Tot</th><th>+</th><th>0</th><th>−</th>
        <th>Tot</th><th>#</th><th>+</th><th>−</th><th>Ср</th>
        <th>Tot</th>
      </tr>
    </thead>
    <tbody>
      ${playerRowsHtml(rows)}
      ${totalsRowHtml(tot)}
    </tbody>
  </table>

  ${rotationHtml(byRotation || report?.by_rotation || [])}

  <p class="foot">Volley Platform · статистика на мача · при печат изберете „Запази като PDF“.</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    alert("Изскачащият прозорец е блокиран. Разрешете pop-ups, за да изтеглите PDF.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
