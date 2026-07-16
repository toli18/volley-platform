import { useEffect, useRef, useState } from "react";

import { positionColor, positionShort, shortPlayerName } from "../../utils/matchPositions";

/** Visual volleyball court: zones 4-3-2 (front) / 5-6-1 (back). */
const COURT_LAYOUT = [
  [4, 3, 2],
  [5, 6, 1],
];

const LONG_PRESS_MS = 380;

export default function MatchCourt({
  slots = [],
  activeZone = null,
  onZoneClick,
  onSwapZones,
  rearrangeable = false,
  swapOnClick = false,
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
  const canInteract = Boolean(editable || onZoneClick || rearrangeable);
  const [dragFrom, setDragFrom] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const [selectZone, setSelectZone] = useState(null);
  const longPressTimer = useRef(null);
  const dragging = useRef(false);
  const startZone = useRef(null);
  const moved = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => () => clearLongPress(), []);

  const finishSwap = (fromZone, toZone) => {
    if (!fromZone || !toZone || fromZone === toZone) return;
    onSwapZones?.(fromZone, toZone);
  };

  const onPointerDown = (zone, e) => {
    if (!canInteract) return;
    if (e.button != null && e.button !== 0) return;
    startZone.current = zone;
    moved.current = false;
    dragging.current = false;
    clearLongPress();

    const isTouch = e.pointerType === "touch";
    if (rearrangeable && !isTouch) {
      // Mouse: start drag immediately
      dragging.current = true;
      setDragFrom(zone);
      setSelectZone(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    if (rearrangeable && isTouch) {
      longPressTimer.current = setTimeout(() => {
        dragging.current = true;
        setDragFrom(zone);
        setSelectZone(null);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(12);
          } catch {
            /* ignore */
          }
        }
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (zone, e) => {
    if (!rearrangeable) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
      moved.current = true;
      clearLongPress();
    }
    if (dragging.current) {
      setHoverZone(zone);
    }
  };

  const onPointerUp = (zone) => {
    clearLongPress();
    const from = startZone.current;

    if (rearrangeable && dragging.current && dragFrom != null) {
      const target = hoverZone || zone;
      finishSwap(dragFrom, target);
      dragging.current = false;
      setDragFrom(null);
      setHoverZone(null);
      startZone.current = null;
      return;
    }

    dragging.current = false;
    setDragFrom(null);
    setHoverZone(null);

    if (!from) return;

    // Click: select for bench, or click-to-swap when enabled
    if (rearrangeable && swapOnClick) {
      if (selectZone == null) {
        setSelectZone(from);
        onZoneClick?.(from);
      } else if (selectZone === from) {
        setSelectZone(null);
      } else {
        finishSwap(selectZone, from);
        setSelectZone(null);
      }
      startZone.current = null;
      return;
    }

    onZoneClick?.(from);
    setSelectZone(null);
    startZone.current = null;
  };

  const onPointerCancel = () => {
    clearLongPress();
    dragging.current = false;
    setDragFrom(null);
    setHoverZone(null);
    startZone.current = null;
  };

  const highlightZone = activeZone ?? selectZone;

  return (
    <div className={`matchCourtBoard${isPro ? " matchCourtBoard--pro" : ""}`}>
      {(title || subtitle) && isPro ? (
        <div className="matchCourtBoardHead">
          {title ? <div className="matchCourtBoardTitle">{title}</div> : null}
          {subtitle ? <div className="matchCourtBoardSub">{subtitle}</div> : null}
        </div>
      ) : null}

      {rearrangeable ? (
        <p className="matchCourtHint">
          {swapOnClick
            ? "Кликни двама за размяна · на таблет задръж и влачи"
            : "Влачи с мишката за размяна · на таблет задръж и влачи"}
        </p>
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
                const isActive = Number(highlightZone) === zone;
                const isDrag = Number(dragFrom) === zone;
                const isHover = dragging.current && Number(hoverZone) === zone && Number(dragFrom) !== zone;
                const isServe = showServe && zone === 1;
                const color = player ? positionColor(player.position) : undefined;

                return (
                  <button
                    key={zone}
                    type="button"
                    className={`matchChipSlot${isActive ? " matchChipSlot--active" : ""}${
                      player ? " matchChipSlot--filled" : ""
                    }${isServe ? " matchChipSlot--serve" : ""}${isDrag ? " matchChipSlot--drag" : ""}${
                      isHover ? " matchChipSlot--drop" : ""
                    }`}
                    disabled={!canInteract}
                    data-zone={zone}
                    onPointerDown={(e) => onPointerDown(zone, e)}
                    onPointerEnter={(e) => onPointerMove(zone, e)}
                    onPointerMove={(e) => {
                      if (!dragging.current) return;
                      // hit-test via elementsFromPoint for smoother drag
                      const el = document.elementFromPoint(e.clientX, e.clientY);
                      const slot = el?.closest?.("[data-zone]");
                      if (slot) {
                        const z = Number(slot.getAttribute("data-zone"));
                        if (z) setHoverZone(z);
                      }
                    }}
                    onPointerUp={() => onPointerUp(zone)}
                    onPointerCancel={onPointerCancel}
                    style={{ touchAction: rearrangeable ? "none" : undefined }}
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
