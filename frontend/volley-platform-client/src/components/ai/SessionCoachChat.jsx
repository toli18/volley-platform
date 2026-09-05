import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { Button } from "../ui";

const SUGGESTIONS = [
  "Не им се получава това упражнение — как да го опростя?",
  "Какво да им кажа за зоните сега?",
  "Имаме по-малко играчи — как да пуснем блока?",
  "Дай cues за разпределителя в следващото упражнение",
];

/**
 * Live AI чат, вързан към конкретна записана тренировка (на терена / при преглед).
 */
export default function SessionCoachChat({
  trainingId,
  trainingTitle = "",
  teamId = null,
  sessionDate = "",
  compact = false,
}) {
  const [open, setOpen] = useState(!compact);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Питай ме за тази тренировка — упражнения, cues, адаптации при трудност. Говоря само за текущия план.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, open]);

  const send = async (raw) => {
    const message = String(raw || "").trim();
    if (!message || busy || !trainingId) return;
    setErr("");
    setInput("");
    const nextHistory = [...messages, { role: "user", content: message }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const history = nextHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .slice(-6)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));
      const data = await apiClient(API_PATHS.AI_COACH_ASSISTANT_CHAT, {
        method: "POST",
        data: {
          message,
          context: {
            trainingId: Number(trainingId),
            teamId: teamId ? Number(teamId) : undefined,
            date: sessionDate || undefined,
            mode: "session_live",
          },
          history,
        },
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.reply || "Няма отговор." },
      ]);
    } catch (e) {
      setErr(normalizeError(e, "Грешка при чата."));
    } finally {
      setBusy(false);
    }
  };

  if (compact && !open) {
    return (
      <button type="button" className="sessionCoachFab" onClick={() => setOpen(true)}>
        AI помощ за тренировката
      </button>
    );
  }

  return (
    <div id="session-coach" className={`sessionCoachChat${compact ? " sessionCoachChat--drawer" : ""}`}>
      <div className="sessionCoachHead">
        <div>
          <strong>AI на терена</strong>
          <div className="sessionCoachSub">
            {trainingTitle ? trainingTitle : `Тренировка #${trainingId}`}
            {sessionDate ? ` · ${sessionDate}` : ""}
          </div>
        </div>
        {compact ? (
          <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={() => setOpen(false)}>
            Затвори
          </button>
        ) : null}
      </div>

      <div className="sessionCoachSuggestions" aria-label="Бързи въпроси">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="coachAssistChip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <div className="sessionCoachMessages" role="log" aria-live="polite">
        {messages.map((m, idx) => (
          <div
            key={`${m.role}-${idx}`}
            className={`coachAssistBubble coachAssistBubble--${m.role || "assistant"}`}
          >
            <div className="coachAssistBubbleText">{m.content}</div>
          </div>
        ))}
        {busy ? <div className="coachAssistBubble coachAssistBubble--assistant">Мисля…</div> : null}
        <div ref={endRef} />
      </div>

      {err ? <div className="aiGenError">{err}</div> : null}

      <form
        className="coachAssistComposer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Какво не върви на терена?"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Изпрати
        </Button>
      </form>
    </div>
  );
}
