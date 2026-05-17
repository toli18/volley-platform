import { Button } from "../ui";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import { teamColorForName } from "../../utils/parentPortalSchedule";

function eventTypeLabel(row) {
  return isCompetitionEvent(row) ? competitionKindLabel(row) : "Тренировка";
}

export default function ParentDayDetailModal({ date, items, formatDateLabel, onClose }) {
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
              const colors = isComp ? null : teamColorForName(row.team_name);
              return (
                <li
                  key={`${row.date}-${row.start_time}-${row.event_type}-${i}`}
                  className={`parentPortalDayModalItem${isComp ? " parentPortalDayModalItem--competition" : ""}${cancelled ? " parentPortalDayModalItem--cancelled" : ""}`}
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
                      Отбор: {row.team_name}
                    </div>
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
