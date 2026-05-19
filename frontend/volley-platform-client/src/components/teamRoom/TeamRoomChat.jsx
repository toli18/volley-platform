import { useCallback, useEffect, useRef, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, EmptyState } from "../ui";

function formatChatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatChannelTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays < 7) {
      return d.toLocaleDateString("bg-BG", { weekday: "short" });
    }
    return d.toLocaleDateString("bg-BG", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function ChannelListBody({ channels, retentionDays, onPick }) {
  return (
    <div className="teamRoomChat">
      <p className="teamRoomChatHint">
        Изберете отборен канал. Съобщенията се пазят {retentionDays} дни.
      </p>
      <ul className="teamRoomChatChannelList">
        {channels.map((ch) => (
          <li key={ch.team_id}>
            <button type="button" className="teamRoomChatChannelBtn" onClick={() => onPick(ch.team_id)}>
              <span className="teamRoomChatChannelMain">
                <span className="teamRoomChatChannelName">{ch.team_name}</span>
                {ch.last_message_preview ? (
                  <span className="teamRoomChatChannelPreview">{ch.last_message_preview}</span>
                ) : (
                  <span className="teamRoomChatChannelPreview teamRoomMuted">Няма съобщения</span>
                )}
              </span>
              <span className="teamRoomChatChannelMeta">
                {ch.last_message_at ? (
                  <span className="teamRoomChatChannelTime">{formatChannelTime(ch.last_message_at)}</span>
                ) : null}
                {ch.unread_count > 0 ? (
                  <span className="teamRoomChatUnreadBadge" aria-label={`${ch.unread_count} непрочетени`}>
                    {ch.unread_count > 99 ? "99+" : ch.unread_count}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatBubble({ msg }) {
  return (
    <div
      className={`teamRoomChatBubble${msg.is_mine ? " teamRoomChatBubble--mine" : ""}${
        msg.sender_kind === "coach" ? " teamRoomChatBubble--coach" : ""
      }`}
    >
      {!msg.is_mine ? <span className="teamRoomChatSender">{msg.sender_label}</span> : null}
      <p className="teamRoomChatBody">{msg.body}</p>
      <time className="teamRoomChatTime" dateTime={msg.created_at}>
        {formatChatTime(msg.created_at)}
      </time>
    </div>
  );
}

function ThreadView({
  channels,
  selectedChannel,
  retentionDays,
  error,
  messages,
  listRef,
  draft,
  setDraft,
  sending,
  onBack,
  onSend,
}) {
  return (
    <div className="teamRoomChat teamRoomChat--thread">
      <header className="teamRoomChatThreadHead">
        {channels.length > 1 ? (
          <button type="button" className="teamRoomChatBackBtn" onClick={onBack} aria-label="Към каналите">
            ←
          </button>
        ) : null}
        <h2 className="teamRoomChatThreadTitle">{selectedChannel?.team_name || "Чат"}</h2>
      </header>
      <p className="teamRoomChatHint teamRoomChatHint--compact">
        История {retentionDays} дни · общ канал на отбора
      </p>
      {error ? <p className="teamRoomChatError">{error}</p> : null}
      <MessagesList listRef={listRef} messages={messages} />
      <form className="teamRoomChatComposer" onSubmit={onSend}>
        <input
          type="text"
          className="teamRoomChatInput"
          placeholder="Съобщение..."
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
        />
        <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
          Изпрати
        </Button>
      </form>
    </div>
  );
}

function MessagesList({ listRef, messages }) {
  return (
    <div className="teamRoomChatMessages" ref={listRef}>
      {messages.length === 0 ? (
        <p className="teamRoomMuted teamRoomChatEmpty">Първо съобщение — поздравете отбора.</p>
      ) : (
        messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)
      )}
    </div>
  );
}

export default function TeamRoomChat({ active, onUnreadChange, openTeamId, onOpenTeamConsumed }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState([]);
  const [retentionDays, setRetentionDays] = useState(15);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const totalUnread = channels.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  useEffect(() => {
    onUnreadChange?.(totalUnread);
  }, [totalUnread, onUnreadChange]);

  const loadChannels = useCallback(async ({ silent = false } = {}) => {
    if (!active) return;
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_CHAT_CHANNELS);
      const list = Array.isArray(res.data?.channels) ? res.data.channels : [];
      setChannels(list);
      setRetentionDays(res.data?.retention_days ?? 15);
      setSelectedTeamId((prev) => {
        if (prev != null) return prev;
        if (list.length === 1) return list[0].team_id;
        return null;
      });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Неуспешно зареждане на чатовете.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [active]);

  const loadMessages = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const res = await axiosInstance.get(API_PATHS.ATHLETE_ROOM_CHAT_MESSAGES(selectedTeamId));
      setMessages(Array.isArray(res.data) ? res.data : []);
      await axiosInstance.post(API_PATHS.ATHLETE_ROOM_CHAT_READ(selectedTeamId));
      setChannels((prev) =>
        prev.map((c) => (c.team_id === selectedTeamId ? { ...c, unread_count: 0 } : c)),
      );
    } catch {
      /* keep previous messages */
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (!active || !openTeamId) return;
    setSelectedTeamId(openTeamId);
    onOpenTeamConsumed?.();
  }, [active, openTeamId, onOpenTeamConsumed]);

  useEffect(() => {
    if (!active) return undefined;
    loadChannels();
    const id = setInterval(() => loadChannels({ silent: true }), 30000);
    return () => clearInterval(id);
  }, [active, loadChannels]);

  useEffect(() => {
    if (!active || !selectedTeamId) return undefined;
    loadMessages();
    const id = setInterval(loadMessages, 10000);
    return () => clearInterval(id);
  }, [active, selectedTeamId, loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedTeamId]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedTeamId || sending) return;
    try {
      setSending(true);
      setError("");
      const res = await axiosInstance.post(API_PATHS.ATHLETE_ROOM_CHAT_MESSAGES(selectedTeamId), {
        body: text,
      });
      setDraft("");
      if (res.data) {
        setMessages((prev) => [...prev, res.data]);
      }
      loadChannels({ silent: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Съобщението не беше изпратено.");
    } finally {
      setSending(false);
    }
  };

  const handlePickChannel = (teamId) => {
    setSelectedTeamId(teamId);
    setMessages([]);
    setError("");
  };

  const handleBack = () => {
    setSelectedTeamId(null);
    setMessages([]);
    setError("");
    loadChannels({ silent: true });
  };

  if (!active) return null;

  if (loading && channels.length === 0) {
    return <p className="teamRoomMuted">Зареждане на чатове...</p>;
  }

  if (error && channels.length === 0) {
    return (
      <EmptyState
        title="Чатът не е наличен"
        description={error}
        action={
          <Button type="button" size="sm" onClick={() => loadChannels()}>
            Опитай отново
          </Button>
        }
      />
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        title="Няма отборни чатове"
        description="Когато сте добавен в отбор, тук ще се появи общ канал с треньора и съотборниците."
      />
    );
  }

  const showChannelList = channels.length > 1 && selectedTeamId == null;
  const selectedChannel = channels.find((c) => c.team_id === selectedTeamId);

  if (showChannelList) {
    return <ChannelListBody channels={channels} retentionDays={retentionDays} onPick={handlePickChannel} />;
  }

  return (
    <ThreadView
      channels={channels}
      selectedChannel={selectedChannel}
      retentionDays={retentionDays}
      error={error}
      messages={messages}
      listRef={listRef}
      draft={draft}
      setDraft={setDraft}
      sending={sending}
      onBack={handleBack}
      onSend={handleSend}
    />
  );
}
