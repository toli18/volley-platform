import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button } from "../ui";

const SUGGESTIONS = [
  "Утре имаме мач, какво да тренираме днес?",
  "Имам проблем с отскока — откъде да започна?",
  "Как да им обясня зоните и да ги спазват?",
  "Генерирай тренировка за посрещане",
];

export default function CoachAssistantChat({
  ageBand,
  onRequestGenerate,
  context = {},
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Здравей! Аз съм треньорският помощник. Питай за мач, отскок, зони, посрещане — или кажи да генерирам тренировка.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient(API_PATHS.AI_COACH_ASSISTANT_STATUS);
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus({ geminiAvailable: false, mode: "local_only" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (raw) => {
    const message = String(raw || "").trim();
    if (!message || busy) return;
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
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const data = await apiClient(API_PATHS.AI_COACH_ASSISTANT_CHAT, {
        method: "POST",
        data: {
          message,
          ageBand: ageBand || undefined,
          context: context || {},
          history,
        },
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.reply || "Няма отговор.", meta: data },
      ]);
      if (data?.wantsGenerate && typeof onRequestGenerate === "function") {
        // не генерираме автоматично — показваме бутон чрез meta
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Грешка при чата.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aiGenPanel coachAssistChat">
      <div className="coachAssistStatus">
        {status?.geminiAvailable
          ? `Режим: Gemini (${status.model || "flash"}) + локална методика`
          : "Режим: локална методика (без Gemini ключ)"}
      </div>

      <div className="coachAssistSuggestions" aria-label="Бързи въпроси">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="coachAssistChip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <div className="coachAssistMessages" role="log" aria-live="polite">
        {messages.map((m, idx) => (
          <div
            key={`${m.role}-${idx}`}
            className={`coachAssistBubble coachAssistBubble--${m.role || "assistant"}`}
          >
            <div className="coachAssistBubbleText">{m.content}</div>
            {m.meta?.wantsGenerate ? (
              <div className="coachAssistGenAction">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onRequestGenerate?.({
                      hintText: m.content,
                      userMessage: m.meta?.generateParams?.sourceMessage || "",
                      generateParams: m.meta?.generateParams || {},
                    })
                  }
                  disabled={busy}
                >
                  Генерирай тренировка сега
                </Button>
              </div>
            ) : null}
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
          placeholder="Питай помощника…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Изпрати
        </Button>
      </form>
    </div>
  );
}
