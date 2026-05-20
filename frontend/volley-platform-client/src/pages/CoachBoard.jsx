import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const BOARD_STORAGE_KEY = "vp-coach-board-v1";
const COURT_WIDTH = 1000;
const COURT_HEIGHT = 560;
const MOBILE_BREAKPOINT = 768;

const TEAM_COLORS = {
  a: "#2563eb",
  b: "#dc2626",
};

function getInitialOrientation() {
  if (typeof window === "undefined") return "landscape";
  try {
    const raw = localStorage.getItem(BOARD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.orientation === "landscape" || parsed?.orientation === "portrait") {
        return parsed.orientation;
      }
    }
  } catch {
    // ignore
  }
  return window.innerWidth < MOBILE_BREAKPOINT ? "portrait" : "landscape";
}

function getViewportHeight() {
  if (typeof window === "undefined") return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Рисува волейболно игрище: мрежа + 3m линии според ориентацията на canvas-а. */
function drawVolleyballCourt(ctx, W, H, orientation) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#2456a5";
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(Math.min(W, H) * 0.06);
  const cW = W - pad * 2;
  const cH = H - pad * 2;

  ctx.fillStyle = "#f6be72";
  ctx.fillRect(pad, pad, cW, cH);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, Math.round(Math.min(W, H) * 0.007));
  ctx.strokeRect(pad, pad, cW, cH);

  if (orientation === "portrait") {
    const netY = pad + cH / 2;
    ctx.beginPath();
    ctx.moveTo(pad, netY);
    ctx.lineTo(pad + cW, netY);
    ctx.stroke();

    const threeM = cH * 0.25;
    ctx.beginPath();
    ctx.moveTo(pad, pad + threeM);
    ctx.lineTo(pad + cW, pad + threeM);
    ctx.moveTo(pad, pad + cH - threeM);
    ctx.lineTo(pad + cW, pad + cH - threeM);
    ctx.stroke();

    ctx.setLineDash([8, 8]);
    ctx.lineWidth = Math.max(1, Math.round(Math.min(W, H) * 0.004));
    ctx.beginPath();
    ctx.moveTo(0, pad + threeM);
    ctx.lineTo(W, pad + threeM);
    ctx.moveTo(0, pad + cH - threeM);
    ctx.lineTo(W, pad + cH - threeM);
    ctx.stroke();
  } else {
    const netX = pad + cW / 2;
    ctx.beginPath();
    ctx.moveTo(netX, pad);
    ctx.lineTo(netX, pad + cH);
    ctx.stroke();

    const threeM = cW * 0.25;
    ctx.beginPath();
    ctx.moveTo(pad + threeM, pad);
    ctx.lineTo(pad + threeM, pad + cH);
    ctx.moveTo(pad + cW - threeM, pad);
    ctx.lineTo(pad + cW - threeM, pad + cH);
    ctx.stroke();

    ctx.setLineDash([8, 8]);
    ctx.lineWidth = Math.max(1, Math.round(Math.min(W, H) * 0.004));
    ctx.beginPath();
    ctx.moveTo(pad + threeM, 0);
    ctx.lineTo(pad + threeM, H);
    ctx.moveTo(pad + cW - threeM, 0);
    ctx.lineTo(pad + cW - threeM, H);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

function createInitialPlayers(orientation = "landscape") {
  if (orientation === "portrait") {
    const top = [
      { id: "a1", team: "a", num: 1, x: 280, y: 140 },
      { id: "a2", team: "a", num: 2, x: 220, y: 260 },
      { id: "a3", team: "a", num: 3, x: 340, y: 360 },
      { id: "a4", team: "a", num: 4, x: 140, y: 200 },
      { id: "a5", team: "a", num: 5, x: 420, y: 200 },
      { id: "a6", team: "a", num: 6, x: 280, y: 420 },
    ];
    const bottom = [
      { id: "b1", team: "b", num: 1, x: 280, y: 860 },
      { id: "b2", team: "b", num: 2, x: 220, y: 740 },
      { id: "b3", team: "b", num: 3, x: 340, y: 640 },
      { id: "b4", team: "b", num: 4, x: 140, y: 800 },
      { id: "b5", team: "b", num: 5, x: 420, y: 800 },
      { id: "b6", team: "b", num: 6, x: 280, y: 580 },
    ];
    return [...top, ...bottom];
  }

  const left = [
    { id: "a1", team: "a", num: 1, x: 170, y: 120 },
    { id: "a2", team: "a", num: 2, x: 310, y: 220 },
    { id: "a3", team: "a", num: 3, x: 170, y: 320 },
    { id: "a4", team: "a", num: 4, x: 390, y: 120 },
    { id: "a5", team: "a", num: 5, x: 390, y: 320 },
    { id: "a6", team: "a", num: 6, x: 310, y: 430 },
  ];
  const right = [
    { id: "b1", team: "b", num: 1, x: 830, y: 120 },
    { id: "b2", team: "b", num: 2, x: 690, y: 220 },
    { id: "b3", team: "b", num: 3, x: 830, y: 320 },
    { id: "b4", team: "b", num: 4, x: 610, y: 120 },
    { id: "b5", team: "b", num: 5, x: 610, y: 320 },
    { id: "b6", team: "b", num: 6, x: 690, y: 430 },
  ];
  return [...left, ...right];
}

export default function CoachBoard() {
  const toast = useToast();
  const containerRef = useRef(null);
  const dockRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const [dockHeight, setDockHeight] = useState(56);
  const lastCanvasRef = useRef({ w: 0, h: 0, orientation: getInitialOrientation() });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState([]);
  const [activeStroke, setActiveStroke] = useState(null);
  const [color, setColor] = useState("#111827");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState("pen");
  const [orientation, setOrientation] = useState(getInitialOrientation);
  const [players, setPlayers] = useState(() => createInitialPlayers(getInitialOrientation()));
  const [dragPlayerId, setDragPlayerId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showGear, setShowGear] = useState(true);
  const [activityTick, setActivityTick] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false,
  );

  const ratio = orientation === "landscape" ? COURT_WIDTH / COURT_HEIGHT : COURT_HEIGHT / COURT_WIDTH;

  const currentPaint = useMemo(
    () => ({
      color: tool === "eraser" ? "#ffffff" : color,
      width: Number(lineWidth) || 4,
      eraser: tool === "eraser",
    }),
    [tool, color, lineWidth],
  );

  const showRotateBanner = isMobile && orientation === "landscape";

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setDockHeight(el.offsetHeight || 56);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, controlsOpen, showRotateBanner]);

  useEffect(() => {
    const fitCourt = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const vh = getViewportHeight();
      const dockH = dockHeight + (isMobile ? 8 : 12);
      const topBarH = controlsOpen && !isMobile ? 52 : showRotateBanner ? 48 : 0;
      const shellPad = fullscreen ? 8 : isMobile ? 8 : 20;
      const maxW = Math.max(280, rect.width);
      const flexH = rect.height > 80 ? rect.height : vh - dockH - topBarH - shellPad;
      const maxH = Math.max(280, flexH);

      let width = maxW;
      let height = Math.round(width / ratio);
      if (height > maxH) {
        height = maxH;
        width = Math.round(height * ratio);
      }
      setCanvasSize({ width, height });
    };

    fitCourt();
    const raf = window.requestAnimationFrame(fitCourt);
    window.addEventListener("resize", fitCourt);
    window.visualViewport?.addEventListener("resize", fitCourt);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", fitCourt);
      window.visualViewport?.removeEventListener("resize", fitCourt);
    };
  }, [ratio, controlsOpen, fullscreen, isMobile, showRotateBanner, dockHeight]);

  useEffect(() => {
    const last = lastCanvasRef.current;
    if (
      last.w &&
      last.h &&
      canvasSize.width &&
      canvasSize.height &&
      last.orientation !== orientation
    ) {
      setPlayers((prev) =>
        prev.map((pl) => ({
          ...pl,
          x: Math.max(20, Math.min(canvasSize.width - 20, Math.round((pl.x / last.w) * canvasSize.width))),
          y: Math.max(20, Math.min(canvasSize.height - 20, Math.round((pl.y / last.h) * canvasSize.height))),
        })),
      );
    }
    lastCanvasRef.current = { w: canvasSize.width, h: canvasSize.height, orientation };
  }, [canvasSize.width, canvasSize.height, orientation]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOARD_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.strokes)) setStrokes(parsed.strokes);
      if (Array.isArray(parsed?.players)) setPlayers(parsed.players);
      if (parsed?.orientation === "landscape" || parsed?.orientation === "portrait") {
        setOrientation(parsed.orientation);
      }
    } catch {
      // ignore invalid cache
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        BOARD_STORAGE_KEY,
        JSON.stringify({
          strokes: strokes.slice(-300),
          players,
          orientation,
        }),
      );
    } catch {
      // ignore
    }
  }, [strokes, players, orientation]);

  useEffect(() => {
    if (isMobile || (!showGear && !controlsOpen)) return;
    const t = window.setTimeout(() => {
      setControlsOpen(false);
      setShowGear(false);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [activityTick, showGear, controlsOpen, isMobile]);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    drawVolleyballCourt(ctx, canvas.width, canvas.height, orientation);
  }, [canvasSize, orientation]);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawStroke = (stroke) => {
      if (!stroke?.points?.length) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    };

    [...strokes, ...(activeStroke ? [activeStroke] : [])].forEach(drawStroke);
  }, [canvasSize, strokes, activeStroke]);

  const pushUndo = () => {
    setUndoStack((prev) => [...prev.slice(-50), { strokes, players }]);
  };

  const pingActivity = () => {
    setShowGear(true);
    setActivityTick((n) => n + 1);
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes(last.strokes || []);
    setPlayers(last.players || createInitialPlayers(orientation));
  };

  const clearBoard = () => {
    pushUndo();
    setStrokes([]);
  };

  const clearLastStroke = () => {
    if (!strokes.length) return;
    pushUndo();
    setStrokes((prev) => prev.slice(0, -1));
  };

  const resetPlayers = () => {
    pushUndo();
    setPlayers(createInitialPlayers(orientation));
  };

  const setPortraitCourt = () => {
    pingActivity();
    if (orientation !== "portrait") setOrientation("portrait");
  };

  const toggleOrientation = () => {
    pingActivity();
    setOrientation((v) => (v === "landscape" ? "portrait" : "landscape"));
  };

  const toggleFullscreen = async () => {
    pingActivity();
    if (!fullscreen) {
      setFullscreen(true);
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // CSS fullscreen still works
      }
      return;
    }
    setFullscreen(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const getPoint = (evt) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const isTouch = evt.touches && evt.touches[0];
    const clientX = isTouch ? evt.touches[0].clientX : evt.clientX;
    const clientY = isTouch ? evt.touches[0].clientY : evt.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (evt) => {
    pingActivity();
    if (dragPlayerId) return;
    const p = getPoint(evt);
    if (!p) return;
    pushUndo();
    setActiveStroke({
      color: currentPaint.color,
      width: currentPaint.width,
      points: [p],
    });
  };

  const moveDraw = (evt) => {
    if (!activeStroke || dragPlayerId) return;
    const p = getPoint(evt);
    if (!p) return;
    setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev));
  };

  const endDraw = () => {
    if (!activeStroke) return;
    setStrokes((prev) => [...prev, activeStroke]);
    setActiveStroke(null);
  };

  const exportPng = async () => {
    const bg = bgCanvasRef.current;
    const fg = drawCanvasRef.current;
    if (!bg || !fg) return;
    const out = document.createElement("canvas");
    out.width = bg.width;
    out.height = bg.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(fg, 0, 0);

    players.forEach((pl) => {
      ctx.beginPath();
      ctx.fillStyle = TEAM_COLORS[pl.team] || "#111827";
      ctx.arc(pl.x, pl.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pl.num), pl.x, pl.y);
    });

    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-${Date.now()}.png`;
    a.click();
    toast.success("Дъската е експортирана като PNG.");
  };

  const startDragPlayer = (id) => {
    pingActivity();
    pushUndo();
    setDragPlayerId(id);
    setSelectedPlayerId(id);
  };

  const moveDragPlayer = (evt) => {
    if (!dragPlayerId) return;
    const p = getPoint(evt);
    if (!p) return;
    setPlayers((prev) => prev.map((pl) => (pl.id === dragPlayerId ? { ...pl, x: p.x, y: p.y } : pl)));
  };

  const endDragPlayer = () => setDragPlayerId(null);

  const addPlayer = (team) => {
    pingActivity();
    pushUndo();
    const teamRows = players.filter((p) => p.team === team);
    const nextNum = teamRows.length ? Math.max(...teamRows.map((p) => Number(p.num) || 0)) + 1 : 1;
    const id = `${team}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const baseX = Math.round(canvasSize.width * 0.5);
    const baseY =
      orientation === "portrait"
        ? team === "a"
          ? Math.round(canvasSize.height * 0.28)
          : Math.round(canvasSize.height * 0.72)
        : Math.round(canvasSize.height * 0.5);
    const jitterX =
      orientation === "portrait" ? Math.round((Math.random() - 0.5) * 80) : Math.round((Math.random() - 0.5) * 80);
    const jitterY =
      orientation === "portrait" ? Math.round((Math.random() - 0.5) * 40) : Math.round((Math.random() - 0.5) * 80);
    const p = {
      id,
      team,
      num: nextNum,
      x: Math.max(24, Math.min((canvasSize.width || 1000) - 24, baseX + jitterX)),
      y: Math.max(24, Math.min((canvasSize.height || 560) - 24, baseY + jitterY)),
    };
    setPlayers((prev) => [...prev, p]);
    setSelectedPlayerId(id);
  };

  const removeSelectedPlayer = () => {
    if (!selectedPlayerId) return;
    pingActivity();
    pushUndo();
    setPlayers((prev) => prev.filter((p) => p.id !== selectedPlayerId));
    setSelectedPlayerId(null);
  };

  const backTo = isMobile ? "/coach/menu" : "/";

  return (
    <div className={`coachBoardPage${fullscreen ? " coachBoardPage--fullscreen" : ""}`}>
      <section className="coachBoardShell">
        {showGear && !isMobile ? (
          <button
            type="button"
            className="coachBoardGearBtn"
            onClick={() => {
              pingActivity();
              setControlsOpen((v) => !v);
            }}
            title={controlsOpen ? "Скрий инструментите" : "Покажи инструментите"}
          >
            {controlsOpen ? "✖" : "⚙"}
          </button>
        ) : null}

        {showRotateBanner ? (
          <div className="coachBoardRotateBanner">
            <span>На телефон игрището е по-голямо вертикално.</span>
            <button type="button" className="coachBoardDockBtn coachBoardDockBtn--active" onClick={setPortraitCourt}>
              Вертикално
            </button>
          </div>
        ) : null}

        {controlsOpen ? (
          <div className="coachBoardTopBar" onClick={pingActivity}>
            <Button as={Link} to={backTo} variant="secondary" size="sm">
              Назад
            </Button>
            <Button size="sm" variant={tool === "pen" ? "primary" : "secondary"} onClick={() => setTool("pen")}>
              Писалка
            </Button>
            <Button size="sm" variant={tool === "eraser" ? "primary" : "secondary"} onClick={() => setTool("eraser")}>
              Гума
            </Button>
            <Button size="sm" variant="secondary" onClick={undo} disabled={!undoStack.length}>
              Undo
            </Button>
            <Button size="sm" variant="secondary" onClick={clearLastStroke} disabled={!strokes.length}>
              ⌫ Линия
            </Button>
            <Button size="sm" variant="secondary" onClick={clearBoard} disabled={!strokes.length}>
              Изчисти
            </Button>
            <Button size="sm" variant="secondary" onClick={resetPlayers}>
              Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addPlayer("a")}>
              +A
            </Button>
            <Button size="sm" variant="secondary" onClick={() => addPlayer("b")}>
              +B
            </Button>
            <Button size="sm" variant="danger" onClick={removeSelectedPlayer} disabled={!selectedPlayerId}>
              −
            </Button>
            <Button size="sm" onClick={exportPng}>
              PNG
            </Button>
            <Button size="sm" variant="secondary" onClick={toggleOrientation}>
              {orientation === "landscape" ? "Вертикално" : "Хоризонтално"}
            </Button>
            <Button size="sm" variant="secondary" onClick={toggleFullscreen}>
              {fullscreen ? "Изход FS" : "Цял екран"}
            </Button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 8px" }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === "eraser"} />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 8px" }}>
              Дебелина
              <input type="range" min={2} max={20} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
            </label>
          </div>
        ) : null}

        <div ref={containerRef} className="coachBoardCourtWrap">
          <div
            className="coachBoardCourt"
            style={{
              width: canvasSize.width || "100%",
              height: canvasSize.height || 360,
            }}
            onMouseDown={pingActivity}
            onTouchStart={pingActivity}
            onMouseMove={moveDragPlayer}
            onMouseUp={endDragPlayer}
            onMouseLeave={endDragPlayer}
            onTouchMove={moveDragPlayer}
            onTouchEnd={endDragPlayer}
          >
            <canvas ref={bgCanvasRef} />
            <canvas
              ref={drawCanvasRef}
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />
            {players.map((pl) => (
              <button
                key={pl.id}
                type="button"
                title={`Играч ${pl.num}`}
                className={`coachBoardPlayerBtn${selectedPlayerId === pl.id ? " coachBoardPlayerBtn--selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  pingActivity();
                  setSelectedPlayerId(pl.id);
                  if (tool === "eraser") {
                    pushUndo();
                    setPlayers((prev) => prev.filter((x) => x.id !== pl.id));
                    setSelectedPlayerId(null);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startDragPlayer(pl.id);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  startDragPlayer(pl.id);
                }}
                style={{
                  left: pl.x - 18,
                  top: pl.y - 18,
                  background: TEAM_COLORS[pl.team] || "#111827",
                }}
              >
                {pl.num}
              </button>
            ))}
          </div>
        </div>

        <nav ref={dockRef} className="coachBoardDock" aria-label="Инструменти">
          {isMobile ? (
            <Button as={Link} to={backTo} variant="secondary" size="sm" className="coachBoardDockBack">
              ←
            </Button>
          ) : null}
          <button
            type="button"
            className={`coachBoardDockBtn${tool === "pen" ? " coachBoardDockBtn--active" : ""}`}
            onClick={() => {
              pingActivity();
              setTool("pen");
            }}
          >
            ✏️
          </button>
          <button
            type="button"
            className={`coachBoardDockBtn${tool === "eraser" ? " coachBoardDockBtn--active" : ""}`}
            onClick={() => {
              pingActivity();
              setTool("eraser");
            }}
          >
            🧽
          </button>
          <button type="button" className="coachBoardDockBtn" onClick={clearLastStroke} disabled={!strokes.length}>
            ⌫
          </button>
          <button type="button" className="coachBoardDockBtn" onClick={() => addPlayer("a")}>
            +A
          </button>
          <button type="button" className="coachBoardDockBtn" onClick={() => addPlayer("b")}>
            +B
          </button>
          <button
            type="button"
            className="coachBoardDockBtn coachBoardDockBtn--danger"
            onClick={removeSelectedPlayer}
            disabled={!selectedPlayerId}
          >
            −
          </button>
          <button type="button" className="coachBoardDockBtn" onClick={toggleOrientation}>
            {orientation === "landscape" ? "↕" : "↔"}
          </button>
          <button type="button" className="coachBoardDockBtn" onClick={toggleFullscreen}>
            ⛶
          </button>
          {isMobile ? (
            <button
              type="button"
              className="coachBoardDockBtn"
              onClick={() => {
                pingActivity();
                setControlsOpen((v) => !v);
              }}
            >
              ⚙
            </button>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
