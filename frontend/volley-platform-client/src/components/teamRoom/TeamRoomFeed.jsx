import { useCallback, useState } from "react";

import { resolveStaticUrl } from "../../utils/staticUrl";
import { EmptyState } from "../ui";

const QUICK_EMOJIS = ["👍", "🔥", "⚽", "🚀"];
const REACTIONS_KEY = "team_room_feed_reactions";

function loadReactions() {
  try {
    const raw = localStorage.getItem(REACTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReactions(map) {
  try {
    localStorage.setItem(REACTIONS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function formatFeedTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function FeedCard({ item, reaction, onReact }) {
  const isImage = item.kind === "image" && item.url;
  return (
    <article className="teamRoomFeedCard">
      <time className="teamRoomFeedCardTime" dateTime={item.created_at}>
        {formatFeedTime(item.created_at)}
      </time>
      {isImage ? (
        <figure className="teamRoomFeedCardMedia">
          <img src={resolveStaticUrl(item.url)} alt={item.file_name || "Снимка"} loading="lazy" />
        </figure>
      ) : (
        <p className="teamRoomFeedCardBody">{item.body}</p>
      )}
      <div className="teamRoomEmojiBar" role="group" aria-label="Бърза реакция">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`teamRoomEmojiBtn${reaction === emoji ? " is-selected" : ""}`}
            onClick={() => onReact(item.id, emoji)}
            aria-pressed={reaction === emoji}
            aria-label={`Реакция ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function TeamRoomFeed({ items }) {
  const [reactions, setReactions] = useState(loadReactions);

  const handleReact = useCallback((itemId, emoji) => {
    setReactions((prev) => {
      const next = { ...prev, [itemId]: prev[itemId] === emoji ? null : emoji };
      if (!next[itemId]) delete next[itemId];
      saveReactions(next);
      return { ...next };
    });
  }, []);

  if (!items?.length) {
    return (
      <EmptyState
        title="Няма новини"
        description="Треньорът ще публикува съобщения за отбора тук."
      />
    );
  }

  return (
    <div className="teamRoomFeedList">
      {items.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          reaction={reactions[item.id]}
          onReact={handleReact}
        />
      ))}
    </div>
  );
}
