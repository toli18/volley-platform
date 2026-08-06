import { useState } from "react";
import { formatMoney } from "../../utils/currency";

/** Collapsible month collected summary (head coaches see per-coach inline). */
export default function FeesMonthSummaryBar({ summary, isHeadCoach = false }) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem("feesMonthSummaryOpen") !== "0";
    } catch {
      return true;
    }
  });

  if (!summary) return null;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("feesMonthSummaryOpen", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const coaches = isHeadCoach && Array.isArray(summary.by_coach) ? summary.by_coach : [];

  return (
    <button
      type="button"
      className={`feesMonthSummaryBar${open ? "" : " feesMonthSummaryBar--collapsed"}`}
      onClick={toggle}
      aria-expanded={open}
      aria-label="Събрани такси за месеца — клик за свиване/разгъване"
    >
      <span className="feesMonthSummaryToggle">
        <span className="feesMonthSummaryTotal">Събрани: {formatMoney(summary.total_collected)}</span>
        <span className="feesMonthSummaryChevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </span>
      {open ? (
        <>
          <span className="feesMonthSummaryMeta">
            Платили {summary.paid_count} · неплатили {summary.unpaid_count} · общо {summary.athlete_count}
          </span>
          {coaches.length ? (
            <span className="feesMonthSummaryCoachesLine">
              {coaches.map((row, i) => (
                <span key={row.coach_id}>
                  {i > 0 ? <span className="feesMonthSummaryCoachSep"> · </span> : null}
                  <strong>{row.coach_name}</strong> {formatMoney(row.total_collected)} ({row.paid_count}/
                  {row.unpaid_count})
                </span>
              ))}
            </span>
          ) : null}
        </>
      ) : (
        <span className="feesMonthSummaryMeta feesMonthSummaryMeta--truncated">
          Платили {summary.paid_count} · неплатили {summary.unpaid_count}
          {coaches.length ? ` · ${coaches.length} треньора` : ""} · докосни за детайли
        </span>
      )}
    </button>
  );
}
