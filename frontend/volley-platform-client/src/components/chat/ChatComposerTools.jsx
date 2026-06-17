import { useEffect, useRef, useState } from "react";

import {
  CHAT_EMOJIS,
  CHAT_GIFS,
  gifFullUrl,
  gifThumbUrl,
  isGifSearchEnabled,
  searchTenorGifs,
} from "../../utils/chatContent";

export default function ChatComposerTools({ onInsertEmoji, onPickGifUrl, disabled = false }) {
  const [open, setOpen] = useState(null); // "emoji" | "gif" | null
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const wrapRef = useRef(null);
  const searchEnabled = isGifSearchEnabled();

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!searchEnabled || !query.trim()) {
      setResults([]);
      setSearchError("");
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError("");
        const gifs = await searchTenorGifs(query, { signal: controller.signal });
        setResults(gifs);
      } catch (err) {
        if (err?.name !== "AbortError") setSearchError("Търсенето не успя.");
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, searchEnabled]);

  const toggle = (panel) => setOpen((cur) => (cur === panel ? null : panel));

  const pickUrl = (url) => {
    setOpen(null);
    setQuery("");
    setResults([]);
    onPickGifUrl?.(url);
  };

  const showResults = searchEnabled && query.trim().length > 0;

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
              onClick={() => onInsertEmoji?.(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {open === "gif" ? (
        <div className="chatPickerPopover chatPickerPopover--gif" role="menu">
          {searchEnabled ? (
            <input
              type="text"
              className="chatGifSearch"
              placeholder="Търси GIF (напр. Nikolov, България)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          ) : null}

          {showResults ? (
            <>
              {searching ? <p className="chatPickerHint">Търсене...</p> : null}
              {searchError ? <p className="chatPickerHint">{searchError}</p> : null}
              {!searching && !searchError && results.length === 0 ? (
                <p className="chatPickerHint">Няма резултати.</p>
              ) : null}
              <div className="chatGifGrid">
                {results.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="chatGifThumbBtn chatGifThumbBtn--plain"
                    onClick={() => pickUrl(g.full)}
                  >
                    <img src={g.thumb} alt="GIF" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="chatPickerTitle">Волейбол GIF</p>
              <div className="chatGifGrid">
                {CHAT_GIFS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="chatGifThumbBtn"
                    onClick={() => pickUrl(gifFullUrl(g.id))}
                    title={g.label}
                  >
                    <img src={gifThumbUrl(g.id)} alt={g.label} loading="lazy" />
                    <span>{g.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
