import { useEffect, useRef, useState } from "react";

import { CHAT_EMOJIS, CHAT_GIFS, gifThumbUrl } from "../../utils/chatContent";

export default function ChatComposerTools({ onInsertEmoji, onPickGif, disabled = false }) {
  const [open, setOpen] = useState(null); // "emoji" | "gif" | null
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (panel) => setOpen((cur) => (cur === panel ? null : panel));

  return (
    <div className="chatTools" ref={wrapRef}>
      <button
        type="button"
        className={`chatToolBtn${open === "emoji" ? " chatToolBtn--active" : ""}`}
        onClick={() => toggle("emoji")}
        disabled={disabled}
        aria-label="Емоджи"
        title="Емоджи"
      >
        😊
      </button>
      <button
        type="button"
        className={`chatToolBtn chatToolBtn--gif${open === "gif" ? " chatToolBtn--active" : ""}`}
        onClick={() => toggle("gif")}
        disabled={disabled}
        aria-label="GIF"
        title="GIF"
      >
        GIF
      </button>

      {open === "emoji" ? (
        <div className="chatPickerPopover chatPickerPopover--emoji" role="menu">
          {CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="chatEmojiBtn"
              onClick={() => {
                onInsertEmoji?.(emoji);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {open === "gif" ? (
        <div className="chatPickerPopover chatPickerPopover--gif" role="menu">
          <p className="chatPickerTitle">Волейбол GIF</p>
          <div className="chatGifGrid">
            {CHAT_GIFS.map((g) => (
              <button
                key={g.id}
                type="button"
                className="chatGifThumbBtn"
                onClick={() => {
                  setOpen(null);
                  onPickGif?.(g.id);
                }}
                title={g.label}
              >
                <img src={gifThumbUrl(g.id)} alt={g.label} loading="lazy" />
                <span>{g.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
