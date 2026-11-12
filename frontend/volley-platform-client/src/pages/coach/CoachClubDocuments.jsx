import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useToast } from "../../components/ToastProvider";
import { Button, Input } from "../../components/ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(value) {
  if (!value) return "·";
  const [y, m, d] = String(value).split("-");
  if (!d) return value;
  return `${d}.${m}.${y}`;
}

async function openPdf(path, params) {
  const res = await axiosInstance.get(path, { responseType: "blob", params });
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function downloadBlob(path, filename, params) {
  const res = await axiosInstance.get(path, { responseType: "blob", params });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtPct(v) {
  if (v == null || v === "") return "·";
  const n = Number(v);
  if (!Number.isFinite(n)) return `${v}%`;
  return `${n.toLocaleString("bg-BG", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtMoney(v) {
  if (v == null || v === "") return "·";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString("bg-BG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function fmtExemptReason(reason) {
  const key = String(reason || "").trim().toLowerCase();
  if (key === "age") return "Възрастова група (освободен по възраст)";
  if (key === "manual") return "Освободен от администратор / треньор";
  if (!key) return "·";
  return String(reason);
}

function fmtAttendanceBreakdown({ present = 0, late = 0, absent = 0, excused = 0 } = {}) {
  return `Присъствали: ${present} · Закъснели: ${late} · Отсъствали: ${absent} · Извинени: ${excused}`;
}

function pctTone(pct) {
  if (pct == null || pct === "") return "warn";
  const n = Number(pct);
  if (!Number.isFinite(n)) return "warn";
  if (n >= 80) return "good";
  if (n >= 60) return "warn";
  return "bad";
}

function toneColor(tone) {
  if (tone === "good") return "#15803d";
  if (tone === "bad") return "#b91c1c";
  if (tone === "teal") return "#0f766e";
  if (tone === "blue") return "#1d4ed8";
  return "#b45309";
}

function DonutChart({ value, max = 100, color, label, size = 96, track = "#e2e8f0" }) {
  const n = Number(value);
  const safeMax = Number(max) > 0 ? Number(max) : 100;
  const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, (n / safeMax) * 100)) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const text =
    value == null || value === ""
      ? "·"
      : Number.isFinite(n)
        ? max === 100
          ? fmtPct(n)
          : String(Math.round(n))
        : String(value);
  return (
    <svg className="periodReportDonut" width={size} height={size} viewBox="0 0 96 96" aria-label={label || text}>
      <circle cx="48" cy="48" r={r} fill="none" stroke={track} strokeWidth="10" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke={color || toneColor(pctTone(pct))}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="52" textAnchor="middle" className="periodReportDonutText">
        {text}
      </text>
    </svg>
  );
}

function SegmentDonut({ segments, center, label, size = 96 }) {
  const parts = (segments || []).filter((s) => Number(s.value) > 0);
  const total = parts.reduce((acc, s) => acc + Number(s.value || 0), 0);
  const r = 36;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className="periodReportDonut" width={size} height={size} viewBox="0 0 96 96" aria-label={label || center}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {total > 0
        ? parts.map((s) => {
            const len = (Number(s.value) / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="48"
                cy="48"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="10"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 48 48)"
              />
            );
            offset += len;
            return el;
          })
        : null}
      <text x="48" y="52" textAnchor="middle" className="periodReportDonutText">
        {center}
      </text>
    </svg>
  );
}

function SummaryGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="periodReportKpiGrid">
      {items.map((it) => (
        <div key={it.label} className="periodReportKpi">
          <div className="periodReportKpiLabel">{it.label}</div>
          <div className="periodReportKpiValue">{it.value}</div>
          {it.hint ? <div className="periodReportKpiHint">{it.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function KpiBand({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="periodReportKpiBand">
      <div className="periodReportKpiBandTitle">{title}</div>
      <SummaryGrid items={items} />
    </div>
  );
}

function ReportSection({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="periodReportSection">
      <button type="button" className="periodReportSectionHead" onClick={() => setOpen((v) => !v)}>
        <span>
          {title}
          {count != null ? <span className="periodReportSectionCount">({count})</span> : null}
        </span>
        <span className="periodReportSectionCount">{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="periodReportSectionBody">{children}</div> : null}
    </div>
  );
}

function useExpandedRows(rows, initial = 8) {
  const [showAll, setShowAll] = useState(false);
  const list = rows || [];
  const visible = showAll ? list : list.slice(0, initial);
  const toggle =
    list.length > initial ? (
      <button type="button" className="periodReportMoreBtn" onClick={() => setShowAll((v) => !v)}>
        {showAll ? "Скрий" : `Покажи всички (${list.length})`}
      </button>
    ) : null;
  return { list, visible, toggle };
}

function StatusPill({ value, tone }) {
  return <span className={`periodReportPill periodReportPill--${tone || "info"}`}>{value}</span>;
}

function SimpleTable({ columns, rows, initial = 8, rowKey }) {
  const { list, visible, toggle } = useExpandedRows(rows, initial);
  if (!list.length) return <p className="periodReportNote">Няма записи.</p>;
  return (
    <div>
      <div className="periodReportTableWrap">
        <table className="periodReportTable" style={{ minWidth: 420 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key || c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, idx) => (
              <tr key={rowKey ? rowKey(row) : idx}>
                {columns.map((c) => (
                  <td key={c.key || c.label} className={c.muted ? "is-muted" : undefined}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toggle}
    </div>
  );
}

function PeriodReportView({ report }) {
  if (!report) return null;
  const pack = report.pack;
  const s = report.summary || {};
  const att = report.attendance || {};
  const fees = report.fees || {};
  const matches = report.matches || {};
  const athletesTotal = Number(s.athletes || 0);
  const paid = Number(fees.paid ?? s.fees_paid ?? 0);
  const unpaid = Number(fees.unpaid ?? s.fees_unpaid ?? s.unpaid ?? 0);
  const exempt = Number(fees.exempt ?? s.fees_exempt ?? 0);
  const billable = Number(fees.billable ?? s.fees_billable ?? paid + unpaid);
  const collected = Number(fees.total_paid_amount ?? s.fees_collected_amount ?? s.total_paid_amount ?? 0);
  const avgPaid = paid > 0 ? collected / paid : null;
  const finished = Number(matches.finished ?? s.matches_finished ?? 0);
  const wins = Number(matches.wins ?? s.match_wins ?? 0);
  const losses = Number(matches.losses ?? s.match_losses ?? 0);
  const withStats = Number(matches.with_stats ?? s.matches_with_stats ?? 0);
  const winPct = finished > 0 ? Math.round((wins / finished) * 1000) / 10 : null;
  const statsPct = finished > 0 ? Math.round((withStats / finished) * 1000) / 10 : null;
  const marked = Number(att.marked_total || 0);
  const present = Number(att.present || 0);
  const late = Number(att.late || 0);
  const absent = Number(att.absent || 0);
  const excused = Number(att.excused || 0);
  const missing = report.missing_data || {};
  const egnOk =
    athletesTotal > 0
      ? Math.round(((athletesTotal - Number(missing.no_egn_count || 0)) / athletesTotal) * 1000) / 10
      : null;

  const peopleBand =
    pack === "sport"
      ? null
      : [
          { label: "Отбори", value: s.teams ?? 0 },
          { label: "Състезатели", value: s.athletes ?? 0 },
          ...(pack === "club" ? [{ label: "Треньори", value: s.coaches ?? 0 }] : []),
          ...(s.trainings_created != null
            ? [{ label: "Нови тренировки", value: s.trainings_created, hint: "създадени през месеца" }]
            : []),
        ];

  const attendanceBand =
    pack === "sport"
      ? [
          { label: "Присъствие", value: fmtPct(s.attendance_pct), hint: "от отбелязани записи" },
          { label: "Отбелязани", value: marked || "·", hint: "общо статуси" },
        ]
      : [
          {
            label: "Сесии",
            value: s.sessions ?? 0,
            hint: `с присъствие ${s.sessions_with_attendance ?? 0} · без ${s.sessions_without_attendance ?? 0}`,
          },
          {
            label: "Присъствие",
            value: fmtPct(s.attendance_pct),
            hint: "Присъствали и закъснели спрямо отбелязани",
          },
          { label: "Присъствали", value: present + late, hint: `Присъствали: ${present} · Закъснели: ${late}` },
          { label: "Отсъствия", value: absent + excused, hint: `Отсъствали: ${absent} · Извинени: ${excused}` },
        ];

  const feesBand =
    pack === "sport"
      ? null
      : [
          {
            label: "Събрани",
            value: fmtMoney(collected),
            hint: avgPaid != null ? `средно ${fmtMoney(avgPaid)} / платил` : `${paid} платени`,
          },
          { label: "Събираемост", value: fmtPct(s.fees_collection_pct), hint: `${paid}/${billable} дължими` },
          { label: "Длъжници", value: unpaid },
          { label: "Освободени", value: exempt },
        ];

  const matchBand =
    pack === "sport"
      ? [
          { label: "Мачове", value: finished || s.matches || 0 },
          { label: "Победи", value: wins },
          { label: "Загуби", value: losses },
          { label: "Със стат.", value: withStats, hint: statsPct != null ? `${fmtPct(statsPct)} покритие` : undefined },
        ]
      : [
          { label: "Мачове", value: finished },
          { label: "Победи", value: wins, hint: winPct != null ? `${fmtPct(winPct)} успеваемост` : undefined },
        ];

  const testBand =
    pack === "sport"
      ? [
          { label: "Тест сесии", value: s.assessment_sessions ?? 0 },
          { label: "Тествани", value: s.athletes_tested ?? 0 },
          { label: "Ср. score", value: s.avg_development_score ?? "·" },
          {
            label: "Динамика",
            value: `${s.improved_count ?? 0}↑ / ${s.declined_count ?? 0}↓`,
          },
        ]
      : null;

  const actionItems = (report.actions || []).filter(Boolean);
  const charts = [];
  if (pack !== "sport") {
    charts.push({
      key: "att",
      label: "Присъствие",
      hint: "Присъствали и закъснели спрямо отбелязани",
      node: <DonutChart value={s.attendance_pct} label="Присъствие" color={toneColor(pctTone(s.attendance_pct))} />,
    });
    charts.push({
      key: "fees",
      label: "Събираемост",
      hint: `${paid} платени · ${unpaid} длъжници · ${exempt} освободени`,
      node: (
        <SegmentDonut
          center={s.fees_collection_pct != null ? fmtPct(s.fees_collection_pct) : "·"}
          label="Такси"
          segments={[
            { label: "Платени", value: paid, color: "#15803d" },
            { label: "Длъжници", value: unpaid, color: "#b91c1c" },
            { label: "Освободени", value: exempt, color: "#0f766e" },
          ]}
        />
      ),
    });
    if (marked > 0) {
      charts.push({
        key: "marks",
        label: "Статуси",
        hint: fmtAttendanceBreakdown({ present, late, absent, excused }),
        node: (
          <SegmentDonut
            center={String(marked)}
            label="Статуси"
            segments={[
              { label: "Присъствали", value: present, color: "#15803d" },
              { label: "Закъснели", value: late, color: "#b45309" },
              { label: "Отсъствали", value: absent, color: "#b91c1c" },
              { label: "Извинени", value: excused, color: "#1d4ed8" },
            ]}
          />
        ),
      });
    }
    if (egnOk != null) {
      charts.push({
        key: "egn",
        label: "ЕГН покритие",
        hint: `${athletesTotal - Number(missing.no_egn_count || 0)} / ${athletesTotal}`,
        node: <DonutChart value={egnOk} label="ЕГН" color={toneColor(pctTone(egnOk))} />,
      });
    }
  } else {
    charts.push({
      key: "att",
      label: "Присъствие",
      hint: "сигнал от тренировки",
      node: <DonutChart value={s.attendance_pct} label="Присъствие" color={toneColor(pctTone(s.attendance_pct))} />,
    });
    charts.push({
      key: "win",
      label: "Победи",
      hint: finished ? `${wins}/${finished} завършени` : "няма мачове",
      node: <DonutChart value={winPct} label="Победи" color={toneColor(pctTone(winPct))} />,
    });
    charts.push({
      key: "stats",
      label: "Статистика",
      hint: finished ? `${withStats}/${finished} със събития` : "·",
      node: <DonutChart value={statsPct} label="Статистика" color={toneColor(pctTone(statsPct))} />,
    });
  }

  return (
    <div className="periodReport">
      <h4 style={{ marginBottom: 6 }}>{report.title}</h4>
      <p className="periodReportIntro">
        {pack === "coach"
          ? "Оперативен преглед: такси, присъствие и липсващи данни за избрания треньор."
          : pack === "club"
            ? "Управленски преглед: сравнение между треньори и общо състояние на клуба."
            : "Спортен преглед: мачове, статистика и тестове. Присъствието е само като сигнал."}
      </p>

      {charts.length ? (
        <div className="periodReportCharts">
          {charts.map((ch) => (
            <div key={ch.key} className="periodReportDonutCard">
              {ch.node}
              <div className="periodReportDonutCardLabel">{ch.label}</div>
              {ch.hint ? <div className="periodReportDonutCardHint">{ch.hint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {peopleBand ? <KpiBand title="Хора" items={peopleBand} /> : null}
      <KpiBand title="Присъствие" items={attendanceBand} />
      {feesBand ? <KpiBand title="Такси" items={feesBand} /> : null}
      <KpiBand title={pack === "sport" ? "Мачове" : "Състезания"} items={matchBand} />
      {testBand ? <KpiBand title="Тестове" items={testBand} /> : null}

      {actionItems.length ? (
        <ReportSection title="За действие" count={actionItems.length} defaultOpen>
          <ul className="periodReportActions">
            {actionItems.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </ReportSection>
      ) : null}

      {report.coaches?.length ? (
        <ReportSection title="Сравнение треньори" count={report.coaches.length} defaultOpen>
          <SimpleTable
            initial={12}
            rowKey={(c) => c.coach_id}
            rows={report.coaches}
            columns={[
              { label: "Треньор", key: "coach_name" },
              { label: "Отб.", key: "teams" },
              { label: "Съст.", key: "athletes" },
              { label: "Сесии", key: "sessions" },
              {
                label: "Прис.%",
                render: (c) => <StatusPill value={fmtPct(c.attendance_pct)} tone={pctTone(c.attendance_pct)} />,
              },
              {
                label: "Такси%",
                render: (c) => (
                  <StatusPill value={fmtPct(c.fees_collection_pct)} tone={pctTone(c.fees_collection_pct)} />
                ),
              },
              { label: "Дълг", key: "fees_unpaid" },
              {
                label: "Мачове",
                render: (c) => `${c.matches_finished} / П${c.match_wins}`,
              },
            ]}
          />
        </ReportSection>
      ) : null}

      {pack !== "sport" && report.fees ? (
        <ReportSection title="Такси подробно" count={`${paid}/${billable}`} defaultOpen={Boolean(unpaid)}>
          <p className="periodReportNote">
            Събрани {fmtMoney(collected)}
            {avgPaid != null ? ` · средно ${fmtMoney(avgPaid)} на платил` : ""} · платени {paid} · длъжници {unpaid} ·
            освободени {exempt}
          </p>
          <div className="periodReportLegend">
            <span>
              <i className="periodReportLegendDot" style={{ background: "#15803d" }} />
              Платени
            </span>
            <span>
              <i className="periodReportLegendDot" style={{ background: "#b91c1c" }} />
              Длъжници
            </span>
            <span>
              <i className="periodReportLegendDot" style={{ background: "#0f766e" }} />
              Освободени
            </span>
          </div>
          {report.fees.unpaid_athletes?.length ? (
            <>
              <strong className="periodReportSubTitle">Длъжници</strong>
              <SimpleTable
                initial={10}
                rowKey={(a) => a.athlete_id}
                rows={report.fees.unpaid_athletes}
                columns={[{ label: "Състезател", key: "athlete_name" }]}
              />
            </>
          ) : (
            <p className="periodReportNote">Няма длъжници за месеца.</p>
          )}
          {report.fees.exempt_athletes?.length ? (
            <div style={{ marginTop: 12 }}>
              <strong className="periodReportSubTitle">Освободени</strong>
              <SimpleTable
                initial={8}
                rowKey={(a) => a.athlete_id}
                rows={report.fees.exempt_athletes}
                columns={[
                  { label: "Състезател", key: "athlete_name" },
                  { label: "Причина", muted: true, render: (a) => fmtExemptReason(a.reason) },
                ]}
              />
            </div>
          ) : null}
        </ReportSection>
      ) : null}

      {report.attendance?.by_team?.length && pack !== "sport" ? (
        <ReportSection title="Присъствие по отбори" count={report.attendance.by_team.length} defaultOpen={false}>
          <SimpleTable
            initial={12}
            rowKey={(r) => r.team_id}
            rows={report.attendance.by_team}
            columns={[
              { label: "Отбор", key: "team_name" },
              { label: "Сесии", key: "sessions_count" },
              {
                label: "%",
                render: (r) => <StatusPill value={fmtPct(r.attendance_pct)} tone={pctTone(r.attendance_pct)} />,
              },
              { label: "Присъствали", key: "present" },
              { label: "Закъснели", key: "late" },
              { label: "Отсъствали", key: "absent" },
              { label: "Извинени", key: "excused" },
            ]}
          />
        </ReportSection>
      ) : null}

      {report.attendance?.low_attendance?.length ? (
        <ReportSection
          title="Ниско присъствие (<70%)"
          count={report.attendance.low_attendance.length}
          defaultOpen={pack !== "club"}
        >
          <SimpleTable
            initial={10}
            rowKey={(a) => a.athlete_id}
            rows={report.attendance.low_attendance}
            columns={[
              { label: "Състезател", key: "athlete_name" },
              {
                label: "%",
                render: (a) => <StatusPill value={fmtPct(a.attendance_pct)} tone={pctTone(a.attendance_pct)} />,
              },
              { label: "Записи", key: "marked" },
              {
                label: "Разбивка",
                muted: true,
                render: (a) =>
                  fmtAttendanceBreakdown({
                    present: a.present,
                    late: a.late,
                    absent: a.absent,
                    excused: a.excused,
                  }),
              },
            ]}
          />
        </ReportSection>
      ) : null}

      {report.matches?.items?.length ? (
        <ReportSection title="Мачове през месеца" count={report.matches.items.length} defaultOpen={pack === "sport"}>
          <SimpleTable
            initial={12}
            rowKey={(m) => m.match_id}
            rows={report.matches.items}
            columns={[
              { label: "Дата", render: (m) => fmtDate(m.match_date) || m.match_date },
              { label: "Отбор", key: "team_name" },
              { label: "Срещу", muted: true, render: (m) => m.opponent_name || "·" },
              {
                label: "Резултат",
                render: (m) => `${m.sets_won_us ?? 0}:${m.sets_won_opp ?? 0}`,
              },
              {
                label: "Статистика",
                render: (m) =>
                  m.event_count ? (
                    <StatusPill value={`${m.event_count} записани действия`} tone="good" />
                  ) : (
                    <StatusPill value="Няма статистика" tone="bad" />
                  ),
              },
            ]}
          />
        </ReportSection>
      ) : null}

      {report.assessments?.sessions?.length ? (
        <ReportSection title="Тестови сесии" count={report.assessments.sessions.length} defaultOpen={pack === "sport"}>
          <SimpleTable
            initial={10}
            rowKey={(sRow) => sRow.session_id}
            rows={report.assessments.sessions}
            columns={[
              { label: "Дата", render: (sRow) => fmtDate(sRow.conducted_on) || sRow.conducted_on || "·" },
              { label: "Отбор", key: "team_name" },
              { label: "Статус", key: "status" },
            ]}
          />
        </ReportSection>
      ) : null}

      {report.missing_data && pack !== "sport" ? (
        <ReportSection title="Липсващи данни" defaultOpen={false}>
          <SummaryGrid
            items={[
              { label: "Без ЕГН", value: report.missing_data.no_egn_count ?? 0 },
              {
                label: "Без родител (за лица под 18 г.)",
                value: report.missing_data.no_parent_count ?? 0,
              },
              { label: "Без картотека (БФВ)", value: report.missing_data.no_bvf_count ?? 0 },
              {
                label: "ЕГН покритие",
                value: fmtPct(egnOk),
                hint: athletesTotal ? `от ${athletesTotal} състезатели` : undefined,
              },
            ]}
          />
        </ReportSection>
      ) : null}
    </div>
  );
}

function emptyInvoiceItems() {
  return [{ description: "Месечна такса", qty: "1", unit: "бр.", unit_price: "" }];
}

function athleteMatches(a, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = `${a.athlete_name || ""} ${a.egn || ""} ${a.parent_name || ""} ${a.birth_year || ""}`.toLowerCase();
  return hay.includes(q);
}

function AthleteSearch({ athletes, value, onPick, placeholder = "Търси по име или ЕГН…" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = athletes.find((a) => String(a.id) === String(value));
  const filtered = useMemo(
    () => athletes.filter((a) => athleteMatches(a, query)).slice(0, 12),
    [athletes, query],
  );

  return (
    <div className="uiField" style={{ marginBottom: 8, position: "relative" }}>
      <span className="uiFieldLabel">Състезател</span>
      {selected ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: "8px 10px",
            background: "#f8fafc",
          }}
        >
          <span>
            <strong>{selected.athlete_name}</strong>
            {selected.egn ? <span className="coachMobileMuted"> · ЕГН {selected.egn}</span> : null}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              onPick("");
              setQuery("");
              setOpen(true);
            }}
          >
            Смени
          </Button>
        </div>
      ) : (
        <>
          <input
            className="uiControl"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open ? (
            <ul
              style={{
                listStyle: "none",
                margin: "4px 0 0",
                padding: 0,
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                background: "#fff",
                maxHeight: 220,
                overflow: "auto",
                position: "absolute",
                zIndex: 5,
                left: 0,
                right: 0,
              }}
            >
              {filtered.length === 0 ? (
                <li className="coachMobileMuted" style={{ padding: "8px 10px" }}>
                  Няма съвпадение. Попълни името ръчно по-долу.
                </li>
              ) : (
                filtered.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(String(a.id));
                        setQuery("");
                        setOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: 0,
                        background: "transparent",
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {a.athlete_name}
                      {a.birth_year ? ` · ${a.birth_year}` : ""}
                      {a.egn ? ` · ${a.egn}` : ""}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function fmtBirth(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  if (!d) return iso;
  return `${d}.${m}.${y}`;
}

export default function CoachClubDocuments() {
  const toast = useToast();
  const [tab, setTab] = useState("notes");
  const [defaults, setDefaults] = useState(null);
  const [notes, setNotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [insurance, setInsurance] = useState(null);
  const [insBusy, setInsBusy] = useState(false);
  const [insFilters, setInsFilters] = useState({
    season_year: String(new Date().getFullYear()),
    status: "active",
    sek: "any",
    carded: "any",
    gender: "any",
    team_id: "",
    require_egn: false,
  });
  const [hallBusy, setHallBusy] = useState(false);
  const [hallPreview, setHallPreview] = useState(null);
  const [hallMonth, setHallMonth] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return {
      year: String(y),
      month: String(m),
      date_from: `${y}-${mm}-01`,
      date_to: `${y}-${mm}-${String(last).padStart(2, "0")}`,
    };
  });
  const [hallForm, setHallForm] = useState({
    org_name: "",
    eik: "",
    city: "",
    municipality: "",
    oblast: "",
    street: "",
    representative_name: "",
    phone: "",
    email: "",
    event_title: "",
  });

  const [reportPack, setReportPack] = useState("club");
  const [reportMonth, setReportMonth] = useState(currentMonthKey);
  const [reportCoachId, setReportCoachId] = useState("");
  const [reportCoaches, setReportCoaches] = useState([]);
  const [report, setReport] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);

  const setHallCalendarMonth = (year, month) => {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    setHallMonth({
      year: String(y),
      month: String(m),
      date_from: `${y}-${mm}-01`,
      date_to: `${y}-${mm}-${String(last).padStart(2, "0")}`,
    });
    setHallForm((p) => ({ ...p, event_title: "" }));
  };

  const [noteForm, setNoteForm] = useState({
    athlete_id: "",
    recipient_name: "",
    recipient_egn: "",
    issued_at: todayIso(),
    city: "",
    representative_name: "",
    representative_title: "Председател на УС",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    athlete_id: "",
    issued_at: todayIso(),
    place_of_issue: "",
    buyer_name: "",
    buyer_id_number: "",
    buyer_address: "",
    vat_registered: false,
    vat_rate: 20,
    payment_method: "cash",
    bank_iban: "",
    bank_name: "",
    notes: "",
    items: emptyInvoiceItems(),
  });

  const athletes = defaults?.athletes || [];
  const showTroyanHall = Boolean(
    defaults?.troyan_hall_application ||
      Number(defaults?.bvf_club_id) === 167 ||
      (() => {
        const blob = `${defaults?.club_full_name || ""} ${defaults?.club_name || ""} ${defaults?.bvf_club_name || ""}`.toLowerCase();
        return blob.includes("troyan") || blob.includes("троян");
      })(),
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, n, i] = await Promise.all([
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_DEFAULTS),
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_NOTES),
        axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INVOICES),
      ]);
      setDefaults(d.data || null);
      setNotes(n.data?.items || []);
      setInvoices(i.data?.items || []);
      setNoteForm((prev) => ({
        ...prev,
        city: prev.city || d.data?.city || "",
        representative_name: prev.representative_name || d.data?.representative_name || d.data?.contact_name || "",
        representative_title: prev.representative_title || d.data?.representative_title || "Председател на УС",
        issued_at: d.data?.today || prev.issued_at || todayIso(),
      }));
      setInvoiceForm((prev) => ({
        ...prev,
        place_of_issue: prev.place_of_issue || d.data?.city || "",
        issued_at: d.data?.today || prev.issued_at || todayIso(),
      }));
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на документите."));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadReportCoaches = useCallback(async () => {
    try {
      const month = reportMonth || currentMonthKey();
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      const mm = String(m).padStart(2, "0");
      const res = await axiosInstance.get(API_PATHS.CLUB_OVERVIEW, {
        params: {
          month_key: month,
          from_date: `${y}-${mm}-01`,
          to_date: `${y}-${mm}-${String(last).padStart(2, "0")}`,
        },
      });
      setReportCoaches(res.data?.coaches || []);
    } catch {
      setReportCoaches([]);
    }
  }, [reportMonth]);

  useEffect(() => {
    if (tab !== "reports") return;
    loadReportCoaches();
  }, [tab, loadReportCoaches]);

  const loadPeriodReport = useCallback(async () => {
    if (reportPack === "coach" && !reportCoachId) {
      toast.error("Избери треньор за пакет А.");
      return;
    }
    setReportBusy(true);
    try {
      const params = { pack: reportPack, month: reportMonth };
      if (reportCoachId && (reportPack === "coach" || reportPack === "sport")) {
        params.coach_id = Number(reportCoachId);
      }
      const res = await axiosInstance.get(API_PATHS.CLUB_REPORT_PERIOD, { params });
      setReport(res.data || null);
    } catch (err) {
      setReport(null);
      const status = err?.response?.status;
      toast.error(
        status === 404
          ? "API за отчети още не е качено на сървъра. Изчакай deploy на Railway и пробвай пак."
          : normalizeError(err, "Неуспешно генериране на отчета.")
      );
    } finally {
      setReportBusy(false);
    }
  }, [reportPack, reportMonth, reportCoachId, toast]);

  const exportPeriodReport = async (kind) => {
    if (reportPack === "coach" && !reportCoachId) {
      toast.error("Избери треньор за пакет А.");
      return;
    }
    const params = { pack: reportPack, month: reportMonth };
    if (reportCoachId && (reportPack === "coach" || reportPack === "sport")) {
      params.coach_id = Number(reportCoachId);
    }
    try {
      if (kind === "pdf") {
        await openPdf(API_PATHS.CLUB_REPORT_PERIOD_PDF, params);
      } else {
        await downloadBlob(
          API_PATHS.CLUB_REPORT_PERIOD_XLSX,
          `otchet_${reportPack}_${reportMonth}.xlsx`,
          params
        );
      }
    } catch (err) {
      const status = err?.response?.status;
      toast.error(
        status === 404
          ? "API за отчети още не е качено на сървъра. Изчакай deploy на Railway и пробвай пак."
          : normalizeError(err, "Неуспешен експорт.")
      );
    }
  };

  const loadInsurance = useCallback(async () => {
    setInsBusy(true);
    try {
      const params = {
        season_year: Number(insFilters.season_year) || new Date().getFullYear(),
        status: insFilters.status,
        sek: insFilters.sek,
        carded: insFilters.carded,
        gender: insFilters.gender,
        require_egn: Boolean(insFilters.require_egn),
      };
      if (insFilters.team_id) params.team_id = Number(insFilters.team_id);
      const res = await axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INSURANCE_ROSTER, { params });
      setInsurance(res.data || null);
    } catch (err) {
      setInsurance(null);
      toast.error(normalizeError(err, "Неуспешно зареждане на списъка за застраховка."));
    } finally {
      setInsBusy(false);
    }
  }, [insFilters, toast]);

  useEffect(() => {
    if (tab !== "insurance") return;
    loadInsurance();
  }, [tab, loadInsurance]);

  const loadHall = useCallback(async () => {
    if (!showTroyanHall) return;
    setHallBusy(true);
    try {
      const res = await axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_TROYAN_HALL, {
        params: {
          year: Number(hallMonth.year) || new Date().getFullYear(),
          month: Number(hallMonth.month) || new Date().getMonth() + 1,
          date_from: hallMonth.date_from,
          date_to: hallMonth.date_to,
        },
      });
      setHallPreview(res.data || null);
      const d = res.data?.defaults || {};
      setHallForm((prev) => ({
        org_name: prev.org_name || d.org_name || "",
        eik: prev.eik || d.eik || "",
        city: prev.city || d.city || "",
        municipality: prev.municipality || d.municipality || "",
        oblast: prev.oblast || d.oblast || "",
        street: prev.street || d.street || "",
        representative_name: prev.representative_name || d.representative_name || "",
        phone: prev.phone || d.phone || "",
        email: prev.email || d.email || "",
        event_title: !prev.event_title || prev.event_title.startsWith("Тренировки по волейбол")
          ? res.data?.event_title || prev.event_title || ""
          : prev.event_title,
      }));
    } catch (err) {
      setHallPreview(null);
      toast.error(normalizeError(err, "Неуспешно зареждане на заявлението за зала."));
    } finally {
      setHallBusy(false);
    }
  }, [
    showTroyanHall,
    hallMonth.date_from,
    hallMonth.date_to,
    hallMonth.month,
    hallMonth.year,
    toast,
  ]);

  useEffect(() => {
    if (tab !== "hall") return;
    loadHall();
  }, [tab, loadHall]);

  const downloadHallDocx = async () => {
    try {
      setHallBusy(true);
      const res = await axiosInstance.post(
        API_PATHS.CLUB_DOCUMENTS_TROYAN_HALL_DOCX,
        {
          year: Number(hallMonth.year) || new Date().getFullYear(),
          month: Number(hallMonth.month) || new Date().getMonth() + 1,
          date_from: hallMonth.date_from,
          date_to: hallMonth.date_to,
          ...hallForm,
        },
        { responseType: "blob" },
      );
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zayavlenie-zala-troyan-${hallMonth.date_from || "period"}_${hallMonth.date_to || ""}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен DOCX."));
    } finally {
      setHallBusy(false);
    }
  };

  const downloadInsuranceXlsx = async () => {
    try {
      setInsBusy(true);
      const params = {
        season_year: Number(insFilters.season_year) || new Date().getFullYear(),
        status: insFilters.status,
        sek: insFilters.sek,
        carded: insFilters.carded,
        gender: insFilters.gender,
        require_egn: Boolean(insFilters.require_egn),
      };
      if (insFilters.team_id) params.team_id = Number(insFilters.team_id);
      const res = await axiosInstance.get(API_PATHS.CLUB_DOCUMENTS_INSURANCE_ROSTER_XLSX, {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zastrahovka_${params.season_year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Excel файлът е изтеглен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтегляне."));
    } finally {
      setInsBusy(false);
    }
  };

  const pickAthleteForNote = (id) => {
    if (!id) {
      setNoteForm((p) => ({ ...p, athlete_id: "", recipient_name: "", recipient_egn: "" }));
      return;
    }
    const a = athletes.find((x) => String(x.id) === String(id));
    setNoteForm((p) => ({
      ...p,
      athlete_id: id,
      recipient_name: a?.athlete_name || "",
      recipient_egn: a?.egn || "",
      city: p.city || defaults?.city || "",
      representative_name: p.representative_name || defaults?.representative_name || "",
    }));
  };

  const pickAthleteForInvoice = (id) => {
    if (!id) {
      setInvoiceForm((p) => ({ ...p, athlete_id: "", buyer_name: "", buyer_id_number: "" }));
      return;
    }
    const a = athletes.find((x) => String(x.id) === String(id));
    setInvoiceForm((p) => ({
      ...p,
      athlete_id: id,
      buyer_name: a?.parent_name || a?.athlete_name || "",
      buyer_id_number: a?.egn || "",
      place_of_issue: p.place_of_issue || defaults?.city || "",
    }));
  };

  const openNoteForm = () => {
    setNoteForm((p) => ({
      ...p,
      issued_at: defaults?.today || todayIso(),
      city: p.city || defaults?.city || "",
      representative_name: p.representative_name || defaults?.representative_name || "",
      representative_title: p.representative_title || defaults?.representative_title || "Председател на УС",
    }));
    setShowNoteForm(true);
  };

  const saveNote = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_NOTES, {
        athlete_id: noteForm.athlete_id ? Number(noteForm.athlete_id) : null,
        recipient_name: noteForm.recipient_name,
        recipient_egn: noteForm.recipient_egn,
        issued_at: noteForm.issued_at,
        city: noteForm.city,
        representative_name: noteForm.representative_name,
        representative_title: noteForm.representative_title,
      });
      toast.success("Служебната бележка е записана.");
      setShowNoteForm(false);
      setNoteForm((p) => ({
        ...p,
        athlete_id: "",
        recipient_name: "",
        recipient_egn: "",
        issued_at: todayIso(),
      }));
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на бележката."));
    } finally {
      setBusy(false);
    }
  };

  const saveInvoice = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_INVOICES, {
        athlete_id: invoiceForm.athlete_id ? Number(invoiceForm.athlete_id) : null,
        issued_at: invoiceForm.issued_at,
        place_of_issue: invoiceForm.place_of_issue,
        buyer_name: invoiceForm.buyer_name,
        buyer_id_number: invoiceForm.buyer_id_number,
        buyer_address: invoiceForm.buyer_address,
        vat_registered: invoiceForm.vat_registered,
        vat_rate: Number(invoiceForm.vat_rate || 20),
        payment_method: invoiceForm.payment_method,
        bank_iban: invoiceForm.bank_iban,
        bank_name: invoiceForm.bank_name,
        notes: invoiceForm.notes,
        items: invoiceForm.items.map((row) => ({
          description: row.description,
          qty: Number(row.qty || 1),
          unit: row.unit || "бр.",
          unit_price: Number(String(row.unit_price).replace(",", ".") || 0),
        })),
      });
      toast.success("Фактурата е записана.");
      setShowInvoiceForm(false);
      setInvoiceForm((p) => ({
        ...p,
        athlete_id: "",
        buyer_name: "",
        buyer_id_number: "",
        buyer_address: "",
        notes: "",
        items: emptyInvoiceItems(),
        issued_at: todayIso(),
      }));
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на фактурата."));
    } finally {
      setBusy(false);
    }
  };

  const invoicePreviewTotal = useMemo(() => {
    return invoiceForm.items.reduce((sum, row) => {
      const qty = Number(String(row.qty).replace(",", ".") || 0);
      const price = Number(String(row.unit_price).replace(",", ".") || 0);
      return sum + qty * price;
    }, 0);
  }, [invoiceForm.items]);

  const setItem = (idx, key, value) => {
    setInvoiceForm((p) => ({
      ...p,
      items: p.items.map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
    }));
  };

  return (
    <div className="coachMobilePage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Документи</h2>
        <span className="feesCoachHeadBadge">{notes.length + invoices.length}</span>
      </header>
      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Служебни бележки, фактури, застраховка и месечни отчети за треньор/клуб/спорт.
        {showTroyanHall ? " За Троян — и месечно заявление за зала." : ""}
        {" "}Бележките, фактурите и отчетите се отварят като PDF.
        {defaults?.club_full_name ? ` Издател: ${defaults.club_full_name}.` : ""}
      </p>

      <div className="coachMobileSubNav" style={{ marginBottom: 12 }}>
        {[
          { id: "reports", label: "Отчети" },
          { id: "notes", label: `Бележки (${notes.length})` },
          { id: "invoices", label: `Фактури (${invoices.length})` },
          { id: "insurance", label: `Застраховки${insurance?.count != null ? ` (${insurance.count})` : ""}` },
          ...(showTroyanHall
            ? [{ id: "hall", label: `Зала Троян${hallPreview?.count != null ? ` (${hallPreview.count})` : ""}` }]
            : []),
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`coachMobileSubNavBtn${tab === f.id ? " is-active" : ""}`}
            onClick={() => setTab(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <section className="uiCard" style={{ padding: 14, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Месечни отчети</h3>
          <p className="coachMobileMuted" style={{ marginTop: 0 }}>
            Пакет А: треньор · Пакет Б: клуб · Пакет В: спортен (мачове + тестове). Периодът е един месец.
          </p>

          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <div className="coachMobileSubNav">
              {[
                { id: "coach", label: "А · Треньор" },
                { id: "club", label: "Б · Клуб" },
                { id: "sport", label: "В · Спортен" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`coachMobileSubNavBtn${reportPack === p.id ? " is-active" : ""}`}
                  onClick={() => {
                    setReportPack(p.id);
                    setReport(null);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <Input
              label="Месец"
              type="month"
              value={reportMonth}
              onChange={(e) => {
                setReportMonth(e.target.value);
                setReport(null);
              }}
            />

            {reportPack === "coach" || reportPack === "sport" ? (
              <label className="uiField">
                <span className="uiFieldLabel">
                  {reportPack === "coach" ? "Треньор (задължително)" : "Треньор (опционален филтър)"}
                </span>
                <select
                  className="uiControl"
                  value={reportCoachId}
                  onChange={(e) => {
                    setReportCoachId(e.target.value);
                    setReport(null);
                  }}
                >
                  <option value="">{reportPack === "coach" ? "Избери…" : "Всички треньори"}</option>
                  {reportCoaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email || `#${c.id}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="button" disabled={reportBusy} onClick={loadPeriodReport}>
                {reportBusy ? "Генериране…" : "Генерирай"}
              </Button>
              <Button type="button" variant="secondary" disabled={reportBusy} onClick={() => exportPeriodReport("pdf")}>
                PDF
              </Button>
              <Button type="button" variant="secondary" disabled={reportBusy} onClick={() => exportPeriodReport("xlsx")}>
                Excel
              </Button>
            </div>
          </div>

          {report ? (
            <PeriodReportView report={report} />
          ) : (
            <p className="coachMobileMuted">{reportBusy ? "Генериране…" : "Избери пакет и месец, после „Генерирай“."}</p>
          )}
        </section>
      ) : null}

      {tab === "notes" ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button type="button" onClick={() => (showNoteForm ? setShowNoteForm(false) : openNoteForm())}>
              {showNoteForm ? "Скрий формата" : "Нова служебна бележка"}
            </Button>
          </div>
          {showNoteForm ? (
            <form
              onSubmit={saveNote}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff", marginBottom: 14 }}
            >
              <p style={{ marginTop: 0, fontWeight: 700 }}>Без финансови претенции към състезателя</p>
              <p className="coachMobileMuted" style={{ fontSize: 13, marginTop: 0 }}>
                Търси състезател — името и ЕГН се попълват. Град и председател идват от{" "}
                <Link to="/coach/club-profile">профила на клуба</Link>.
              </p>
              <AthleteSearch athletes={athletes} value={noteForm.athlete_id} onPick={pickAthleteForNote} />
              {noteForm.athlete_id && !noteForm.recipient_egn ? (
                <p className="coachMobileMuted" style={{ fontSize: 13, color: "#b45309" }}>
                  На този състезател липсва ЕГН в профила — допълни го ръчно или го запиши в картата на състезателя.
                </p>
              ) : null}
              <Input
                label="Три имена"
                value={noteForm.recipient_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_name: e.target.value }))}
                required
              />
              <Input
                label="ЕГН"
                value={noteForm.recipient_egn}
                onChange={(e) => setNoteForm((p) => ({ ...p, recipient_egn: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                required
                inputMode="numeric"
                maxLength={10}
                autoComplete="off"
              />
              <Input
                label="Дата"
                type="date"
                value={noteForm.issued_at}
                onChange={(e) => setNoteForm((p) => ({ ...p, issued_at: e.target.value }))}
                required
              />
              <Input
                label="Град / място (от клуба)"
                value={noteForm.city}
                onChange={(e) => setNoteForm((p) => ({ ...p, city: e.target.value }))}
                hint={!defaults?.city ? "Попълни града в Профил на клуба, за да се слага сам." : undefined}
              />
              <Input
                label="Председател / представляващ (от клуба)"
                value={noteForm.representative_name}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_name: e.target.value }))}
                required
                hint={
                  !defaults?.representative_name
                    ? "Сложи името на председателя в Профил на клуба."
                    : undefined
                }
              />
              <Input
                label="Длъжност"
                value={noteForm.representative_title}
                onChange={(e) => setNoteForm((p) => ({ ...p, representative_title: e.target.value }))}
              />
              <p className="coachMobileMuted" style={{ fontSize: 13 }}>
                Текстът на бланката се сглобява автоматично. Печат и подпис се слагат върху разпечатката.
              </p>
              <Button type="submit" disabled={busy}>
                Запиши бележката
              </Button>
            </form>
          ) : null}

          {busy && !notes.length ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!busy && notes.length === 0 ? <p className="coachMobileMuted">Няма записани бележки.</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {notes.map((row) => (
              <li key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{row.recipient_name}</strong>
                  <span className="coachMobileMuted">№ {row.number} · {fmtDate(row.issued_at)}</span>
                </div>
                <div className="coachMobileMuted" style={{ marginTop: 4 }}>
                  ЕГН {row.recipient_egn}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await openPdf(API_PATHS.CLUB_DOCUMENTS_NOTE_PDF(row.id));
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешен PDF."));
                      }
                    }}
                  >
                    Преглед / печат
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!window.confirm("Изтриване на бележката?")) return;
                      try {
                        await axiosInstance.delete(API_PATHS.CLUB_DOCUMENTS_NOTE(row.id));
                        toast.success("Изтрита.");
                        await load();
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешно изтриване."));
                      }
                    }}
                  >
                    Изтрий
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === "invoices" ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button type="button" onClick={() => setShowInvoiceForm((v) => !v)}>
              {showInvoiceForm ? "Скрий формата" : "Нова фактура"}
            </Button>
          </div>
          {showInvoiceForm ? (
            <form
              onSubmit={saveInvoice}
              style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff", marginBottom: 14 }}
            >
              <p style={{ marginTop: 0, fontWeight: 700 }}>
                Следващ номер: {defaults?.next_invoice_number || "—"}
              </p>
              <AthleteSearch
                athletes={athletes}
                value={invoiceForm.athlete_id}
                onPick={pickAthleteForInvoice}
                placeholder="Търси състезател — попълва получател…"
              />
              <Input
                label="Получател"
                value={invoiceForm.buyer_name}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_name: e.target.value }))}
                required
              />
              <Input
                label="ЕГН / ЕИК на получателя"
                value={invoiceForm.buyer_id_number}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_id_number: e.target.value }))}
              />
              <Input
                label="Адрес на получателя"
                value={invoiceForm.buyer_address}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, buyer_address: e.target.value }))}
              />
              <Input
                label="Дата"
                type="date"
                value={invoiceForm.issued_at}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, issued_at: e.target.value }))}
                required
              />
              <Input
                label="Място на издаване"
                value={invoiceForm.place_of_issue}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, place_of_issue: e.target.value }))}
              />
              <label className="uiField" style={{ display: "block", marginBottom: 8 }}>
                <span className="uiFieldLabel">Начин на плащане</span>
                <select
                  className="uiControl"
                  value={invoiceForm.payment_method}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, payment_method: e.target.value }))}
                >
                  <option value="cash">В брой</option>
                  <option value="bank">По банков път</option>
                  <option value="card">С карта</option>
                </select>
              </label>
              {invoiceForm.payment_method === "bank" ? (
                <>
                  <Input
                    label="IBAN"
                    value={invoiceForm.bank_iban}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, bank_iban: e.target.value }))}
                  />
                  <Input
                    label="Банка"
                    value={invoiceForm.bank_name}
                    onChange={(e) => setInvoiceForm((p) => ({ ...p, bank_name: e.target.value }))}
                  />
                </>
              ) : null}
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={invoiceForm.vat_registered}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, vat_registered: e.target.checked }))}
                />
                Клубът е регистриран по ЗДДС
              </label>
              {invoiceForm.vat_registered ? (
                <Input
                  label="ДДС %"
                  type="number"
                  value={invoiceForm.vat_rate}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, vat_rate: e.target.value }))}
                />
              ) : (
                <p className="coachMobileMuted" style={{ fontSize: 13 }}>
                  На фактурата ще пише, че лицето не е регистрирано по ЗДДС.
                </p>
              )}

              <p style={{ fontWeight: 700, marginBottom: 6 }}>Редове</p>
              {invoiceForm.items.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <Input
                    label={`Описание ${idx + 1}`}
                    value={row.description}
                    onChange={(e) => setItem(idx, "description", e.target.value)}
                    required
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <Input label="Кол." value={row.qty} onChange={(e) => setItem(idx, "qty", e.target.value)} />
                    <Input label="Мярка" value={row.unit} onChange={(e) => setItem(idx, "unit", e.target.value)} />
                    <Input
                      label="Ед. цена (лв.)"
                      value={row.unit_price}
                      onChange={(e) => setItem(idx, "unit_price", e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setInvoiceForm((p) => ({
                      ...p,
                      items: [...p.items, { description: "", qty: "1", unit: "бр.", unit_price: "" }],
                    }))
                  }
                >
                  Добави ред
                </Button>
                {invoiceForm.items.length > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setInvoiceForm((p) => ({ ...p, items: p.items.slice(0, -1) }))}
                  >
                    Махни последния ред
                  </Button>
                ) : null}
              </div>
              <p style={{ fontWeight: 700 }}>Общо: {invoicePreviewTotal.toFixed(2)} BGN</p>
              <Input
                label="Забележка"
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
              />
              <Button type="submit" disabled={busy}>
                Запиши фактурата
              </Button>
            </form>
          ) : null}

          {busy && !invoices.length ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!busy && invoices.length === 0 ? <p className="coachMobileMuted">Няма записани фактури.</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {invoices.map((row) => (
              <li key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>
                    № {row.number} · {row.buyer_name}
                  </strong>
                  <span className="coachMobileMuted">
                    {fmtDate(row.issued_at)} · {row.total} {row.currency}
                    {row.status === "cancelled" ? " · анулирана" : ""}
                  </span>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await openPdf(API_PATHS.CLUB_DOCUMENTS_INVOICE_PDF(row.id));
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешен PDF."));
                      }
                    }}
                  >
                    Преглед / печат
                  </Button>
                  {row.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!window.confirm("Анулиране на фактурата? Номерът се запазва.")) return;
                        try {
                          await axiosInstance.post(API_PATHS.CLUB_DOCUMENTS_INVOICE_CANCEL(row.id));
                          toast.success("Анулирана.");
                          await load();
                        } catch (err) {
                          toast.error(normalizeError(err, "Неуспешно анулиране."));
                        }
                      }}
                    >
                      Анулирай
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!window.confirm("Изтриване на фактурата от списъка?")) return;
                      try {
                        await axiosInstance.delete(API_PATHS.CLUB_DOCUMENTS_INVOICE(row.id));
                        toast.success("Изтрита.");
                        await load();
                      } catch (err) {
                        toast.error(normalizeError(err, "Неуспешно изтриване."));
                      }
                    }}
                  >
                    Изтрий
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === "insurance" ? (
        <>
          <p className="coachMobileMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Извличаш списък от състезателите в приложението за застраховка. Филтрирай по СЕК, картотека,
            група и пол, после изтегли Excel.
          </p>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 12,
              background: "#fff",
              marginBottom: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <label className="uiField" style={{ margin: 0, minWidth: 100 }}>
                <span className="uiFieldLabel">Сезон</span>
                <input
                  className="uiControl"
                  value={insFilters.season_year}
                  onChange={(e) => setInsFilters((p) => ({ ...p, season_year: e.target.value }))}
                  inputMode="numeric"
                  style={{ width: 100 }}
                />
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 140 }}>
                <span className="uiFieldLabel">Статус</span>
                <select
                  className="uiControl"
                  value={insFilters.status}
                  onChange={(e) => setInsFilters((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Активни</option>
                  <option value="all">Всички</option>
                  <option value="inactive">Неактивни</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 140 }}>
                <span className="uiFieldLabel">СЕК</span>
                <select
                  className="uiControl"
                  value={insFilters.sek}
                  onChange={(e) => setInsFilters((p) => ({ ...p, sek: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="in_sek">В СЕК</option>
                  <option value="not_in_sek">Без СЕК</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 160 }}>
                <span className="uiFieldLabel">Картотека ({insFilters.season_year})</span>
                <select
                  className="uiControl"
                  value={insFilters.carded}
                  onChange={(e) => setInsFilters((p) => ({ ...p, carded: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="carded">Картотекирани</option>
                  <option value="not_carded">Некартотекирани</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 120 }}>
                <span className="uiFieldLabel">Пол</span>
                <select
                  className="uiControl"
                  value={insFilters.gender}
                  onChange={(e) => setInsFilters((p) => ({ ...p, gender: e.target.value }))}
                >
                  <option value="any">Всички</option>
                  <option value="female">Момичета</option>
                  <option value="male">Момчета</option>
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 160 }}>
                <span className="uiFieldLabel">Група</span>
                <select
                  className="uiControl"
                  value={insFilters.team_id}
                  onChange={(e) => setInsFilters((p) => ({ ...p, team_id: e.target.value }))}
                >
                  <option value="">Всички групи</option>
                  {(insurance?.teams || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={Boolean(insFilters.require_egn)}
                onChange={(e) => setInsFilters((p) => ({ ...p, require_egn: e.target.checked }))}
              />
              Само с ЕГН (нужно за повечето застрахователни бланки)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="button" variant="secondary" disabled={insBusy} onClick={loadInsurance}>
                {insBusy ? "Зареждане…" : "Обнови списъка"}
              </Button>
              <Button type="button" disabled={insBusy || !(insurance?.count > 0)} onClick={downloadInsuranceXlsx}>
                Изтегли Excel ({insurance?.count ?? 0})
              </Button>
            </div>
          </div>

          {insBusy && !insurance ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!insBusy && insurance && insurance.count === 0 ? (
            <p className="coachMobileMuted">Няма състезатели по тези филтри.</p>
          ) : null}
          {insurance?.items?.length ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {insurance.items.map((row, idx) => (
                <li
                  key={row.id}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>
                      {idx + 1}. {row.athlete_name}
                    </strong>
                    <span className="coachMobileMuted">
                      {row.in_sek ? "в СЕК" : "без СЕК"}
                      {row.is_carded ? " · картотекиран" : ""}
                    </span>
                  </div>
                  <div className="coachMobileMuted" style={{ marginTop: 4, fontSize: 13 }}>
                    ЕГН {row.egn || "—"} · роден {fmtBirth(row.birth_date)}
                    {row.gender_label ? ` · ${row.gender_label}` : ""}
                    {row.team_names?.length ? ` · ${row.team_names.join(", ")}` : ""}
                  </div>
                  {row.card_index_labels?.length ? (
                    <div className="coachMobileMuted" style={{ marginTop: 2, fontSize: 12 }}>
                      Картотеки: {row.card_index_labels.join(", ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {tab === "hall" && showTroyanHall ? (
        <>
          <p className="coachMobileMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Месечно заявление към Община Троян — попълва се официалната бланка Приложение № 12 (DOCX).
            Взимат се тренировките от графика с място „Троян“. По 1 ред на ден с обединени часове.
          </p>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 12,
              background: "#fff",
              marginBottom: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
              <label className="uiField" style={{ margin: 0, minWidth: 100 }}>
                <span className="uiFieldLabel">Година</span>
                <input
                  className="uiControl"
                  value={hallMonth.year}
                  onChange={(e) => setHallCalendarMonth(e.target.value, hallMonth.month)}
                  inputMode="numeric"
                  style={{ width: 100 }}
                />
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 140 }}>
                <span className="uiFieldLabel">Месец</span>
                <select
                  className="uiControl"
                  value={hallMonth.month}
                  onChange={(e) => setHallCalendarMonth(hallMonth.year, e.target.value)}
                >
                  {[
                    ["1", "януари"],
                    ["2", "февруари"],
                    ["3", "март"],
                    ["4", "април"],
                    ["5", "май"],
                    ["6", "юни"],
                    ["7", "юли"],
                    ["8", "август"],
                    ["9", "септември"],
                    ["10", "октомври"],
                    ["11", "ноември"],
                    ["12", "декември"],
                  ].map(([v, lbl]) => (
                    <option key={v} value={v}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 150 }}>
                <span className="uiFieldLabel">Период от</span>
                <input
                  className="uiControl"
                  type="date"
                  value={hallMonth.date_from}
                  onChange={(e) => {
                    setHallMonth((p) => ({ ...p, date_from: e.target.value }));
                    setHallForm((p) => ({ ...p, event_title: "" }));
                  }}
                />
              </label>
              <label className="uiField" style={{ margin: 0, minWidth: 150 }}>
                <span className="uiFieldLabel">до</span>
                <input
                  className="uiControl"
                  type="date"
                  value={hallMonth.date_to}
                  onChange={(e) => {
                    setHallMonth((p) => ({ ...p, date_to: e.target.value }));
                    setHallForm((p) => ({ ...p, event_title: "" }));
                  }}
                />
              </label>
              <Button type="button" variant="secondary" disabled={hallBusy} onClick={loadHall}>
                {hallBusy ? "Зареждане…" : "Обнови от графика"}
              </Button>
              <Button type="button" disabled={hallBusy} onClick={downloadHallDocx}>
                Изтегли DOCX (бланка)
              </Button>
            </div>
            <p className="coachMobileMuted" style={{ margin: 0, fontSize: 12 }}>
              Изтегля официалната бланка Приложение № 12 като Word (.docx) с попълнени данни и дати.
              Остава само физическият подпис. При смяна на месеца периодът се нулира до целия месец.
            </p>

            <Input
              label="Наименование"
              value={hallForm.org_name}
              onChange={(e) => setHallForm((p) => ({ ...p, org_name: e.target.value }))}
            />
            <Input
              label="ЕИК"
              value={hallForm.eik}
              onChange={(e) => setHallForm((p) => ({ ...p, eik: e.target.value }))}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Input
                label="Град"
                value={hallForm.city}
                onChange={(e) => setHallForm((p) => ({ ...p, city: e.target.value }))}
              />
              <Input
                label="Община"
                value={hallForm.municipality}
                onChange={(e) => setHallForm((p) => ({ ...p, municipality: e.target.value }))}
              />
              <Input
                label="Област"
                value={hallForm.oblast}
                onChange={(e) => setHallForm((p) => ({ ...p, oblast: e.target.value }))}
              />
            </div>
            <Input
              label="Улица / №"
              value={hallForm.street}
              onChange={(e) => setHallForm((p) => ({ ...p, street: e.target.value }))}
            />
            <Input
              label="Представляван от (председател)"
              value={hallForm.representative_name}
              onChange={(e) => setHallForm((p) => ({ ...p, representative_name: e.target.value }))}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Input
                label="Телефон"
                value={hallForm.phone}
                onChange={(e) => setHallForm((p) => ({ ...p, phone: e.target.value }))}
              />
              <Input
                label="E-mail"
                value={hallForm.email}
                onChange={(e) => setHallForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <Input
              label="Наименование на събитието"
              value={hallForm.event_title}
              onChange={(e) => setHallForm((p) => ({ ...p, event_title: e.target.value }))}
            />
            <p className="coachMobileMuted" style={{ margin: 0, fontSize: 13 }}>
              {hallPreview
                ? `${hallPreview.count} дни · ${hallPreview.total_hours} ч. · ${hallPreview.hall_label}`
                : "Избери месец и обнови."}
            </p>
          </div>

          {hallBusy && !hallPreview ? <p className="coachMobileMuted">Зареждане…</p> : null}
          {!hallBusy && hallPreview && hallPreview.count === 0 ? (
            <p className="coachMobileMuted">Няма тренировки в зала Троян за този месец.</p>
          ) : null}
          {hallPreview?.slots?.length ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {hallPreview.slots.map((row) => (
                <li
                  key={row.date}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{row.date_bg}</strong>
                    <span>
                      {row.start_time} – {row.end_time}
                    </span>
                  </div>
                  <div className="coachMobileMuted" style={{ marginTop: 4, fontSize: 13 }}>
                    {row.session_count} тренировки · {row.hours} ч.
                    {row.locations?.length ? ` · ${row.locations.join(", ")}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
