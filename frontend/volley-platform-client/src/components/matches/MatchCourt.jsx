import { positionShort } from "../../utils/matchPositions";

/** Visual volleyball court: zones 4-3-2 (front) / 5-6-1 (back). */
const COURT_LAYOUT = [
  [4, 3, 2],
  [5, 6, 1],
];

const ZONE_SHORT = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
};

export default function MatchCourt({
  slots = [],
  activeZone = null,
  onZoneClick,
  libero = null,
  editable = false,
}) {
  const byZone = {};
  for (const s of slots) {
    byZone[s.zone] = s;
  }

  return (
    <div className="matchCourtWrap">
      <div className="matchCourtNet">мрежа</div>
      <div className="matchCourt">
        {COURT_LAYOUT.map((row) => (
          <div key={row.join("-")} className="matchCourtRow">
            {row.map((zone) => {
              const player = byZone[zone];
              const isActive = Number(activeZone) === zone;
              return (
                <button
                  key={zone}
                  type="button"
                  className={`matchCourtZone${isActive ? " matchCourtZone--active" : ""}${
                    player ? " matchCourtZone--filled" : ""
                  }`}
                  disabled={!editable && !onZoneClick}
                  onClick={() => onZoneClick?.(zone)}
                >
                  <span className="matchCourtZoneLabel">{ZONE_SHORT[zone]}</span>
                  {player ? (
                    <>
                      <span className="matchCourtJersey">#{player.jersey_number}</span>
                      <span className="matchCourtPos">{positionShort(player.position)}</span>
                      <span className="matchCourtName">{player.athlete_name}</span>
                    </>
                  ) : (
                    <span className="matchCourtEmpty">{editable ? "избери" : "—"}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {libero || editable ? (
        <div className="matchCourtLibero">
          <span className="matchCourtLiberoTag">Л</span>
          {libero ? (
            <span>
              #{libero.jersey_number} {libero.athlete_name}
            </span>
          ) : (
            <span className="coachMobileMuted">без либеро</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
