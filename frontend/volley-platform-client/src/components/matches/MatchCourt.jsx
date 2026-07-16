import { positionColor, positionShort, shortPlayerName } from "../../utils/matchPositions";

/** Visual volleyball court: zones 4-3-2 (front) / 5-6-1 (back). */
const COURT_LAYOUT = [
  [4, 3, 2],
  [5, 6, 1],
];

export default function MatchCourt({
  slots = [],
  activeZone = null,
  onZoneClick,
  libero = null,
  editable = false,
  variant = "pro",
  showServe = true,
  title = "",
  subtitle = "",
}) {
  const byZone = {};
  for (const s of slots) {
    byZone[s.zone] = s;
  }

  const isPro = variant === "pro";
  const clickable = Boolean(editable || onZoneClick);

  return (
    <div className={`matchCourtBoard${isPro ? " matchCourtBoard--pro" : ""}`}>
      {(title || subtitle) && isPro ? (
        <div className="matchCourtBoardHead">
          {title ? <div className="matchCourtBoardTitle">{title}</div> : null}
          {subtitle ? <div className="matchCourtBoardSub">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="matchCourtStage">
        <div className="matchCourtNetBar" aria-hidden>
          <span className="matchCourtNetKnot" />
          <span className="matchCourtNetKnot" />
          <span className="matchCourtNetKnot" />
        </div>

        <div className="matchCourtField">
          <div className="matchCourtAttackLine" aria-hidden />
          {COURT_LAYOUT.map((row, rowIdx) => (
            <div key={row.join("-")} className={`matchCourtRow${rowIdx === 0 ? " matchCourtRow--front" : " matchCourtRow--back"}`}>
              {row.map((zone) => {
                const player = byZone[zone];
                const isActive = Number(activeZone) === zone;
                const isServe = showServe && zone === 1;
                const color = player ? positionColor(player.position) : undefined;

                return (
                  <button
                    key={zone}
                    type="button"
                    className={`matchChipSlot${isActive ? " matchChipSlot--active" : ""}${
                      player ? " matchChipSlot--filled" : ""
                    }${isServe ? " matchChipSlot--serve" : ""}`}
                    disabled={!clickable}
                    onClick={() => onZoneClick?.(zone)}
                  >
                    <span className="matchChipZoneBadge">{zone}</span>
                    {player ? (
                      <span className="matchChipStack">
                        <span className="matchChipCircle" style={{ background: color }}>
                          {positionShort(player.position)}
                        </span>
                        <span className="matchChipTag">
                          {player.jersey_number} {shortPlayerName(player.athlete_name)}
                        </span>
                      </span>
                    ) : (
                      <span className="matchChipEmpty">{editable ? "+" : "—"}</span>
                    )}
                    {isServe && player ? <span className="matchChipBall" aria-hidden title="Сервис" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {libero || editable ? (
        <div className="matchLiberoRow">
          <span className="matchChipCircle matchChipCircle--sm" style={{ background: positionColor("L") }}>
            Л
          </span>
          {libero ? (
            <span className="matchLiberoText">
              {libero.jersey_number} {shortPlayerName(libero.athlete_name) || libero.athlete_name}
            </span>
          ) : (
            <span className="matchLiberoText matchLiberoText--muted">без либеро</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
