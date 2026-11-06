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
  /** Optional controlled PNG data URL — restored after remount / canvas resize */
  value = null,
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastDataUrlRef = useRef(null);
  const lastLayoutWidthRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const paintBg = (ctx, canvas) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  };

  const drawStoredImage = (canvas, dataUrl) =>
    new Promise((resolve) => {
      if (!dataUrl) {
        resolve(false);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        paintBg(ctx, canvas);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });

  const emit = (ink) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const blank = !ink || isBlankDataUrl(dataUrl);
    if (blank) {
      lastDataUrlRef.current = null;
      onChange?.(null);
      return;
    }
    lastDataUrlRef.current = dataUrl;
    onChange?.(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    paintBg(ctx, canvas);
    lastDataUrlRef.current = null;
    setHasInk(false);
    onChange?.(null);
  };

  const layoutCanvas = async () => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const w = Math.max(260, Math.floor(parent.clientWidth || 320));
    if (Math.abs(w - lastLayoutWidthRef.current) < 2 && canvas.width > 0) {
      return;
    }
    lastLayoutWidthRef.current = w;

    const stored = lastDataUrlRef.current;
    canvas.width = w;
    canvas.height = height;

    if (stored && !isBlankDataUrl(stored)) {
      const ok = await drawStoredImage(canvas, stored);
      setHasInk(ok);
      if (ok) {
        lastDataUrlRef.current = canvas.toDataURL("image/png");
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    paintBg(ctx, canvas);
    setHasInk(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    let debounceId = 0;
    const scheduleLayout = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        layoutCanvas();
      }, 180);
    };

    layoutCanvas();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleLayout) : null;
    ro?.observe(parent);

    const onOrientation = () => scheduleLayout();
    window.addEventListener("orientationchange", onOrientation);

    return () => {
      window.clearTimeout(debounceId);
      ro?.disconnect();
      window.removeEventListener("orientationchange", onOrientation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useEffect(() => {
    if (value && !isBlankDataUrl(value)) {
      lastDataUrlRef.current = value;
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0) {
        drawStoredImage(canvas, value).then((ok) => setHasInk(ok));
      } else {
        setHasInk(true);
      }
      return;
    }
    if (value === null && lastDataUrlRef.current === null) {
      setHasInk(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, height]);

  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches?.[0] || e.changedTouches?.[0] || e;
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

  const cancelStroke = (e) => {
    if (!drawing.current) return;
    e?.preventDefault?.();
    drawing.current = false;
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
        onMouseLeave={(e) => {
          // Не прекъсвай щриха при леко излизане към скрол/съседни контроли.
          const next = e.relatedTarget;
          if (next && canvasRef.current?.parentElement?.contains(next)) return;
          end(e);
        }}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        onTouchCancel={cancelStroke}
      />
      <p className="signaturePadHint">Подпишете с пръст или мишка в полето.</p>
    </div>
  );
}
