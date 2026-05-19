import { useEffect, useMemo, useState } from "react";

import { parseVideoUrl } from "../../utils/drillVideo";

const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

function useIsMobileViewport() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

function EmbedFrame({ src, title, drive = false }) {
  if (!src) return null;
  return (
    <div className={`drillVideoFrame${drive ? " drillVideoFrame--drive" : ""}`}>
      <div className="drillVideoFrameAspect">
        <iframe
          title={title || "Видео"}
          src={src}
          className="drillVideoIframe"
          allow={EMBED_ALLOW}
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}

function StreamVideo({ sources, onExhausted }) {
  const [index, setIndex] = useState(0);
  const src = sources[index];

  useEffect(() => {
    if (sources.length === 0) onExhausted?.();
  }, [sources.length, onExhausted]);

  if (!src) return null;

  const handleError = () => {
    if (index < sources.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onExhausted?.();
    }
  };

  return (
    <video
      key={src}
      controls
      playsInline
      preload="metadata"
      className="drillVideoNative"
      onError={handleError}
    >
      <source src={src} type="video/mp4" />
      <source src={src} />
      Вашият браузър не поддържа вграждано видео.
    </video>
  );
}

function resolveInitialMode(parsed, isMobile, embedCandidates, streamSrcs) {
  if (parsed.kind === "drive") {
    // Drive iframe breaks on short mobile boxes; native video controls center correctly.
    if (isMobile && streamSrcs.length > 0) return "stream";
    if (embedCandidates.length > 0) return "embed";
    return streamSrcs.length > 0 ? "stream" : "embed";
  }
  return streamSrcs.length > 0 ? "stream" : "embed";
}

function AdaptivePlayer({ parsed, compact }) {
  const isMobile = useIsMobileViewport();
  const streamSrcs = parsed.streamSrcs || [];
  const embedCandidates = useMemo(() => {
    if (Array.isArray(parsed.embedCandidates) && parsed.embedCandidates.length > 0) {
      return parsed.embedCandidates;
    }
    const list = [];
    if (parsed.embedSrc) list.push(parsed.embedSrc);
    if (parsed.original && !list.includes(parsed.original)) list.push(parsed.original);
    return list;
  }, [parsed.embedCandidates, parsed.embedSrc, parsed.original]);

  const initialMode = useMemo(
    () => resolveInitialMode(parsed, isMobile, embedCandidates, streamSrcs),
    [parsed, isMobile, embedCandidates, streamSrcs]
  );

  const [embedIndex, setEmbedIndex] = useState(0);
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    setMode(initialMode);
    setEmbedIndex(0);
  }, [parsed.original, initialMode]);

  const embedSrc = embedCandidates[embedIndex] || null;
  const isDrive = parsed.kind === "drive";

  return (
    <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
      {mode === "stream" ? (
        <StreamVideo sources={streamSrcs} onExhausted={() => setMode("embed")} />
      ) : embedSrc ? (
        <EmbedFrame src={embedSrc} title={parsed.label} drive={isDrive} />
      ) : null}

      {isDrive && mode === "embed" ? (
        <p className="drillVideoHint">
          Видеото трябва да е споделено в Drive като „Всеки с линка“ (най-добре MP4).
        </p>
      ) : null}
    </div>
  );
}

export default function DrillVideoPlayer({ url, compact = false }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  if (parsed.kind === "youtube" || parsed.kind === "vimeo") {
    return (
      <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
        <EmbedFrame src={parsed.embedSrc} title={parsed.label} />
      </div>
    );
  }

  return <AdaptivePlayer parsed={parsed} compact={compact} />;
}
