// src/utils/developmentReport.js
// Печат/Запази-като-PDF на Картата за развитие. Използваме native print на
// браузъра (а не jsPDF), защото вградените шрифтове на jsPDF не поддържат
// кирилица. Отваряме самостоятелен прозорец със стилизиран документ и викаме
// print(), където „Запази като PDF" е стандартна опция.

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

/**
 * @param {object} opts
 * @param {string} opts.athleteName
 * @param {Array} opts.scores  - [{window_id, development_score, technical_subindex, physical_subindex, delta}]
 * @param {object} opts.windowMap - { [window_id]: { season, phaseLabel } }
 * @param {Array} opts.deficits - [{domain, normalized, is_deficit}]
 * @param {string} [opts.mainFocus]
 */
export function openDevelopmentReport({ athleteName, scores = [], windowMap = {}, deficits = [], mainFocus }) {
  const today = new Date().toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });

  const rows = scores
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

  const html = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8" />
<title>Карта за развитие — ${esc(athleteName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #607693; font-size: 13px; margin: 0 0 20px; }
  h2 { font-size: 15px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  th { color: #607693; font-weight: 600; }
  td.num, th.num { text-align: right; }
  .chip { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #f1f5f9; margin: 2px; }
  .chip.bad { background: #fef2f2; color: #b91c1c; }
  .chip.ok { background: #ecfdf5; color: #047857; }
  .foot { margin-top: 28px; color: #94a3b8; font-size: 11px; }
  @media print { body { margin: 12mm; } button { display: none; } }
</style></head>
<body>
  <h1>Карта за развитие — ${esc(athleteName)}</h1>
  <p class="sub">Национална диагностична карта · генерирана на ${esc(today)}</p>

  <h2>Development Score през прозорците</h2>
  ${
    rows
      ? `<table><thead><tr>
          <th>Прозорец</th><th class="num">Development</th><th class="num">Технически</th>
          <th class="num">Физически</th><th class="num">Δ</th>
        </tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="sub">Няма изчислени резултати.</p>`
  }

  ${
    deficits.length
      ? `<h2>Фокус области${mainFocus ? ` (основен: ${esc(mainFocus)})` : ""}</h2><div>${deficitChips}</div>`
      : ""
  }

  <p class="foot">Документът е генериран от Volley Platform. Данните са методически и индикативни.</p>
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
