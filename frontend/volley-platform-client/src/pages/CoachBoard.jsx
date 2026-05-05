import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

const BOARD_STORAGE_KEY = "vp-coach-board-v1";
const COURT_WIDTH = 1000;
const COURT_HEIGHT = 560;

const TEAM_COLORS = {
  a: "#2563eb",
  b: "#dc2626",
};

function createInitialPlayers() {
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
  const bgCanvasRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState([]);
  const [activeStroke, setActiveStroke] = useState(null);
  const [color, setColor] = useState("#111827");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState("pen"); // pen | eraser
  const [orientation, setOrientation] = useState("landscape"); // landscape | portrait
  const [players, setPlayers] = useState(createInitialPlayers);
  const [dragPlayerId, setDragPlayerId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);

  const ratio = orientation === "landscape" ? COURT_WIDTH / COURT_HEIGHT : COURT_HEIGHT / COURT_WIDTH;

  const currentPaint = useMemo(
    () => ({
      color: tool === "eraser" ? "#ffffff" : color,
      width: Number(lineWidth) || 4,
      eraser: tool === "eraser",
    }),
    [tool, color, lineWidth]
  );

  useEffect(() => {
    const onResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const maxW = Math.max(280, rect.width - 2);
      const maxH = Math.max(260, window.innerHeight - 260);
      let width = maxW;
      let height = Math.round(width / ratio);
      if (height > maxH) {
        height = maxH;
        width = Math.round(height * ratio);
      }
      setCanvasSize({ width, height });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ratio]);

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
        })
      );
    } catch {
      // ignore
    }
  }, [strokes, players, orientation]);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || !canvasSize.width || !canvasSize.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const W = canvas.width;
    const H = canvas.height;
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

    // Center line (net)
    ctx.beginPath();
    ctx.moveTo(pad + cW / 2, pad);
    ctx.lineTo(pad + cW / 2, pad + cH);
    ctx.stroke();

    // 3m lines
    const threeM = cW * 0.25;
    ctx.beginPath();
    ctx.moveTo(pad + threeM, pad);
    ctx.lineTo(pad + threeM, pad + cH);
    ctx.moveTo(pad + cW - threeM, pad);
    ctx.lineTo(pad + cW - threeM, pad + cH);
    ctx.stroke();

    // dashed attack helper outside
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = Math.max(1, Math.round(Math.min(W, H) * 0.004));
    ctx.beginPath();
    ctx.moveTo(pad + threeM, 0);
    ctx.lineTo(pad + threeM, H);
    ctx.moveTo(pad + cW - threeM, 0);
    ctx.lineTo(pad + cW - threeM, H);
    ctx.stroke();
    ctx.setLineDash([]);
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

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes(last.strokes || []);
    setPlayers(last.players || createInitialPlayers());
  };

  const clearBoard = () => {
    pushUndo();
    setStrokes([]);
  };

  const resetPlayers = () => {
    pushUndo();
    setPlayers(createInitialPlayers());
  };

  const getPoint = (evt) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const isTouch = evt.touches && evt.touches[0];
    const clientX = isTouch ? evt.touches[0].clientX : evt.clientX;
    const clientY = isTouch ? evt.touches[0].clientY : evt.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (evt) => {
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
      ctx.arc(pl.x, pl.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
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
    pushUndo();
    setDragPlayerId(id);
  };

  const moveDragPlayer = (evt) => {
    if (!dragPlayerId) return;
    const p = getPoint(evt);
    if (!p) return;
    setPlayers((prev) => prev.map((pl) => (pl.id === dragPlayerId ? { ...pl, x: p.x, y: p.y } : pl)));
  };

  const endDragPlayer = () => setDragPlayerId(null);

  return (
    <div className="uiPage">
      <PageHero
        title="Тактическа дъска"
        subtitle="Рисувай, мести играчи и обяснявай схеми в почивките."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button as={Link} to="/" variant="secondary">
              Назад
            </Button>
          </div>
        }
      />

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Button size="sm" variant={tool === "pen" ? "primary" : "secondary"} onClick={() => setTool("pen")}>
            ✏️ Писалка
          </Button>
          <Button size="sm" variant={tool === "eraser" ? "primary" : "secondary"} onClick={() => setTool("eraser")}>
            🧽 Гума
          </Button>
          <Button size="sm" variant="secondary" onClick={undo} disabled={!undoStack.length}>
            ↶ Undo
          </Button>
          <Button size="sm" variant="secondary" onClick={clearBoard} disabled={!strokes.length}>
            🗑️ Изчисти линии
          </Button>
          <Button size="sm" variant="secondary" onClick={resetPlayers}>
            ♻️ Reset играчи
          </Button>
          <Button size="sm" onClick={exportPng}>
            📤 Export PNG
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOrientation((v) => (v === "landscape" ? "portrait" : "landscape"))}
          >
            🔄 {orientation === "landscape" ? "Портрет" : "Ландшафт"}
          </Button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 8px" }}>
            🎨
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === "eraser"} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 8px" }}>
            Дебелина
            <input type="range" min={2} max={20} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
          </label>
        </div>

        <div ref={containerRef} style={{ width: "100%" }}>
          <div
            style={{
              position: "relative",
              width: canvasSize.width || "100%",
              height: canvasSize.height || 360,
              maxWidth: "100%",
              borderRadius: 12,
              overflow: "hidden",
              touchAction: "none",
              margin: "0 auto",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
            onMouseMove={moveDragPlayer}
            onMouseUp={endDragPlayer}
            onMouseLeave={endDragPlayer}
            onTouchMove={moveDragPlayer}
            onTouchEnd={endDragPlayer}
          >
            <canvas ref={bgCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <canvas
              ref={drawCanvasRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
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
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startDragPlayer(pl.id);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  startDragPlayer(pl.id);
                }}
                style={{
                  position: "absolute",
                  left: pl.x - 16,
                  top: pl.y - 16,
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  border: "2px solid #fff",
                  boxShadow: "0 2px 8px rgba(0,0,0,.25)",
                  background: TEAM_COLORS[pl.team] || "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "grab",
                }}
              >
                {pl.num}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
