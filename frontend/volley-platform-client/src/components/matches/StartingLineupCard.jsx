import { positionShort, shortPlayerName } from "../../utils/matchPositions";

const FRONT = [4, 3, 2];
const BACK = [5, 6, 1];
const ROMAN = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI" };

function Cell({ slot, serve }) {
  return (
    <div className={`matchLineupCell${serve ? " matchLineupCell--serve" : ""}`}>
      <span className="matchLineupRoman">{ROMAN[slot?.zone] || ""}</span>
      {slot ? (
        <>
          <span className="matchLineupNum">{slot.jersey_number}</span>
          <span className="matchLineupName">
            {shortPlayerName(slot.athlete_name) || slot.athlete_name}
          </span>
          <span className="matchLineupPos">{positionShort(slot.position)}</span>
          {serve ? <span className="matchLineupServe">СЕРВИС</span> : null}
        </>
      ) : (
        <span className="matchLineupEmpty">—</span>
      )}
    </div>
  );
}

export default function StartingLineupCard({
  open,
  onClose,
  teamName = "",
  system = "5-1",
  opponentName = "",
  setNumber = "1",
  slots = [],
  libero = null,
}) {
  if (!open) return null;

  const byZone = {};
  for (const s of slots) byZone[s.zone] = s;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="matchLineupOverlay" role="dialog" aria-modal="true">
      <div className="matchLineupModal">
        <div className="matchLineupModalTop no-print">
          <strong>Стартова шестица</strong>
          <button type="button" className="matchLineupClose" onClick={onClose} aria-label="Затвори">
            ×
          </button>
        </div>

        <div className="matchLineupSheet" id="match-lineup-print-sheet">
          <div className="matchLineupSheetHead">
            <div>
              <div className="matchLineupLabel">СЕТ №</div>
              <div className="matchLineupValue">{setNumber}</div>
            </div>
            <div className="matchLineupTeamBlock">
              <div className="matchLineupLabel">ОТБОР</div>
              <div className="matchLineupValue">
                {teamName}
                {system ? ` · ${system}` : ""}
              </div>
              {opponentName ? <div className="matchLineupOpp">vs {opponentName}</div> : null}
            </div>
            <div>
              <div className="matchLineupLabel">ЛИБЕРО №</div>
              <div className="matchLineupValue">{libero?.jersey_number ?? "—"}</div>
            </div>
          </div>

          <div className="matchLineupGrid">
            <div className="matchLineupRow">
              {FRONT.map((z) => (
                <Cell key={z} slot={byZone[z]} />
              ))}
            </div>
            <div className="matchLineupRow">
              {BACK.map((z) => (
                <Cell key={z} slot={byZone[z]} serve={z === 1} />
              ))}
            </div>
          </div>
        </div>

        <div className="matchLineupActions no-print">
          <button type="button" className="matchLineupPrintBtn" onClick={handlePrint}>
            Print
          </button>
          <button type="button" className="matchLineupCancelBtn" onClick={onClose}>
            Затвори
          </button>
        </div>
      </div>
    </div>
  );
}
