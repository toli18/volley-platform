import { Button } from "../ui";

/**
 * In-app преглед + печат (без pop-up) — работи на iPhone / Android / таблети.
 */
export default function CompetitionRosterPreview({ open, model, clubName = "", onClose }) {
  if (!open || !model) return null;

  const { event, athletes, kind, status, maxAthletes, count } = model;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="matchLineupOverlay competitionRosterPreviewOverlay" role="dialog" aria-modal="true">
      <div className="matchLineupModal competitionRosterPreviewModal">
        <div className="matchLineupModalTop no-print">
          <strong>Преглед · тимов лист</strong>
          <button type="button" className="matchLineupClose" onClick={onClose} aria-label="Затвори">
            ×
          </button>
        </div>

        <div className="competitionRosterSheet" id="competition-roster-print-sheet">
          <h1 className="competitionRosterSheetTitle">Тимов лист</h1>
          <p className="competitionRosterSheetSub">
            {clubName || "Клуб"}
            {event?.id ? ` · #${event.id}` : ""}
          </p>

          <div className="competitionRosterMeta">
            <div>
              <span>Дата</span>
              <strong>{event?.date || "—"}</strong>
            </div>
            <div>
              <span>Час</span>
              <strong>
                {event?.start_time || "—"}–{event?.end_time || "—"}
              </strong>
            </div>
            <div>
              <span>Вид</span>
              <strong>{kind}</strong>
            </div>
            <div>
              <span>Място</span>
              <strong>{event?.location || "—"}</strong>
            </div>
            <div>
              <span>Група</span>
              <strong>{event?.team_name || (event?.team_id ? `#${event.team_id}` : "—")}</strong>
            </div>
            <div>
              <span>Картотека</span>
              <strong>{event?.carded_team_label || "—"}</strong>
            </div>
            <div>
              <span>Треньор</span>
              <strong>{event?.coach_name || "—"}</strong>
            </div>
            <div>
              <span>Статус</span>
              <strong>
                {status} · {count}/{maxAthletes}
              </strong>
            </div>
          </div>

          {event?.notes ? (
            <p className="competitionRosterNotes">
              <strong>Бележки:</strong> {event.notes}
            </p>
          ) : null}

          <h2 className="competitionRosterListTitle">Състав за пътуване / участие</h2>
          {athletes.length ? (
            <table className="competitionRosterTable">
              <thead>
                <tr>
                  <th className="competitionRosterNum">№</th>
                  <th>Състезател</th>
                  <th className="competitionRosterSign">Подпис</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a, i) => (
                  <tr key={a.id || i}>
                    <td className="competitionRosterNum">{i + 1}</td>
                    <td>{a.name}</td>
                    <td className="competitionRosterSign" />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="competitionRosterEmpty">Няма записани състезатели в тимовия лист.</p>
          )}

          <div className="competitionRosterSigns">
            <div>
              <p>Треньор</p>
              <div className="competitionRosterSignLine" />
            </div>
            <div>
              <p>Ръководител / родител</p>
              <div className="competitionRosterSignLine" />
            </div>
          </div>
        </div>

        <div className="matchLineupActions no-print competitionRosterPreviewActions">
          <Button onClick={handlePrint}>Печат / PDF</Button>
          <Button variant="secondary" onClick={onClose}>
            Затвори
          </Button>
        </div>
      </div>
    </div>
  );
}
