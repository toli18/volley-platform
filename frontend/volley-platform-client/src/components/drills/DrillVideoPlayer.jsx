import { useEffect, useMemo, useState } from "react";

import { parseVideoUrl } from "../../utils/drillVideo";

const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

function useIsMobileViewport() {
  const query = () => {
    if (typeof window === "undefined") return false;
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    return narrow || touch;
  };

  const [mobile, setMobile] = useState(query);

  useEffect(() => {
    const mqs = [
      window.matchMedia("(max-width: 900px)"),
      window.matchMedia("(pointer: coarse)"),
    ];
    const onChange = () => setMobile(query());
    mqs.forEach((mq) => mq.addEventListener("change", onChange));
    onChange();
    return () => mqs.forEach((mq) => mq.removeEventListener("change", onChange));
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
      controlsList="nodownload"
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

function MobileDriveFallback({ original }) {
  return (
    <div className="drillVideoMobileFallback">
      <p>Вграденият Drive плеър показва прекалено големи бутони на телефона.</p>
      <a href={original} target="_blank" rel="noopener noreferrer">
        Отвори видеото
      </a>
    </div>
  );
}

function resolveInitialMode(parsed, isMobile, embedCandidates, streamSrcs) {
  if (parsed.kind === "drive") {
    if (streamSrcs.length > 0) return "stream";
    if (!isMobile && embedCandidates.length > 0) return "embed";
    return "stream";
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
  const [mobileStreamFailed, setMobileStreamFailed] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setEmbedIndex(0);
    setMobileStreamFailed(false);
  }, [parsed.original, initialMode]);

  const embedSrc = embedCandidates[embedIndex] || null;
  const isDrive = parsed.kind === "drive";
  const blockDriveEmbed = isMobile && isDrive;

  const handleStreamExhausted = () => {
    if (blockDriveEmbed) {
      setMobileStreamFailed(true);
      return;
    }
    setMode("embed");
  };

  const showEmbed = mode === "embed" && embedSrc && !blockDriveEmbed;

  return (
    <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
      {mobileStreamFailed ? (
        <MobileDriveFallback original={parsed.original} />
      ) : mode === "stream" ? (
        <StreamVideo sources={streamSrcs} onExhausted={handleStreamExhausted} />
      ) : showEmbed ? (
        <EmbedFrame src={embedSrc} title={parsed.label} drive={isDrive} />
      ) : null}

      {isDrive && mode === "stream" && !mobileStreamFailed && !isMobile ? (
        <p className="drillVideoHint">
          Видеото трябва да е споделено в Drive като „Всеки с линка“ (най-добре MP4).
        </p>
      ) : null}

      {isDrive && showEmbed ? (
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
