// src/utils/developmentReport.js
// Печат/Запази-като-PDF на Картата за развитие. Native print (кирилица).

import { NATIONAL_2022_DISCLAIMER, national2022RefLabel } from "./nationalNormLabels";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmt = (v, digits = 0) =>
  v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(digits);

const fmtDelta = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
};

const fmtRaw = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

/**
 * @param {object} opts
 * @param {string} opts.athleteName
 * @param {Array} opts.scores
 * @param {object} opts.windowMap
 * @param {Array} opts.deficits
 * @param {string} [opts.mainFocus]
 * @param {string} [opts.secondaryFocus]
 * @param {object} [opts.motivation] MotivationOut
 * @param {Array} [opts.rawWindows] AthleteResultsWindowOut[]
 */
export function openDevelopmentReport({
  athleteName,
  scores = [],
  windowMap = {},
  deficits = [],
  mainFocus,
  secondaryFocus,
  motivation = null,
  rawWindows = [],
}) {
  const today = new Date().toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });
  const refLabel = national2022RefLabel(motivation?.gender);

  const scoreRows = scores
    .map((s) => {
      const win = windowMap[s.window_id];
      const label = win ? `${win.season} · ${win.phaseLabel || PHASE_LABELS[win.phase] || ""}` : `Прозорец #${s.window_id}`;
      return `<tr>
        <td>${esc(label)}</td>
        <td class="num">${fmt(s.development_score)}</td>
        <td class="num">${fmt(s.technical_subindex)}</td>
        <td class="num">${fmt(s.physical_subindex)}</td>
        <td class="num">${esc(fmtDelta(s.delta))}</td>
      </tr>`;
    })
    .join("");

  const deficitChips = deficits
    .map(
      (d) =>
        `<span class="chip ${d.is_deficit ? "bad" : "ok"}">${esc(d.domain)}: ${fmt(d.normalized)}</span>`
    )
    .join(" ");

  const latestRaw = [...rawWindows].sort((a, b) => (a.window_id || 0) - (b.window_id || 0)).at(-1);
  const rawPhase = latestRaw
    ? `${latestRaw.season || ""} · ${PHASE_LABELS[latestRaw.phase] || latestRaw.phase || ""}`.trim()
    : "";
  const rawRows = (latestRaw?.results || [])
    .filter((r) => r.raw_value != null)
    .map(
      (r) => `<tr>
        <td>${esc(r.test_name || r.test_code)}</td>
        <td class="num">${esc(fmtRaw(r.raw_value))} ${esc(r.unit || "")}</td>
        <td class="num">${r.normalized != null ? fmt(r.normalized) : "—"}</td>
      </tr>`
    )
    .join("");

  const motivTests = motivation?.tests || [];
  const motivRows = motivTests
    .map((t) => {
      const bits = [];
      if (t.is_new_record) bits.push("нов рекорд");
      else if (t.is_personal_best) bits.push("личен рекорд");
      if (t.improved === true && t.delta != null) bits.push(`+${fmtRaw(Math.abs(t.delta))}`);
      if (t.talent_score != null) bits.push(`${refLabel}: ${fmtRaw(t.talent_score)} · ${t.talent_label || ""}`);
      if (t.peer_percentile != null) {
        bits.push(`връстници: ${fmtRaw(t.peer_percentile)}%${t.peer_indicative ? "*" : ""}`);
      }
      return `<tr>
        <td>${esc(t.test_name)}</td>
        <td class="num">${esc(fmtRaw(t.latest))} ${esc(t.unit || "")}</td>
        <td>${esc(bits.join(" · ") || "—")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8" />
<title>Карта за развитие — ${esc(athleteName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 28px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #607693; font-size: 12px; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { color: #607693; font-weight: 600; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .chip { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #f1f5f9; margin: 2px; }
  .chip.bad { background: #fef2f2; color: #b91c1c; }
  .chip.ok { background: #ecfdf5; color: #047857; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; font-size: 12px; }
  .stat strong { display: block; font-size: 16px; }
  .foot { margin-top: 22px; color: #94a3b8; font-size: 10px; line-height: 1.4; }
  @media print { body { margin: 10mm; } button { display: none; } }
</style></head>
<body>
  <h1>Карта за развитие — ${esc(athleteName)}</h1>
  <p class="sub">Национална диагностична карта · генерирана на ${esc(today)}</p>

  <h2>Development Score през прозорците</h2>
  ${
    scoreRows
      ? `<table><thead><tr>
          <th>Прозорец</th><th class="num">Development</th><th class="num">Технически</th>
          <th class="num">Физически</th><th class="num">Δ</th>
        </tr></thead><tbody>${scoreRows}</tbody></table>`
      : `<p class="sub">Няма изчислени резултати.</p>`
  }

  ${
    rawRows
      ? `<h2>Реални стойности${rawPhase ? ` — ${esc(rawPhase)}` : ""}</h2>
         <table><thead><tr><th>Тест</th><th class="num">Стойност</th><th class="num">Норм.</th></tr></thead>
         <tbody>${rawRows}</tbody></table>`
      : ""
  }

  ${
    motivRows
      ? `<h2>Напредък и ориентири</h2>
         <div class="stats">
           <div class="stat"><strong>${esc(motivation.improved_count ?? 0)}</strong>подобрени теста</div>
           <div class="stat"><strong>${esc(motivation.personal_best_count ?? 0)}</strong>лични рекорда</div>
           ${
             motivation.talent_index != null
               ? `<div class="stat"><strong>${esc(fmtRaw(motivation.talent_index))}</strong>${esc(refLabel)} · ${esc(motivation.talent_index_label || "")}</div>`
               : ""
           }
         </div>
         <table><thead><tr><th>Тест</th><th class="num">Последно</th><th>Бележки</th></tr></thead>
         <tbody>${motivRows}</tbody></table>`
      : ""
  }

  ${
    deficits.length
      ? `<h2>Фокус области${mainFocus ? ` (основен: ${esc(mainFocus)}${secondaryFocus ? ` · вторичен: ${esc(secondaryFocus)}` : ""})` : ""}</h2>
         <div>${deficitChips}</div>`
      : ""
  }

  <p class="foot">${esc(NATIONAL_2022_DISCLAIMER)}<br/>
  Документът е генериран от Volley Platform. Данните са методически и индикативни.</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) {
    alert("Изскачащият прозорец е блокиран. Разрешете pop-ups, за да изтеглите PDF.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
