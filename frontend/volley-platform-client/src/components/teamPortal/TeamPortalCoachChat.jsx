import { useCallback, useEffect, useRef, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
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

export default function TeamPortalCoachChat({ teamId }) {
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const res = await axiosInstance.get(API_PATHS.TEAM_CHAT_MESSAGES(teamId));
    setMessages(Array.isArray(res.data) ? res.data : []);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    load().catch(() => {});
    const id = setInterval(() => load().catch(() => {}), 8000);
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
      }
    } finally {
      setBusy(false);
    }
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
        busy={busy}
        draft={draft}
        setDraft={setDraft}
        onSend={handleSend}
      />
    </Card>
  );
}

function CoachChatPanel({ messages, listRef, onDelete, busy, draft, setDraft, onSend }) {
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
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{msg.body}</p>
              <div
                className="teamPortalCoachChatMeta"
                style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
              >
                <span>{formatTime(msg.created_at)}</span>
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
          ))
        )}
      </div>
      <form className="teamPortalCoachChatComposer" onSubmit={onSend}>
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
