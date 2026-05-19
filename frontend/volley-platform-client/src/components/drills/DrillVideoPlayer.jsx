import { useEffect, useMemo, useState } from "react";

import { parseVideoUrl } from "../../utils/drillVideo";

const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

function EmbedFrame({ src, title }) {
  if (!src) return null;
  return (
    <div className="drillVideoFrame">
      <div className="drillVideoFrameAspect drillVideoFrameAspect--tall">
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

function AdaptivePlayer({ parsed, compact }) {
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

  const [embedIndex, setEmbedIndex] = useState(0);
  // Drive: Google preview iframe is the most reliable inline player (shared link).
  const preferEmbedFirst = parsed.kind === "drive";
  const [mode, setMode] = useState(() => {
    if (preferEmbedFirst && embedCandidates.length > 0) return "embed";
    return streamSrcs.length > 0 ? "stream" : "embed";
  });

  const embedSrc = embedCandidates[embedIndex] || null;

  const tryNextEmbed = () => {
    if (embedIndex < embedCandidates.length - 1) {
      setEmbedIndex((i) => i + 1);
    }
  };

  return (
    <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
      {mode === "stream" ? (
        <StreamVideo sources={streamSrcs} onExhausted={() => setMode("embed")} />
      ) : embedSrc ? (
        <div className="drillVideoFrame">
          <div className="drillVideoFrameAspect drillVideoFrameAspect--tall">
            <iframe
              title={parsed.label || "Видео"}
              src={embedSrc}
              className="drillVideoIframe"
              allow={EMBED_ALLOW}
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={tryNextEmbed}
            />
          </div>
        </div>
      ) : null}

      {parsed.kind === "drive" && mode === "embed" ? (
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
