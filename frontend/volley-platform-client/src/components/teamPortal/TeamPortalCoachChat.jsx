import { useCallback, useEffect, useRef, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { gifBodyFromUrl, parseChatBody } from "../../utils/chatContent";
import ChatComposerTools from "../chat/ChatComposerTools";
import { Button, Card, Input } from "../ui";

const RETENTION_DAYS = 15;

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatReadTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ChatReadSheet({ teamId, message, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await axiosInstance.get(API_PATHS.TEAM_CHAT_MESSAGE_READS(teamId, message.id));
        if (!alive) return;
        setDetail(res.data || null);
      } catch {
        if (!alive) return;
        const readBy = Array.isArray(message.read_by) ? message.read_by : [];
        const readIds = new Set(readBy.map((r) => r.athlete_id));
        setDetail({
          read_by: readBy,
          unread: [],
          read_count: readBy.length,
          roster_count: message.roster_count || readBy.length,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamId, message]);

  const readBy = detail?.read_by || message.read_by || [];
  const unread = detail?.unread || [];
  const rosterCount = detail?.roster_count ?? message.roster_count ?? 0;

  return (
    <div className="uiModalOverlay" onClick={onClose} role="presentation">
      <section className="uiModal uiModal--compact coachChatReadSheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3 className="uiModalTitle">Прочитания</h3>
        <p className="coachMobileMuted" style={{ marginTop: 0 }}>
          {message.read_count ?? readBy.length} от {rosterCount} състезатели
        </p>
        {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
        {!loading ? (
          <>
            <div className="coachChatReadBlock">
              <h4 className="coachChatReadHeading">Прочели</h4>
              {readBy.length === 0 ? (
                <p className="coachMobileMuted">Все още никой не е отбелязал прочитане.</p>
              ) : (
                <ul className="coachChatReadList">
                  {readBy.map((r) => (
                    <li key={r.athlete_id}>
                      <span>{r.athlete_name}</span>
                      <span className="coachMobileMuted">{formatReadTime(r.read_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {unread.length > 0 ? (
              <div className="coachChatReadBlock">
                <h4 className="coachChatReadHeading">Не са прочели</h4>
                <ul className="coachChatReadList">
                  {unread.map((r) => (
                    <li key={r.athlete_id}>
                      <span>{r.athlete_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="uiModalActions" style={{ marginTop: 12 }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Затвори
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function TeamPortalCoachChat({ teamId }) {
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [readTarget, setReadTarget] = useState(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const res = await axiosInstance.get(API_PATHS.TEAM_CHAT_MESSAGES(teamId));
    setMessages(Array.isArray(res.data) ? res.data : []);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    load().catch(() => {});
    const id = setInterval(() => load().catch(() => {}), 12000);
    return () => clearInterval(id);
  }, [teamId, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !teamId || busy) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_CHAT_MESSAGES(teamId), { body: text });
      setDraft("");
      if (res.data) {
        setMessages((prev) => [...prev, res.data]);
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSendGifUrl = async (gifUrl) => {
    if (!gifUrl || !teamId || busy) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_CHAT_MESSAGES(teamId), {
        body: gifBodyFromUrl(gifUrl),
      });
      if (res.data) {
        setMessages((prev) => [...prev, res.data]);
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInsertEmoji = (emoji) => {
    setDraft((prev) => (prev.length >= 2000 ? prev : `${prev}${emoji}`));
  };

  const handleDelete = async (messageId) => {
    if (!teamId || busy) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.TEAM_CHAT_MESSAGE_DELETE(teamId, messageId));
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } finally {
      setBusy(false);
    }
  };

  if (!teamId) return null;

  return (
    <Card title="Отборен чат" subtitle={`Съобщенията се пазят ${RETENTION_DAYS} дни`}>
      <CoachChatPanel
        messages={messages}
        listRef={listRef}
        onDelete={handleDelete}
        onShowReads={setReadTarget}
        busy={busy}
        draft={draft}
        setDraft={setDraft}
        onSend={handleSend}
        onInsertEmoji={handleInsertEmoji}
        onPickGifUrl={handleSendGifUrl}
      />
      {readTarget ? (
        <ChatReadSheet teamId={teamId} message={readTarget} onClose={() => setReadTarget(null)} />
      ) : null}
    </Card>
  );
}

function CoachChatPanel({ messages, listRef, onDelete, onShowReads, busy, draft, setDraft, onSend, onInsertEmoji, onPickGifUrl }) {
  return (
    <div className="teamPortalCoachChat">
      <div className="teamPortalCoachChatMessages" ref={listRef}>
        {messages.length === 0 ? (
          <p className="uiHint" style={{ margin: 0 }}>
            Няма съобщения. Първото ще го видят състезателите в стаята си.
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`teamPortalCoachChatBubble${
                msg.sender_kind === "coach" ? " teamPortalCoachChatBubble--mine" : ""
              }`}
            >
              <strong style={{ fontSize: 12 }}>{msg.sender_label}</strong>
              {(() => {
                const parsed = parseChatBody(msg.body);
                if (parsed.type === "gif") {
                  return <img className="teamPortalCoachChatGif" src={parsed.url} alt="GIF" loading="lazy" />;
                }
                return <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{msg.body}</p>;
              })()}
              <div className="teamPortalCoachChatMeta">
                <span>{formatTime(msg.created_at)}</span>
                <div className="teamPortalCoachChatMetaActions">
                  {msg.sender_kind === "coach" ? (
                    <button
                      type="button"
                      className="coachChatReadBtn"
                      disabled={busy}
                      onClick={() => onShowReads(msg)}
                    >
                      Прочетено {msg.read_count ?? 0}/{msg.roster_count ?? 0}
                    </button>
                  ) : null}
                  {msg.sender_kind === "coach" ? (
                    <button
                      type="button"
                      className="uiLinkButton"
                      disabled={busy}
                      onClick={() => onDelete(msg.id)}
                      style={{ fontSize: 11 }}
                    >
                      Изтрий
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <form className="teamPortalCoachChatComposer" onSubmit={onSend}>
        <ChatComposerTools onInsertEmoji={onInsertEmoji} onPickGifUrl={onPickGifUrl} disabled={busy} />
        <Input
          as="textarea"
          rows={2}
          placeholder="Съобщение към отбора..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
          Изпрати
        </Button>
      </form>
    </div>
  );
}
