import { Button } from "../ui";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import { teamColorForName } from "../../utils/parentPortalSchedule";

function eventTypeLabel(row) {
  return isCompetitionEvent(row) ? competitionKindLabel(row) : "Тренировка";
}

export default function ParentDayDetailModal({ date, items, formatDateLabel, onClose, onAckChange }) {
  if (!date) return null;

  const sorted = [...(items || [])].sort((a, b) =>
    String(a.start_time || "").localeCompare(String(b.start_time || ""))
  );

  return (
    <div className="parentPortalDayOverlay" onClick={onClose} role="presentation">
      <section
        className="parentPortalDayModal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="parentPortalDayModalTitle"
      >
        <div className="parentPortalDayModalHead">
          <h3 id="parentPortalDayModalTitle" className="parentPortalDayModalTitle">
            {formatDateLabel(date)}
          </h3>
          <Button size="sm" variant="secondary" type="button" onClick={onClose}>
            Затвори
          </Button>
        </div>

        {sorted.length === 0 ? (
          <p className="parentPortalHighlightMuted">Няма планирани събития за този ден.</p>
        ) : (
          <ul className="parentPortalDayModalList">
            {sorted.map((row, i) => {
              const isComp = isCompetitionEvent(row);
              const cancelled = Boolean(row.is_cancelled);
              const isChange = Boolean(row.highlight_change);
              const colors = isComp ? null : teamColorForName(row.team_name);
              const handleAck = (event) => {
                if (!isChange || !onAckChange) return;
                event.stopPropagation();
                onAckChange({
                  markerKey: row.change_marker_key || null,
                  date: row.date,
                });
              };
              return (
                <li
                  key={`${row.date}-${row.start_time}-${row.event_type}-${i}`}
                  role={isChange ? "button" : undefined}
                  tabIndex={isChange ? 0 : undefined}
                  onClick={isChange ? handleAck : undefined}
                  onKeyDown={
                    isChange
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAck(e);
                          }
                        }
                      : undefined
                  }
                  className={`parentPortalDayModalItem${isComp ? " parentPortalDayModalItem--competition" : ""}${cancelled ? " parentPortalDayModalItem--cancelled" : ""}${isChange ? " parentPortalDayModalItem--change parentPortalDayModalItem--ackBtn" : ""}`}
                  style={
                    isComp
                      ? undefined
                      : { borderLeftColor: colors.border, background: colors.bg }
                  }
                >
                  <div className="parentPortalDayModalItemType">
                    {cancelled ? "Отменена · " : ""}
                    {eventTypeLabel(row)}
                  </div>
                  <div className={`parentPortalDayModalItemTime${cancelled ? " parentPortalSchedStruck" : ""}`}>
                    {row.start_time} – {row.end_time}
                  </div>
                  {row.team_name ? (
                    <div className={`parentPortalDayModalItemMeta${cancelled ? " parentPortalSchedStruck" : ""}`}>
                      Група: {row.team_name}
                    </div>
                  ) : null}
                  {row.carded_team_label ? (
                    <div className={`parentPortalDayModalItemMeta${cancelled ? " parentPortalSchedStruck" : ""}`}>
                      Картотека: {row.carded_team_label}
                    </div>
                  ) : null}
                  {row.event_type === "competition" && row.athlete_participates ? (
                    <div className="parentPortalDayModalItemMeta">Участва детето</div>
                  ) : null}
                  {row.location ? (
                    <div className={`parentPortalDayModalItemMeta${cancelled ? " parentPortalSchedStruck" : ""}`}>
                      Място: {row.location}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
