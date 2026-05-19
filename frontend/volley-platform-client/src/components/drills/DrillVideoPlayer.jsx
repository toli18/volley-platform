import { parseVideoUrl } from "../../utils/drillVideo";

const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

function EmbedFrame({ src, title }) {
  return (
    <div className="drillVideoFrame">
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

function OpenVideoLink({ href, label = "Отвори видеото" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="drillVideoOpenBtn">
      {label}
    </a>
  );
}

export default function DrillVideoPlayer({ url, compact = false }) {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  const openLink = (
    <p className="drillVideoFallback">
      <OpenVideoLink href={parsed.original} label="Отвори в нов прозорец" />
    </p>
  );

  if (parsed.kind === "youtube" || parsed.kind === "vimeo") {
    return (
      <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
        <EmbedFrame src={parsed.embedSrc} title={parsed.label} />
        {openLink}
      </div>
    );
  }

  if (parsed.kind === "file") {
    return (
      <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
        <video controls playsInline preload="metadata" className="drillVideoNative">
          <source src={parsed.embedSrc} />
          Вашият браузър не поддържа вграждано видео.
        </video>
        {openLink}
      </div>
    );
  }

  if (parsed.kind === "drive") {
    return (
      <div className={`drillVideoPlayer drillVideoPlayer--drive${compact ? " drillVideoPlayer--compact" : ""}`}>
        <div className="drillVideoDriveCard">
          <p className="drillVideoDriveText">
            Видеото е в Google Drive. На телефон най-надеждно е да се отвори в браузъра.
          </p>
          <OpenVideoLink href={parsed.original} label="Отвори в Google Drive" />
        </div>
        <div className="drillVideoDriveEmbed">
          <EmbedFrame src={parsed.embedSrc} title="Google Drive" />
        </div>
      </div>
    );
  }

  if (parsed.kind === "dropbox" && parsed.embedSrc) {
    return (
      <div className={`drillVideoPlayer${compact ? " drillVideoPlayer--compact" : ""}`}>
        <EmbedFrame src={parsed.embedSrc} title="Dropbox" />
        {openLink}
      </div>
    );
  }

  return (
    <div className={`drillVideoPlayer drillVideoPlayer--external${compact ? " drillVideoPlayer--compact" : ""}`}>
      <p className="drillVideoDriveText">
        Този линк не може да се вгради надеждно в страницата (ограничение от сайта източник).
      </p>
      <OpenVideoLink href={parsed.original} />
    </div>
  );
}
