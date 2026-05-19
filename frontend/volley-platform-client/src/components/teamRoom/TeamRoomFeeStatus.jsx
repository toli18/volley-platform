import { formatMoney } from "../../utils/currency";
import { formatFeeDueLabel } from "../../utils/parentPortalDates";

export default function TeamRoomFeeStatus({ fee, formatMonthKey, feeChangeHighlight, onAckFeeHighlight }) {
  if (!fee) return null;
  const paid = Boolean(fee.paid);
  const changeClass = feeChangeHighlight ? " teamRoomCard--change" : "";

  return (
    <section
      role={feeChangeHighlight && onAckFeeHighlight ? "button" : undefined}
      tabIndex={feeChangeHighlight && onAckFeeHighlight ? 0 : undefined}
      onClick={feeChangeHighlight ? onAckFeeHighlight : undefined}
      onKeyDown={
        feeChangeHighlight && onAckFeeHighlight
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAckFeeHighlight();
              }
            }
          : undefined
      }
      className={`teamRoomCard teamRoomCard--fee${paid ? " teamRoomCard--feePaid" : " teamRoomCard--feeUnpaid"}${changeClass}`}
      aria-label="Месечна такса"
    >
      <div className="teamRoomFeeHeader">
        <h2 className="teamRoomCardTitle">Такса — {formatMonthKey(fee.month_key)}</h2>
        <span className="teamRoomFeeBadgeWrap">
          <span className={`teamRoomFeeBadge${paid ? " teamRoomFeeBadge--paid" : " teamRoomFeeBadge--unpaid"}`}>
            {paid ? "Платена" : "Неплатена"}
          </span>
          {feeChangeHighlight ? <span className="teamRoomBadgeDot teamRoomBadgeDot--inline" aria-hidden /> : null}
        </span>
      </div>
      {paid ? (
        <p className="teamRoomMuted">
          {fee.amount ? formatMoney(fee.amount) : null}
          {fee.paid_at
            ? ` · ${new Date(fee.paid_at).toLocaleDateString("bg-BG", { day: "numeric", month: "short", year: "numeric" })}`
            : null}
        </p>
      ) : (
        <p className="teamRoomMuted">{formatFeeDueLabel(fee.due_day, fee.month_key)}</p>
      )}
    </section>
  );
}
