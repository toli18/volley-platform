import { formatMoney } from "../../utils/currency";

function SegmentDonut({ segments, center, subcenter, label, size = 132 }) {
  const parts = (segments || []).filter((s) => Number(s.value) > 0);
  const total = parts.reduce((acc, s) => acc + Number(s.value || 0), 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const vb = 120;
  return (
    <svg
      className="clubHeadDonut"
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      aria-label={label || String(center)}
    >
      <circle cx={vb / 2} cy={vb / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      {total > 0
        ? parts.map((s) => {
            const len = (Number(s.value) / total) * c;
            const el = (
              <circle
                key={s.key || s.label}
                cx={vb / 2}
                cy={vb / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${vb / 2} ${vb / 2})`}
              />
            );
            offset += len;
            return el;
          })
        : null}
      <text x={vb / 2} y={subcenter ? vb / 2 - 2 : vb / 2 + 5} textAnchor="middle" className="clubHeadDonutCenter">
        {center}
      </text>
      {subcenter ? (
        <text x={vb / 2} y={vb / 2 + 16} textAnchor="middle" className="clubHeadDonutSub">
          {subcenter}
        </text>
      ) : null}
    </svg>
  );
}

function HorizontalBars({ rows, pctLabel }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="clubHeadBars">
      {pctLabel ? <div className="clubHeadBarsPct">{pctLabel}</div> : null}
      {rows.map((row) => {
        const v = Number(row.value) || 0;
        const width = `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%`;
        return (
          <div key={row.key || row.label} className="clubHeadBarRow">
            <div className="clubHeadBarMeta">
              <span className="clubHeadBarLabel">{row.label}</span>
              <span className="clubHeadBarValue">{v}</span>
            </div>
            <div className="clubHeadBarTrack" aria-hidden>
              <div className="clubHeadBarFill" style={{ width, background: row.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FeesDonutCard({ fees }) {
  const paid = Number(fees?.paid_athletes) || 0;
  const unpaid = Number(fees?.unpaid_athletes) || 0;
  const totalAthletes = Number(fees?.total_athletes) || paid + unpaid;
  const amount = formatMoney(fees?.total_paid_amount);
  return (
    <div className="clubHeadKpiViz">
      <SegmentDonut
        label="Платили срещу неплатили"
        center={amount}
        subcenter={`${totalAthletes} съст.`}
        segments={[
          { key: "paid", label: "Платили", value: paid, color: "#16a34a" },
          { key: "unpaid", label: "Неплатили", value: unpaid, color: "#ef4444" },
        ]}
      />
      <ul className="clubHeadKpiLegend">
        <li>
          <span className="clubHeadKpiSwatch" style={{ background: "#16a34a" }} />
          Платили: <strong>{paid}</strong>
        </li>
        <li>
          <span className="clubHeadKpiSwatch" style={{ background: "#ef4444" }} />
          Неплатили: <strong>{unpaid}</strong>
        </li>
      </ul>
    </div>
  );
}

export function AttendanceBarsCard({ attendance, period }) {
  const present = Number(attendance?.present) || 0;
  const late = Number(attendance?.late) || 0;
  const absent = Number(attendance?.absent) || 0;
  const excused = Number(attendance?.excused) || 0;
  const sessions = Number(attendance?.sessions_count) || 0;
  const attended = present + late;
  const denom = attended + absent + excused;
  const pct = denom > 0 ? Math.round((attended / denom) * 100) : 0;

  return (
    <div className="clubHeadKpiViz clubHeadKpiViz--bars">
      <HorizontalBars
        pctLabel={`Присъствие ${pct}% · ${sessions} тренировки`}
        rows={[
          { key: "present", label: "Присъствали", value: attended, color: "#0b8f69" },
          { key: "absent", label: "Отсъствали", value: absent, color: "#ef4444" },
          { key: "excused", label: "Извинени", value: excused, color: "#94a3b8" },
        ]}
      />
      {period?.from_date && period?.to_date ? (
        <p className="clubHeadKpiPeriod">
          Период: {period.from_date} – {period.to_date}
        </p>
      ) : null}
    </div>
  );
}
