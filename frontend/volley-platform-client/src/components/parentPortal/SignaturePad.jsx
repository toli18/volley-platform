/** Canvas signature pad for Form 03 (touch + mouse). */

import { useEffect, useRef, useState } from "react";

function isBlankDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return true;
  const b64 = dataUrl.split(",")[1] || "";
  return b64.length < 800;
}

export default function SignaturePad({
  label,
  required = false,
  disabled = false,
  onChange,
  height = 140,
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const paintBg = (canvas) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  };

  const emit = (ink) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const blank = !ink || isBlankDataUrl(dataUrl);
    onChange?.(blank ? null : dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintBg(canvas);
    setHasInk(false);
    onChange?.(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const fit = () => {
      const parent = canvas.parentElement;
      const w = Math.max(260, Math.floor(parent?.clientWidth || 320));
      canvas.width = w;
      canvas.height = height;
      paintBg(canvas);
      setHasInk(false);
      onChange?.(null);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // Intentionally reset pad on size change / mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches?.[0] || e;
    return {
      x: ((src.clientX - rect.left) / rect.width) * canvas.width,
      y: ((src.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = pos(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = (e) => {
    if (!drawing.current) return;
    e?.preventDefault?.();
    drawing.current = false;
    setHasInk(true);
    emit(true);
  };

  return (
    <div className="signaturePad">
      <div className="signaturePadHead">
        <span className="signaturePadLabel">
          {label}
          {required ? " *" : ""}
        </span>
        <button type="button" className="signaturePadClear" disabled={disabled || !hasInk} onClick={clear}>
          Изчисти
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="signaturePadCanvas"
        style={{ touchAction: "none", width: "100%", height }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <p className="signaturePadHint">Подпишете с пръст или мишка в полето.</p>
    </div>
  );
}
