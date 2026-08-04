import { useEffect, useMemo, useRef, useState } from "react";

import { isFrontRole, nearestZone, playerCourtPosition, roleChipLabel, zonePosition } from "../../utils/matchCourtLayout";
import { alignmentStatusBg, checkFormationAlignment, clampCourtPct } from "../../utils/matchOverlap";
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
  /** Free XY drag (coach stacks). Overrides rearrangeable swap while true. */
  positionEditable = false,
  /** Optional zone → {x,y}% overrides; missing zones use layout presets. */
  positionOverrides = null,
  onPositionsChange,
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
  showAlignment = false,
}) {
  const byZone = {};
  for (const s of slots) {
    byZone[s.zone] = s;
  }

  const isPro = variant === "pro";
  const isTactical = layout === "tactical";
  const layoutPhase = isTactical ? phase || "serve" : "grid";
  const freeMove = Boolean(positionEditable && isTactical);
  const canInteract = Boolean(editable || onZoneClick || rearrangeable || freeMove);
  const [dragFrom, setDragFrom] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const [selectZone, setSelectZone] = useState(null);
  const [livePos, setLivePos] = useState(null);
  const longPressTimer = useRef(null);
  const dragging = useRef(false);
  const startZone = useRef(null);
  const dragZoneRef = useRef(null);
  const moved = useRef(false);
  const livePosRef = useRef(null);
  const planeRef = useRef(null);
  const freeMoveRef = useRef(freeMove);
  freeMoveRef.current = freeMove;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => () => clearLongPress(), []);

  const resolvedPositions = useMemo(() => {
    const out = {};
    for (const z of ZONES) {
      const player = byZone[z];
      const preset = isTactical
        ? playerCourtPosition({
            role: player?.role,
            zone: z,
            phase: layoutPhase,
            rotation,
          })
        : zonePosition({ zone: z, phase: "grid", rotation: 1 });
      const ov = positionOverrides?.[z] ?? positionOverrides?.[String(z)];
      out[z] = ov ? clampCourtPct(ov.x, ov.y) : preset;
    }
    if (livePos?.zone != null) {
      out[livePos.zone] = clampCourtPct(livePos.x, livePos.y);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, isTactical, layoutPhase, rotation, positionOverrides, livePos]);

  const alignment = useMemo(() => {
    if (!showAlignment && !freeMove) return null;
    if (layoutPhase === "grid" || layoutPhase === "base") return null;
    return checkFormationAlignment(resolvedPositions);
  }, [showAlignment, freeMove, layoutPhase, resolvedPositions]);

  const alignUi = alignment ? alignmentStatusBg(alignment) : null;

  const faultZones = useMemo(() => {
    const set = new Set();
    if (!alignment?.faults) return set;
    for (const f of alignment.faults) {
      set.add(f.a);
      set.add(f.b);
    }
    return set;
  }, [alignment]);

  const warnZones = useMemo(() => {
    const set = new Set();
    if (!alignment?.warnings) return set;
    for (const w of alignment.warnings) {
      set.add(w.a);
      set.add(w.b);
    }
    return set;
  }, [alignment]);

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
    return clampCourtPct(x, y);
  };

  const emitPositions = (zone, xy) => {
    const zNum = Number(zone);
    const overridesNext = { ...(positionOverrides || {}) };
    // normalize keys to numbers
    const cleaned = {};
    for (const [k, v] of Object.entries(overridesNext)) {
      cleaned[Number(k)] = v;
    }
    cleaned[zNum] = clampCourtPct(xy.x, xy.y);
    onPositionsChange?.(cleaned);
  };

  const endFreeDrag = (e) => {
    const zone = dragZoneRef.current ?? startZone.current;
    const didDrag = dragging.current && moved.current && zone != null;
    if (freeMoveRef.current && didDrag) {
      const pct = (e && pctFromEvent(e)) || livePosRef.current;
      if (pct) emitPositions(zone, pct);
    } else if (zone != null && !moved.current) {
      onZoneClick?.(zone);
    }
    clearLongPress();
    dragging.current = false;
    dragZoneRef.current = null;
    startZone.current = null;
    moved.current = false;
    livePosRef.current = null;
    setDragFrom(null);
    setLivePos(null);
    setHoverZone(null);
  };

  const onPointerDown = (zone, e) => {
    if (!canInteract) return;
    if (e.button != null && e.button !== 0) return;
    startZone.current = zone;
    dragZoneRef.current = zone;
    moved.current = false;
    dragging.current = false;
    clearLongPress();

    const isTouch = e.pointerType === "touch";
    if ((rearrangeable || freeMove) && !isTouch) {
      setSelectZone(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    if ((rearrangeable || freeMove) && isTouch) {
      longPressTimer.current = setTimeout(() => {
        dragging.current = true;
        dragZoneRef.current = zone;
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
    if (!rearrangeable && !freeMove) return;
    if (startZone.current == null) return;

    const dist = Math.abs(e.movementX) + Math.abs(e.movementY);
    if (dist > 1) {
      moved.current = true;
      clearLongPress();
      if (!dragging.current && e.pointerType !== "touch") {
        dragging.current = true;
        dragZoneRef.current = startZone.current;
        setDragFrom(startZone.current);
        setSelectZone(null);
      }
    }

    // Touch: wait for long-press to arm drag
    if (!dragging.current) return;

    if (freeMove) {
      const pct = pctFromEvent(e);
      const z = dragZoneRef.current ?? startZone.current;
      if (pct && z != null) {
        const next = { zone: Number(z), x: pct.x, y: pct.y };
        livePosRef.current = next;
        setLivePos(next);
      }
      return;
    }

    const pct = pctFromEvent(e);
    if (pct) {
      setHoverZone(nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation }));
    } else {
      setHoverZone(zone);
    }
  };

  const onPointerUp = (zone, e) => {
    if (freeMove) {
      endFreeDrag(e);
      return;
    }

    clearLongPress();
    const from = startZone.current;
    const dragZ = dragZoneRef.current ?? dragFrom;

    if (rearrangeable && dragging.current && dragZ != null && moved.current) {
      const pct = e ? pctFromEvent(e) : null;
      const target = pct
        ? nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation })
        : hoverZone || zone;
      if (target != null && Number(target) !== Number(dragZ)) {
        finishSwap(dragZ, target);
      } else if (from) {
        onZoneClick?.(from);
      }
      dragging.current = false;
      dragZoneRef.current = null;
      setDragFrom(null);
      setHoverZone(null);
      startZone.current = null;
      return;
    }

    dragging.current = false;
    dragZoneRef.current = null;
    setDragFrom(null);
    setLivePos(null);
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
    if (freeMove) {
      endFreeDrag(null);
      return;
    }
    clearLongPress();
    dragging.current = false;
    dragZoneRef.current = null;
    setDragFrom(null);
    setLivePos(null);
    setHoverZone(null);
    startZone.current = null;
  };

  const highlightZone = activeZone ?? selectZone;
  const onCourtIds = new Set(Object.values(byZone).map((p) => Number(p.athlete_id)));
  const showLiberoBench = libero && !onCourtIds.has(Number(libero.athlete_id));

  const faultLines = alignment?.faults || [];
  const warnLines = alignment?.legal ? alignment.warnings || [] : [];

  const renderSlot = (zone) => {
    const player = byZone[zone];
    const isActive = Number(highlightZone) === zone;
    const isDrag = Number(dragFrom) === zone;
    const isHover = !freeMove && dragging.current && Number(hoverZone) === zone && Number(dragFrom) !== zone;
    const isServe = showServe && zone === 1;
    const isFault = faultZones.has(zone);
    const isWarn = !isFault && warnZones.has(zone);
    const color = player ? positionColor(player.position) : undefined;
    const front = player?.role ? isFrontRole(player.role, rotation) : [2, 3, 4].includes(Number(zone));
    const label =
      player?.role && layoutPhase !== "grid"
        ? roleChipLabel(player.role)
        : player
          ? positionShort(player.position)
          : null;
    const pos = resolvedPositions[zone] || { x: 50, y: 50 };

    const style = isTactical
      ? {
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          touchAction: rearrangeable || freeMove ? "none" : undefined,
          transition: freeMove || isDrag ? "none" : undefined,
        }
      : { touchAction: rearrangeable || freeMove ? "none" : undefined };

    return (
      <button
        key={zone}
        type="button"
        className={`matchChipSlot${isTactical ? " matchChipSlot--abs" : ""}${isActive ? " matchChipSlot--active" : ""}${
          player ? " matchChipSlot--filled" : ""
        }${isServe ? " matchChipSlot--serve" : ""}${isDrag ? " matchChipSlot--drag" : ""}${
          isHover ? " matchChipSlot--drop" : ""
        }${front && player ? " matchChipSlot--front" : ""}${!front && player ? " matchChipSlot--back" : ""}${
          isFault ? " matchChipSlot--fault" : ""
        }${isWarn ? " matchChipSlot--tight" : ""}`}
        disabled={!canInteract}
        data-zone={zone}
        style={style}
        onPointerDown={(e) => onPointerDown(zone, e)}
        onPointerMove={(e) => onPointerMove(zone, e)}
        onPointerUp={(e) => onPointerUp(zone, e)}
        onPointerCancel={onPointerCancel}
      >
        <span className="matchChipZoneBadge">{zone}</span>
        {player ? (
          <span className="matchChipStack">
            <span
              className={`matchChipCircle${front ? " matchChipCircle--tri" : ""}`}
              style={{ background: color }}
              title={player.role || positionShort(player.position)}
            >
              {label}
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

      {freeMove ? (
        <p className="matchCourtHint">Влачи за позиция · зоните трябва да са легални при контакт</p>
      ) : rearrangeable ? (
        <p className="matchCourtHint">
          {swapOnClick
            ? "Кликни двама за размяна · на таблет задръж и влачи"
            : "Влачи за размяна · на таблет задръж и влачи"}
        </p>
      ) : null}

      <div className={`matchCourtStage${isTactical ? " matchCourtStage--perspective" : ""}`}>
        <div className={`matchCourtPlane${isTactical ? " matchCourtPlane--3d" : ""}`}>
          <div className="matchCourtNetComplex" aria-hidden>
            <span className="matchCourtNetPost matchCourtNetPost--l" />
            <span className="matchCourtNetMesh" />
            <span className="matchCourtNetPost matchCourtNetPost--r" />
            <span className="matchCourtNetBall" />
          </div>

          <div
            ref={planeRef}
            className={`matchCourtField${isTactical ? " matchCourtField--tactical" : ""}`}
          >
            <div className="matchCourtGridlines" aria-hidden />
            <div className="matchCourtAttackLine" aria-hidden />
            <div className="matchCourtWatermark" aria-hidden>
              <span>VOLLEY COACH</span>
              <span>
                R{rotation} · {(phase || "base").toUpperCase()}
              </span>
            </div>

            {isTactical && (faultLines.length > 0 || warnLines.length > 0) ? (
              <svg className="matchCourtAlignSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {faultLines.map((f) => {
                  const a = resolvedPositions[f.a];
                  const b = resolvedPositions[f.b];
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`f-${f.a}-${f.b}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className="matchCourtAlignLine matchCourtAlignLine--fault"
                    />
                  );
                })}
                {warnLines.map((f) => {
                  const a = resolvedPositions[f.a];
                  const b = resolvedPositions[f.b];
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`w-${f.a}-${f.b}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className="matchCourtAlignLine matchCourtAlignLine--warn"
                    />
                  );
                })}
              </svg>
            ) : null}

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

      {alignUi ? (
        <div className={`matchCourtAlignStatus matchCourtAlignStatus--${alignUi.tone}`} role="status">
          {alignUi.text}
        </div>
      ) : null}

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
