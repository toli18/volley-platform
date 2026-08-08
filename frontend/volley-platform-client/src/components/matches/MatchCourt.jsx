import { useEffect, useMemo, useRef, useState } from "react";

import { isFrontRole, nearestZone, playerCourtPosition, positionChipShape, roleChipLabel, roleChipShape, zonePosition } from "../../utils/matchCourtLayout";
import { alignmentStatusBg, checkFormationAlignment, clampCourtPct } from "../../utils/matchOverlap";
import { positionColor, positionShort, shortPlayerName } from "../../utils/matchPositions";

const LONG_PRESS_MS = 380;
const ZONES = [4, 3, 2, 5, 6, 1];
/** Max screen px from chip center to count as a hit (after 3D projection). */
const HIT_RADIUS_PX = 88;

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
  system = "5-1",
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
  const layerRef = useRef(null);
  const chipRefs = useRef({});
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
            system,
          })
        : zonePosition({ zone: z, phase: "grid", rotation: 1, system });
      const ov = positionOverrides?.[z] ?? positionOverrides?.[String(z)];
      out[z] = ov ? clampCourtPct(ov.x, ov.y) : preset;
    }
    if (livePos?.zone != null) {
      out[livePos.zone] = clampCourtPct(livePos.x, livePos.y);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, isTactical, layoutPhase, rotation, positionOverrides, livePos, system]);

  const alignment = useMemo(() => {
    if (!showAlignment && !freeMove) return null;
    if (layoutPhase === "grid" || layoutPhase === "base") return null;
    // Serving team may pre-stack freely (no FIVB zone adjacency at serve contact).
    if (layoutPhase === "serve") return null;
    return checkFormationAlignment(resolvedPositions);
  }, [showAlignment, freeMove, layoutPhase, resolvedPositions]);

  const alignUi = useMemo(() => {
    if (layoutPhase === "serve" && (showAlignment || freeMove)) {
      return { tone: "ok", text: "Сервис — свободна подредба (без правило за зони)" };
    }
    return alignment ? alignmentStatusBg(alignment) : null;
  }, [layoutPhase, showAlignment, freeMove, alignment]);

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
    const el = layerRef.current || planeRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return clampCourtPct(x, y);
  };

  /** Pick chip by visual screen position (nearest center). */
  const findZoneAtClient = (clientX, clientY) => {
    let best = null;
    let bestScore = Infinity;
    for (const z of ZONES) {
      const el = chipRefs.current[z];
      if (!el) continue;
      if (!byZone[z] && !editable) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      const pad = 14;
      const inside =
        clientX >= r.left - pad &&
        clientX <= r.right + pad &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + pad;
      const score = inside ? dist * 0.25 : dist;
      if (score < bestScore) {
        bestScore = score;
        best = z;
      }
    }
    if (best == null || bestScore > HIT_RADIUS_PX) return null;
    return best;
  };

  const emitPositions = (zone, xy) => {
    const zNum = Number(zone);
    const cleaned = {};
    for (const [k, v] of Object.entries(positionOverrides || {})) {
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

  const armDrag = (zone, e) => {
    startZone.current = zone;
    dragZoneRef.current = zone;
    moved.current = false;
    dragging.current = false;
    clearLongPress();
    setSelectZone(null);

    const isTouch = e.pointerType === "touch";
    if (freeMove || rearrangeable) {
      if (freeMove) {
        dragging.current = true;
        setDragFrom(zone);
      } else if (isTouch && rearrangeable) {
        longPressTimer.current = setTimeout(() => {
          dragging.current = true;
          dragZoneRef.current = zone;
          setDragFrom(zone);
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try {
              navigator.vibrate(12);
            } catch {
              /* ignore */
            }
          }
        }, LONG_PRESS_MS);
      }
    }
  };

  // Window-level drag tracking — reliable on phone + desktop mouse.
  useEffect(() => {
    if (!freeMove || dragFrom == null) return undefined;

    const onMove = (e) => {
      if (startZone.current == null) return;
      moved.current = true;
      if (!dragging.current) {
        dragging.current = true;
        dragZoneRef.current = startZone.current;
      }
      const pct = pctFromEvent(e);
      const z = dragZoneRef.current ?? startZone.current;
      if (pct && z != null) {
        const next = { zone: Number(z), x: pct.x, y: pct.y };
        livePosRef.current = next;
        setLivePos(next);
      }
    };

    const onUp = (e) => {
      endFreeDrag(e);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeMove, dragFrom]);

  const onLayerPointerDown = (e) => {
    if (!canInteract || !isTactical) return;
    if (e.button != null && e.button !== 0) return;
    // Chip handlers own freeMove starts; layer only for empty-court pick / rearrange.
    if (freeMove && e.target !== layerRef.current && e.target?.closest?.("[data-zone]")) return;
    e.preventDefault();
    const zone = findZoneAtClient(e.clientX, e.clientY);
    if (zone == null) return;
    armDrag(zone, e);
  };

  const onLayerPointerMove = (e) => {
    if (!isTactical) return;
    if (!rearrangeable && !freeMove) return;
    if (freeMove) return; // window listener owns freeMove
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
    if (!dragging.current) return;

    const pct = pctFromEvent(e);
    if (pct) {
      setHoverZone(nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation }));
    }
  };

  const onLayerPointerUp = (e) => {
    if (!isTactical) return;
    if (freeMove) {
      // Window listener handles freeMove up; ignore duplicate from layer.
      return;
    }

    clearLongPress();
    const from = startZone.current;
    const dragZ = dragZoneRef.current ?? dragFrom;

    if (rearrangeable && dragging.current && dragZ != null && moved.current) {
      const pct = e ? pctFromEvent(e) : null;
      const target = pct
        ? nearestZone(pct.x, pct.y, { phase: layoutPhase, rotation })
        : hoverZone;
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

  const onLayerPointerCancel = () => {
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

  // Chip handlers for freeMove / grid
  const onPointerDown = (zone, e) => {
    if (!canInteract) return;
    if (isTactical && !freeMove) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    armDrag(zone, e);
  };

  const onPointerMove = (zone, e) => {
    if (isTactical && freeMove) return; // window listener
    if (isTactical && !freeMove) return;
    onLayerPointerMove(e);
    if (!dragging.current || freeMove) return;
    const pct = pctFromEvent(e);
    if (!pct) setHoverZone(zone);
  };

  const onPointerUp = (zone, e) => {
    if (isTactical && freeMove) return; // window listener
    if (isTactical && !freeMove) return;
    onLayerPointerUp(e);
  };

  const highlightZone = activeZone ?? selectZone;
  const onCourtIds = new Set(Object.values(byZone).map((p) => Number(p.athlete_id)));
  const showLiberoBench = libero && !onCourtIds.has(Number(libero.athlete_id));

  const faultLines = alignment?.faults || [];
  const warnLines = alignment?.legal ? alignment.warnings || [] : [];

  const zonesPaintOrder = useMemo(() => {
    return [...ZONES].sort((a, b) => {
      const ya = resolvedPositions[a]?.y ?? 50;
      const yb = resolvedPositions[b]?.y ?? 50;
      return ya - yb;
    });
  }, [resolvedPositions]);

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
    const shape = player?.role
      ? roleChipShape(player.role, rotation)
      : player?.position
        ? positionChipShape(player.position)
        : "circle";
    const shapeClass =
      shape === "triangle"
        ? " matchChipCircle--tri"
        : shape === "square"
          ? " matchChipCircle--sq"
          : shape === "star"
            ? " matchChipCircle--star"
            : "";
    const label =
      player?.role && layoutPhase !== "grid"
        ? roleChipLabel(player.role)
        : player
          ? positionShort(player.position)
          : null;
    const pos = resolvedPositions[zone] || { x: 50, y: 50 };
    const stackZ = isDrag ? 40 : isActive ? 30 : 10 + Math.round(Number(pos.y) || 50);

    const style = isTactical
      ? {
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          zIndex: stackZ,
          transition: freeMove || isDrag ? "none" : undefined,
        }
      : { touchAction: rearrangeable ? "none" : undefined };

    const Tag = isTactical ? "div" : "button";
    const interactiveProps = isTactical
      ? {
          ref: (el) => {
            chipRefs.current[zone] = el;
          },
          role: canInteract ? "button" : undefined,
          tabIndex: canInteract ? 0 : undefined,
          ...(freeMove
            ? {
                onPointerDown: (e) => onPointerDown(zone, e),
                onPointerMove: (e) => onPointerMove(zone, e),
                onPointerUp: (e) => onPointerUp(zone, e),
                onPointerCancel: onLayerPointerCancel,
              }
            : {}),
        }
      : {
          type: "button",
          disabled: !canInteract,
          onPointerDown: (e) => onPointerDown(zone, e),
          onPointerMove: (e) => onPointerMove(zone, e),
          onPointerUp: (e) => onPointerUp(zone, e),
          onPointerCancel: onLayerPointerCancel,
        };

    return (
      <Tag
        key={zone}
        className={`matchChipSlot${isTactical ? " matchChipSlot--abs" : ""}${isActive ? " matchChipSlot--active" : ""}${
          player ? " matchChipSlot--filled" : ""
        }${isServe ? " matchChipSlot--serve" : ""}${isDrag ? " matchChipSlot--drag" : ""}${
          isHover ? " matchChipSlot--drop" : ""
        }${front && player ? " matchChipSlot--front" : ""}${!front && player ? " matchChipSlot--back" : ""}${
          isFault ? " matchChipSlot--fault" : ""
        }${isWarn ? " matchChipSlot--tight" : ""}`}
        data-zone={zone}
        style={style}
        {...interactiveProps}
      >
        <span className="matchChipZoneBadge">{zone}</span>
        {player ? (
          <span className="matchChipStack">
            <span className="matchChipAvatar">
              {isActive ? <span className="matchChipSelectRing" aria-hidden /> : null}
              <span
                className={`matchChipCircle${shapeClass}`}
                style={{ background: color }}
                title={`${label || ""} · ${player.athlete_name || ""}`}
              >
                {label}
              </span>
            </span>
            <span className="matchChipTag">
              {player.jersey_number} {shortPlayerName(player.athlete_name)}
            </span>
          </span>
        ) : (
          <span className={`matchChipEmpty${isActive ? " matchChipEmpty--active" : ""}`}>
            {isActive ? <span className="matchChipSelectRing" aria-hidden /> : null}
            {editable ? "+" : "—"}
          </span>
        )}
        {isServe && player ? <span className="matchChipBall" aria-hidden title="Сервис" /> : null}
      </Tag>
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
        <p className="matchCourtHint">
          {layoutPhase === "serve"
            ? "Влачи свободно · сервиращият остава на начален удар"
            : "Влачи за позиция · зоните трябва да са легални при контакт"}
        </p>
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
              <div
                ref={layerRef}
                className={`matchCourtAbsLayer${canInteract ? " matchCourtAbsLayer--pick" : ""}`}
                onPointerDown={onLayerPointerDown}
                onPointerMove={onLayerPointerMove}
                onPointerUp={onLayerPointerUp}
                onPointerCancel={onLayerPointerCancel}
              >
                {zonesPaintOrder.map((z) => renderSlot(z))}
              </div>
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
