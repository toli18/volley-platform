import { useEffect, useRef, useState } from "react";

import { nearestZone, playerCourtPosition, zonePosition } from "../../utils/matchCourtLayout";
import { positionColor, positionShort, shortPlayerName } from "../../utils/matchPositions";

const LONG_PRESS_MS = 380;
const ZONES = [4, 3, 2, 5, 6, 1];

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
  /** "tactical" = perspective + precise coords; "grid" = equal slots for setup */
  layout = "tactical",
  phase = "grid",
  rotation = 1,
  showServe = true,
  title = "",
  subtitle = "",
  size = "md", // sm | md | lg
}) {
  const byZone = {};
  for (const s of slots) {
    byZone[s.zone] = s;
  }

  const isPro = variant === "pro";
  const isTactical = layout === "tactical";
  const layoutPhase = isTactical ? phase || "serve" : "grid";
  const canInteract = Boolean(editable || onZoneClick || rearrangeable);
  const [dragFrom, setDragFrom] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const [selectZone, setSelectZone] = useState(null);
  const longPressTimer = useRef(null);
  const dragging = useRef(false);
  const startZone = useRef(null);
  const moved = useRef(false);
  const planeRef = useRef(null);

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

  const pctFromEvent = (e) => {
    const el = planeRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
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
      if (!dragging.current && startZone.current != null && e.pointerType !== "touch") {
        dragging.current = true;
        setDragFrom(startZone.current);
        setSelectZone(null);
      }
    }
    if (dragging.current) {
      const pct = pctFromEvent(e);
      if (pct) {
        setHoverZone(nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation }));
      } else {
        setHoverZone(zone);
      }
    }
  };

  const onPointerUp = (zone, e) => {
    clearLongPress();
    const from = startZone.current;

    if (rearrangeable && dragging.current && dragFrom != null && moved.current) {
      const pct = e ? pctFromEvent(e) : null;
      const target = pct
        ? nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation })
        : hoverZone || zone;
      if (target != null && Number(target) !== Number(dragFrom)) {
        finishSwap(dragFrom, target);
      } else if (from) {
        onZoneClick?.(from);
      }
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
  const onCourtIds = new Set(Object.values(byZone).map((p) => Number(p.athlete_id)));
  const showLiberoBench = libero && !onCourtIds.has(Number(libero.athlete_id));

  const renderSlot = (zone) => {
    const player = byZone[zone];
    const isActive = Number(highlightZone) === zone;
    const isDrag = Number(dragFrom) === zone;
    const isHover = dragging.current && Number(hoverZone) === zone && Number(dragFrom) !== zone;
    const isServe = showServe && zone === 1;
    const color = player ? positionColor(player.position) : undefined;
    const pos = isTactical
      ? playerCourtPosition({
          role: player?.role,
          zone,
          phase: layoutPhase,
          rotation,
        })
      : zonePosition({ zone, phase: "grid", rotation: 1 });

    const style = isTactical
      ? {
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          touchAction: rearrangeable ? "none" : undefined,
        }
      : { touchAction: rearrangeable ? "none" : undefined };

    return (
      <button
        key={zone}
        type="button"
        className={`matchChipSlot${isTactical ? " matchChipSlot--abs" : ""}${isActive ? " matchChipSlot--active" : ""}${
          player ? " matchChipSlot--filled" : ""
        }${isServe ? " matchChipSlot--serve" : ""}${isDrag ? " matchChipSlot--drag" : ""}${
          isHover ? " matchChipSlot--drop" : ""
        }`}
        disabled={!canInteract}
        data-zone={zone}
        style={style}
        onPointerDown={(e) => onPointerDown(zone, e)}
        onPointerEnter={(e) => onPointerMove(zone, e)}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          onPointerMove(zone, e);
        }}
        onPointerUp={(e) => onPointerUp(zone, e)}
        onPointerCancel={onPointerCancel}
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
  };

  return (
    <div
      className={`matchCourtBoard${isPro ? " matchCourtBoard--pro" : ""}${
        isTactical ? " matchCourtBoard--tactical" : ""
      } matchCourtBoard--${size}`}
    >
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
            : "Влачи за размяна · на таблет задръж и влачи"}
        </p>
      ) : null}

      <div className={`matchCourtStage${isTactical ? " matchCourtStage--perspective" : ""}`}>
        <div
          ref={planeRef}
          className={`matchCourtPlane${isTactical ? " matchCourtPlane--3d" : ""}`}
        >
          <div className="matchCourtNetComplex" aria-hidden>
            <span className="matchCourtNetPost matchCourtNetPost--l" />
            <span className="matchCourtNetMesh" />
            <span className="matchCourtNetPost matchCourtNetPost--r" />
            <span className="matchCourtNetBall" />
          </div>

          <div className={`matchCourtField${isTactical ? " matchCourtField--tactical" : ""}`}>
            <div className="matchCourtGridlines" aria-hidden />
            <div className="matchCourtAttackLine" aria-hidden />
            <div className="matchCourtWatermark" aria-hidden>
              <span>VOLLEY COACH</span>
              <span>
                R{rotation} · {(phase || "base").toUpperCase()}
              </span>
            </div>

            {isTactical ? (
              <div className="matchCourtAbsLayer">{ZONES.map((z) => renderSlot(z))}</div>
            ) : (
              <>
                <div className="matchCourtRow matchCourtRow--front">{[4, 3, 2].map((z) => renderSlot(z))}</div>
                <div className="matchCourtRow matchCourtRow--back">{[5, 6, 1].map((z) => renderSlot(z))}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {showLiberoBench || editable ? (
        <div className="matchLiberoRow">
          <span className="matchChipCircle matchChipCircle--sm" style={{ background: positionColor("L") }}>
            Л
          </span>
          {libero && showLiberoBench ? (
            <span className="matchLiberoText">
              {libero.jersey_number} {shortPlayerName(libero.athlete_name) || libero.athlete_name}
            </span>
          ) : editable && !libero ? (
            <span className="matchLiberoText matchLiberoText--muted">без либеро</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
