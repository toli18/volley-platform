// Преглед / печат на тимов лист за състезание (native print, кирилица).

import { competitionKindLabel } from "./competitionKinds";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function rosterStatusBg(status, locked) {
  if (locked || status === "locked") return "Заключен състав";
  if (status === "confirmed") return "Потвърден състав";
  return "Чернова / чака потвърждение";
}

/**
 * @param {object} opts
 * @param {object} opts.event Competition list/detail row
 * @param {object} opts.roster CompetitionRosterRead
 * @param {string} [opts.clubName]
 * @param {boolean} [opts.autoPrint=true]
 */
export function openCompetitionRosterPrint({ event, roster, clubName = "", autoPrint = true }) {
  const ids = new Set((roster?.athlete_ids || []).map(Number));
  const selected = (roster?.candidates || [])
    .filter((c) => ids.has(Number(c.id)) || c.selected)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));

  // Ако candidates не покриват ids (рядко) — добави placeholder редове
  const covered = new Set(selected.map((c) => Number(c.id)));
  for (const id of ids) {
    if (!covered.has(id)) selected.push({ id, name: `Състезател #${id}` });
  }

  const printedAt = new Date().toLocaleString("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const kind = competitionKindLabel(event);
  const status = rosterStatusBg(roster?.status, roster?.locked);
  const title = `Тимов лист · ${event?.date || ""} · ${kind}`;

  const rows = selected
    .map(
      (a, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(a.name)}</td>
        <td class="sign"></td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 13px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
  .toolbar button {
    border: 1px solid #cbd5e1; background: #0f766e; color: #fff;
    padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer;
  }
  .toolbar button.ghost { background: #fff; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #64748b; margin: 0 0 14px; font-size: 12px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin: 0 0 16px; }
  .meta div { border-bottom: 1px solid #e2e8f0; padding: 4px 0; }
  .meta span { color: #64748b; display: block; font-size: 11px; }
  .meta strong { font-size: 13px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; color: #475569; }
  td.num, th.num { width: 48px; text-align: center; }
  td.sign { width: 28%; height: 36px; }
  .empty { color: #b91c1c; padding: 12px; border: 1px dashed #fecaca; border-radius: 8px; }
  .foot { margin-top: 18px; color: #94a3b8; font-size: 11px; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 28px; }
  .signs p { margin: 0 0 28px; color: #64748b; font-size: 12px; }
  .signs .line { border-bottom: 1px solid #94a3b8; height: 1px; }
  @media print {
    body { margin: 10mm; }
    .toolbar { display: none !important; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Печат / PDF</button>
    <button type="button" class="ghost" onclick="window.close()">Затвори</button>
  </div>

  <h1>Тимов лист</h1>
  <p class="sub">${esc(clubName || "Клуб")} · генериран ${esc(printedAt)}</p>

  <div class="meta">
    <div><span>Дата</span><strong>${esc(event?.date || "—")}</strong></div>
    <div><span>Час</span><strong>${esc(event?.start_time || "—")}–${esc(event?.end_time || "—")}</strong></div>
    <div><span>Вид</span><strong>${esc(kind)}</strong></div>
    <div><span>Място</span><strong>${esc(event?.location || "—")}</strong></div>
    <div><span>Група</span><strong>${esc(event?.team_name || (event?.team_id ? `#${event.team_id}` : "—"))}</strong></div>
    <div><span>Картотека</span><strong>${esc(event?.carded_team_label || "—")}</strong></div>
    <div><span>Треньор</span><strong>${esc(event?.coach_name || "—")}</strong></div>
    <div><span>Статус</span><strong>${esc(status)} · ${selected.length}/${roster?.max_athletes || 14}</strong></div>
  </div>

  ${
    event?.notes
      ? `<p class="sub"><strong>Бележки:</strong> ${esc(event.notes)}</p>`
      : ""
  }

  <h2 style="font-size:14px;margin:0 0 6px;">Състав за пътуване / участие</h2>
  ${
    rows
      ? `<table>
          <thead><tr><th class="num">№</th><th>Състезател</th><th>Подпис / бележка</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
      : `<p class="empty">Няма записани състезатели в тимовия лист.</p>`
  }

  <div class="signs">
    <div>
      <p>Треньор</p>
      <div class="line"></div>
    </div>
    <div>
      <p>Ръководител / родител</p>
      <div class="line"></div>
    </div>
  </div>

  <p class="foot">Volley Coach · тимов лист за състезание #${esc(event?.id || "")}</p>
  ${
    autoPrint
      ? `<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>`
      : ""
  }
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!win) {
    throw new Error("Блокиран е изскачащ прозорец. Разреши pop-up за преглед/печат.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.focus();
  } catch {
    /* ignore */
  }
}
