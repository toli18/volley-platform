import { useEffect, useMemo, useRef, useState } from "react";

import DrillVideoPlayer from "./drills/DrillVideoPlayer";
import { collectDrillMedia, getDrillPrimaryMedia } from "../utils/drillVideo";

export { getDrillPrimaryMedia };

function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1);
  const touchStartRef = useRef(0);

  useEffect(() => {
    function onEsc(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function clampScale(x) {
    return Math.max(1, Math.min(4, x));
  }

  function zoom(delta) {
    setScale((s) => clampScale(Number((s + delta).toFixed(2))));
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    zoom(delta);
  }

  function onTouchStart() {
    const now = Date.now();
    if (now - touchStartRef.current < 280) {
      setScale((s) => (s === 1 ? 2 : 1));
    }
    touchStartRef.current = now;
  }

  return (
    <div className="dmpLbOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dmpLbTop" onClick={(e) => e.stopPropagation()}>
        <div className="dmpLbControls">
          <button className="dmpIconBtn" onClick={() => zoom(-0.2)} aria-label="Zoom out">
            −
          </button>
          <div className="dmpLbScale">{Math.round(scale * 100)}%</div>
          <button className="dmpIconBtn" onClick={() => zoom(0.2)} aria-label="Zoom in">
            +
          </button>
          <button className="dmpIconBtn" onClick={() => setScale(1)} aria-label="Reset zoom">
            ⟲
          </button>
        </div>
        <button className="dmpIconBtn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="dmpLbStage" onClick={(e) => e.stopPropagation()} onWheel={onWheel} onTouchStart={onTouchStart}>
        <img
          src={src}
          alt={alt || "Image"}
          className="dmpLbImg"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>
      <div className="dmpLbHint">Скрол за zoom (PC) • Двоен tap за zoom (телефон) • Esc за затваряне</div>
    </div>
  );
}

export default function DrillMediaPreviewModal({ drill, onClose }) {
  const title = drill?.title || `Упражнение #${drill?.id}`;

  const { images, videoItems } = useMemo(() => collectDrillMedia(drill || {}), [drill]);

  const defaultMain = useMemo(() => {
    if (videoItems.length > 0) return { type: "video", index: 0 };
    if (images.length > 0) return { type: "image", index: 0 };
    return { type: "none", index: 0 };
  }, [videoItems.length, images.length]);

  const [main, setMain] = useState(defaultMain);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => setMain(defaultMain), [defaultMain.type, defaultMain.index]);

  useEffect(() => {
    function onEsc(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function renderMainView() {
    if (main.type === "video" && videoItems[main.index]) {
      const v = videoItems[main.index];
      return (
        <div className="dmpPlayerBox">
          <DrillVideoPlayer key={v.original} url={v.original} />
          <div className="dmpPlayerCaption">
            Видео: <span className="dmpMutedSmall">{v.label}</span>
          </div>
        </div>
      );
    }

    if (main.type === "image" && images[main.index]) {
      const src = images[main.index];
      return (
        <div className="dmpPlayerBox">
          <button className="dmpImgMainBtn" onClick={() => setLightboxSrc(src)} title="Отвори със zoom">
            <img className="dmpImgMain" src={src} alt={title} />
            <div className="dmpImgMainHint">Zoom</div>
          </button>
          <div className="dmpPlayerCaption">
            Снимка:{" "}
            <span className="dmpMutedSmall">
              {main.index + 1} / {images.length}
            </span>
          </div>
        </div>
      );
    }

    return <div className="dmpPlayerEmpty">Няма видео/снимки за това упражнение.</div>;
  }

  return (
    <div className="dmpOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <style>{`
        .dmpOverlay{position:fixed; inset:0; background:rgba(0,0,0,.58); display:flex; align-items:center; justify-content:center; padding:14px; z-index:9999;}
        .dmpModal{width:min(1040px, 96vw); max-height:92vh; overflow:auto; background:#fff; border-radius:18px; border:1px solid #edf0f5; padding:14px; box-shadow:0 16px 50px rgba(9,30,66,.24);}
        @media(max-width: 760px){ .dmpOverlay{padding:0;} .dmpModal{width:100vw; height:100vh; max-height:none; border-radius:0; padding:12px;} }
        .dmpHeader{display:flex; justify-content:space-between; gap:12px; align-items:flex-start; position:sticky; top:0; background:#fff; padding-bottom:10px; border-bottom:1px solid #f1f4f8; margin-bottom:10px; z-index:1;}
        .dmpTitle{font-size:20px; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
        .dmpMutedSmall{font-size:12px; color:#657287; margin-top:4px;}
        .dmpIconBtn{border:none; background:#eef3fa; color:#243b5e; border-radius:12px; padding:8px 10px; cursor:pointer; font-weight:900;}
        .dmpIconBtn:hover{background:#e5edf8;}
        .dmpMainArea{margin-top:6px;}
        .dmpPlayerBox{border:1px solid #e9edf4; border-radius:14px; padding:10px; background:#fff;}
        .dmpPlayerCaption{margin-top:8px; font-weight:900; font-size:12px;}
        .dmpPlayerEmpty{border:1px dashed #dfe6f0; border-radius:14px; padding:14px; background:#fff; color:#657287; font-weight:900;}
        .dmpIframe{width:100%; aspect-ratio:16/9; border-radius:12px;}
        .dmpEmbedFallback{margin-top:8px; font-size:12px; color:#5b6a82;}
        .dmpEmbedFallback a{font-weight:900; color:#0b5cff;}
        .dmpVideo{width:100%; border-radius:12px;}
        .dmpImgMainBtn{border:none; padding:0; background:transparent; width:100%; cursor:pointer; position:relative;}
        .dmpImgMain{width:100%; border-radius:12px; border:1px solid #e9edf4; display:block; max-height:60vh; object-fit:cover;}
        .dmpImgMainHint{position:absolute; right:10px; bottom:10px; background:rgba(16,27,46,.74); color:#fff; font-size:12px; padding:6px 10px; border-radius:999px; font-weight:900;}
        .dmpPickers{margin-top:10px; display:grid; gap:10px;}
        .dmpPickerBlock{border:1px solid #e9edf4; border-radius:14px; padding:10px; background:#f8fbff;}
        .dmpPickerTitle{font-weight:900; margin-bottom:8px;}
        .dmpThumbRow,.dmpImgRow{display:flex; gap:8px; overflow:auto; padding-bottom:4px;}
        .dmpThumbBtn{flex:0 0 auto; border:1px solid #d8e2f0; background:#fff; border-radius:999px; padding:8px 10px; font-weight:900; cursor:pointer; font-size:12px;}
        .dmpThumbBtn.active{border-color:#0b5cff; box-shadow:0 0 0 3px rgba(11,92,255,.13);}
        .dmpImgThumbBtn{flex:0 0 auto; border:2px solid transparent; background:transparent; border-radius:12px; padding:0; cursor:pointer;}
        .dmpImgThumbBtn.active{border-color:#0b5cff;}
        .dmpImgThumb{width:112px; height:74px; object-fit:cover; border-radius:10px; border:1px solid #dfe6f0; display:block;}
        @media(max-width: 520px){ .dmpImgThumb{width:34vw; height:22vw;} }
        .dmpGrid{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;}
        @media(max-width: 820px){ .dmpGrid{grid-template-columns:1fr;} }
        .dmpCard{border:1px solid #e9edf4; border-radius:14px; padding:12px; background:#fff;}
        .dmpCardSoft{background:#f8fbff;}
        .dmpCardTitle{font-weight:900; margin-bottom:8px;}
        .dmpText{font-size:14px; line-height:1.5;}
        .dmpPre{white-space:pre-wrap;}
        .dmpFooter{margin-top:12px; display:flex; justify-content:flex-end;}
        .dmpBtn{padding:10px 12px; border-radius:12px; border:1px solid #d6deea; background:#fff; font-weight:900; cursor:pointer;}

        .dmpLbOverlay{position:fixed; inset:0; background:rgba(0,0,0,.93); z-index:10000; display:flex; flex-direction:column;}
        .dmpLbTop{display:flex; justify-content:space-between; align-items:center; padding:10px; gap:10px;}
        .dmpLbControls{display:flex; gap:8px; align-items:center;}
        .dmpLbScale{color:#fff; font-weight:900; font-size:12px; opacity:.9;}
        .dmpLbStage{flex:1; display:flex; align-items:center; justify-content:center; padding:10px; overflow:auto;}
        .dmpLbImg{max-width:92vw; max-height:80vh; transform-origin:center center; transition:transform .12s ease; border-radius:14px; user-select:none;}
        .dmpLbHint{position:fixed; bottom:10px; left:10px; right:10px; color:#dde5f3; font-size:12px; text-align:center; opacity:.85;}
      `}</style>
      <div className="dmpModal" onClick={(e) => e.stopPropagation()}>
        <div className="dmpHeader">
          <div style={{ minWidth: 0 }}>
            <div className="dmpTitle" title={title}>
              {title}
            </div>
            <div className="dmpMutedSmall">
              ID: {drill?.id} • {drill?.category || "—"} • {drill?.level || "—"}
            </div>
          </div>
          <button className="dmpIconBtn" onClick={onClose} aria-label="Затвори">
            ✕
          </button>
        </div>

        <div className="dmpMainArea">{renderMainView()}</div>

        {(videoItems.length > 1 || images.length > 1) && (
          <div className="dmpPickers">
            {videoItems.length > 1 && (
              <div className="dmpPickerBlock">
                <div className="dmpPickerTitle">Видео</div>
                <div className="dmpThumbRow">
                  {videoItems.map((v, i) => (
                    <button
                      key={v.original}
                      className={`dmpThumbBtn ${main.type === "video" && main.index === i ? "active" : ""}`}
                      onClick={() => setMain({ type: "video", index: i })}
                      title={v.original}
                    >
                      ▶ {v.label} {videoItems.length > 1 ? `#${i + 1}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {images.length > 0 && (
              <div className="dmpPickerBlock">
                <div className="dmpPickerTitle">Снимки</div>
                <div className="dmpImgRow">
                  {images.map((src, i) => (
                    <button
                      key={src}
                      className={`dmpImgThumbBtn ${main.type === "image" && main.index === i ? "active" : ""}`}
                      onClick={() => setMain({ type: "image", index: i })}
                      title="Покажи снимка"
                    >
                      <img className="dmpImgThumb" src={src} alt={`thumb-${i}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="dmpGrid">
          <div className="dmpCard dmpCardSoft">
            <div className="dmpCardTitle">Информация</div>
            <div className="dmpText">
              <div>
                <b>Категория:</b> {drill?.category || "—"}
              </div>
              <div>
                <b>Ниво:</b> {drill?.level || "—"}
              </div>
              <div>
                <b>Оборудване:</b> {drill?.equipment || "—"}
              </div>
              <div>
                <b>Интензитет:</b> {drill?.intensity || drill?.intensity_type || "—"}
              </div>
              <div>
                <b>Фокус:</b> {drill?.skill_focus || "—"}
              </div>
              {drill?.duration ? (
                <div>
                  <b>Време:</b> {drill.duration}
                </div>
              ) : null}
              {drill?.players ? (
                <div>
                  <b>Играч/и:</b> {drill.players}
                </div>
              ) : null}
            </div>
          </div>

          <div className="dmpCard">
            <div className="dmpCardTitle">Описание</div>
            <div className="dmpText dmpPre">{drill?.description || "Няма описание."}</div>
          </div>
        </div>

        <div className="dmpFooter">
          <button className="dmpBtn" onClick={onClose}>
            Затвори
          </button>
        </div>

        {lightboxSrc && <ImageLightbox src={lightboxSrc} alt={title} onClose={() => setLightboxSrc(null)} />}
      </div>
    </div>
  );
}

