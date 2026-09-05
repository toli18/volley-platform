import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { Button } from "../ui";

const SUGGESTIONS = [
  "Утре имаме мач, какво да тренираме днес?",
  "Имам проблем с отскока — откъде да започна?",
  "Как да им обясня зоните и да ги спазват?",
  "Генерирай тренировка за посрещане",
];

const TEAM_STORAGE_KEY = "coachAssist.teamId";

export default function CoachAssistantChat({
  ageBand,
  onRequestGenerate,
  onPlatformContext,
  context = {},
  sessionDate = "",
  onSessionDateChange,
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Здравей! Аз съм треньорският помощник. Избери отбор и дата, питай за мач/техника — после генерирай план, прегледай го и чак тогава го запази.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [platCtx, setPlatCtx] = useState(null);
  const [teamId, setTeamId] = useState(() => {
    try {
      const raw = localStorage.getItem(TEAM_STORAGE_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const onPlatformContextRef = useRef(onPlatformContext);
  onPlatformContextRef.current = onPlatformContext;

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

  // URL/program day team wins over localStorage
  useEffect(() => {
    const fromCtx = Number(context?.teamId || 0) || null;
    if (fromCtx && fromCtx !== teamId) {
      setTeamId(fromCtx);
      try {
        localStorage.setItem(TEAM_STORAGE_KEY, String(fromCtx));
      } catch {
        /* ignore */
      }
    }
  }, [context?.teamId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (teamId) params.set("team_id", String(teamId));
        const pinned = String(sessionDate || context?.date || "").trim();
        if (pinned) params.set("for_date", pinned);
        const qs = params.toString() ? `?${params.toString()}` : "";
        const data = await apiClient(`${API_PATHS.AI_COACH_ASSISTANT_CONTEXT}${qs}`);
        if (cancelled) return;
        setPlatCtx(data);
        onPlatformContextRef.current?.(data);
        const activeId = data?.activeTeam?.id;
        if (activeId && !teamId) {
          setTeamId(Number(activeId));
          try {
            localStorage.setItem(TEAM_STORAGE_KEY, String(activeId));
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setPlatCtx(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, sessionDate, context?.date]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const onTeamChange = (value) => {
    const id = value ? Number(value) : null;
    setTeamId(id);
    try {
      if (id) localStorage.setItem(TEAM_STORAGE_KEY, String(id));
      else localStorage.removeItem(TEAM_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

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
      const active = platCtx?.activeTeam;
      const pinnedDate = String(sessionDate || context?.date || "").trim() || undefined;
      const data = await apiClient(API_PATHS.AI_COACH_ASSISTANT_CHAT, {
        method: "POST",
        data: {
          message,
          ageBand: ageBand || active?.ageBand || undefined,
          context: {
            ...(context || {}),
            teamId: teamId || active?.id || undefined,
            teamName: active?.name || context?.teamName,
            daysUntilMatch:
              platCtx?.calendar?.nextMatch?.daysUntilMatch ?? context?.daysUntilMatch,
            programTheme:
              context?.programTheme ||
              platCtx?.program?.today?.theme ||
              platCtx?.program?.weekTheme,
            date: pinnedDate || platCtx?.program?.today?.date || undefined,
          },
          history,
        },
      });
      if (data?.platformContext) {
        setPlatCtx((prev) => ({
          ...(prev || {}),
          ...data.platformContext,
          teams: prev?.teams || data.platformContext.teams,
        }));
        onPlatformContext?.({
          ...(platCtx || {}),
          ...data.platformContext,
          teams: platCtx?.teams || [],
        });
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.reply || "Няма отговор.", meta: data },
      ]);
    } catch (e) {
      setErr(normalizeError(e, "Грешка при чата."));
    } finally {
      setBusy(false);
    }
  };

  const facts = platCtx?.knownFacts || [];
  const teams = platCtx?.teams || [];

  return (
    <div className="aiGenPanel coachAssistChat">
      <div className="coachAssistStatus">
        {status?.geminiAvailable
          ? `Режим: Gemini (${status.model || "flash"}) + локална методика`
          : "Режим: локална методика (без Gemini ключ)"}
      </div>

      <div className="coachAssistTeamBar">
        <label className="coachAssistTeamLabel">
          Отбор:
          <select
            value={teamId || ""}
            onChange={(e) => onTeamChange(e.target.value)}
            disabled={busy || teams.length === 0}
          >
            {teams.length === 0 ? <option value="">Няма активни отбори</option> : null}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.ageGroup ? ` (${t.ageGroup})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="coachAssistTeamLabel">
          Дата:
          <input
            type="date"
            className="coachAssistDateInput"
            value={sessionDate || ""}
            onChange={(e) => onSessionDateChange?.(e.target.value || "")}
            disabled={busy}
          />
        </label>
        {facts.length ? (
          <div className="coachAssistFacts" title={facts.join(" · ")}>
            {facts.slice(0, 3).map((f) => (
              <span key={f} className="coachAssistFact">
                {f}
              </span>
            ))}
          </div>
        ) : null}
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
                      generateParams: {
                        ...(platCtx?.generateDefaults || {}),
                        ...(m.meta?.generateParams || {}),
                        ...(sessionDate ? { sessionDate } : {}),
                        ...(teamId ? { teamId } : {}),
                      },
                    })
                  }
                  disabled={busy}
                >
                  {Array.isArray(m.meta?.generateParams?.proposedExercises) &&
                  m.meta.generateParams.proposedExercises.length
                    ? `Генерирай преглед (${m.meta.generateParams.proposedExercises.length} упр.)`
                    : "Генерирай преглед"}
                </Button>
                <div className="coachAssistGenHint">
                  Само преглед — после коригирай в „План“ и натисни „Запази“
                  {sessionDate ? ` за ${sessionDate}` : ""}.
                </div>
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
