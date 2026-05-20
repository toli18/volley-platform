import { useEffect, useMemo, useRef, useState } from "react";

import { parseVideoUrl } from "../../utils/drillVideo";

const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

/** HTML5 video with controls in a bar below the picture (nothing overlaid on the video). */
function StreamVideo({ sources, onExhausted, openExternal, onPlaying }) {
  const videoRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = sources[index];

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setFailed(false);
  }, [sources]);

  useEffect(() => {
    if (sources.length === 0) onExhausted?.();
  }, [sources.length, onExhausted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    v.load();
  }, [src]);

  if (!src && sources.length === 0) return null;

  const handleError = () => {
    if (index < sources.length - 1) {
      setIndex((i) => i + 1);
      setFailed(false);
    } else {
      setFailed(true);
      onExhausted?.();
    }
  };

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v || failed) return;
    try {
      if (v.paused) await v.play();
      else v.pause();
    } catch {
      // ignore autoplay restrictions
    }
  };

  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const next = Number(e.target.value);
    v.currentTime = next;
    setCurrent(next);
  };

  return (
    <div className="drillVideoShell">
      <div className="drillVideoScreen">
        {!failed && src ? (
          <video
            ref={videoRef}
            key={src}
            src={src}
            playsInline
            preload="metadata"
            className="drillVideoNative drillVideoNative--bare"
            onError={handleError}
            onTimeUpdate={() => setCurrent(videoRef.current?.currentTime || 0)}
            onLoadedMetadata={() => {
              setDuration(videoRef.current?.duration || 0);
              setFailed(false);
            }}
            onLoadedData={() => {
              setFailed(false);
              if ((videoRef.current?.duration || 0) > 0) onPlaying?.();
            }}
            onPlay={() => {
              setPlaying(true);
              onPlaying?.();
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <div className="drillVideoScreenEmpty">Видеото не може да се зареди вградено.</div>
        )}
      </div>

      <div className="drillVideoControls">
        <button
          type="button"
          className="drillVideoCtrlBtn"
          onClick={togglePlay}
          disabled={failed || !src}
          aria-label={playing ? "Пауза" : "Пусни"}
        >
          {playing ? "⏸" : "▶"}
        </button>

        <input
          type="range"
          className="drillVideoSeek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          disabled={failed || !duration}
          onChange={handleSeek}
          aria-label="Позиция"
        />

        <span className="drillVideoTime">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        {failed && openExternal ? (
          <a
            className="drillVideoCtrlLink"
            href={openExternal}
            target="_blank"
            rel="noopener noreferrer"
          >
            Отвори
          </a>
        ) : null}
      </div>
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
  const [hideDriveHint, setHideDriveHint] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setEmbedIndex(0);
    setHideDriveHint(false);
  }, [parsed.original, initialMode]);

  const embedSrc = embedCandidates[embedIndex] || null;
  const isDrive = parsed.kind === "drive";
  const blockDriveEmbed = isMobile && isDrive;

  const handleStreamExhausted = () => {
    if (!blockDriveEmbed) setMode("embed");
  };

  const showEmbed = mode === "embed" && embedSrc && !blockDriveEmbed;

  return (
    <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
      {mode === "stream" ? (
        <StreamVideo
          sources={streamSrcs}
          onExhausted={handleStreamExhausted}
          openExternal={parsed.original}
          onPlaying={() => setHideDriveHint(true)}
        />
      ) : showEmbed ? (
        <EmbedFrame src={embedSrc} title={parsed.label} drive={isDrive} />
      ) : null}

      {isDrive && !hideDriveHint && !showEmbed ? (
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
