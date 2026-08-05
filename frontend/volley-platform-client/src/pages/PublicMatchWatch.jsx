import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import MatchCourt from "../components/matches/MatchCourt";
import MatchLiveSideStats from "../components/matches/MatchLiveSideStats";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { MATCH_FORMATS } from "../utils/matchPositions";
import { useToast } from "../components/ToastProvider";
import { normalizeError } from "../utils/normalizeError";

const POLL_MS = 2000;
const PHASES = [
  { id: "base", label: "База" },
  { id: "serve", label: "Сервис" },
  { id: "receive", label: "Посрещане" },
];
const NO_PLAYER = new Set(["opp_point", "our_point", "opp_error"]);

export default function PublicMatchWatch() {
  const { token } = useParams();
  const toast = useToast();
  const rootRef = useRef(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [phaseOverride, setPhaseOverride] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [posByKey, setPosByKey] = useState({});

  const load = useCallback(
    async (phase) => {
      const params = phase ? { phase } : phaseOverride ? { phase: phaseOverride } : undefined;
      const res = await axiosInstance.get(API_PATHS.PUBLIC_MATCH_LIVE(token), { params });
      setState(res.data);
      return res.data;
    },
    [token, phaseOverride],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await load();
        if (!alive) return;
        if (data?.expired) setError("Линкът е изтрит — мачът е приключен.");
      } catch (err) {
        if (!alive) return;
        setError(normalizeError(err, "Линкът не е валиден."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (loading || state?.expired || state?.status === "finished") return undefined;
    const t = setInterval(() => {
      if (busy) return;
      load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loading, state?.expired, state?.status, busy, load]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        setFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!fullscreen) {
      setFullscreen(true);
      try {
        const el = rootRef.current;
        const req = el?.requestFullscreen || el?.webkitRequestFullscreen;
        if (req) await req.call(el);
      } catch {
        /* iOS / locked — CSS fullscreen still works */
      }
      return;
    }
    setFullscreen(false);
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      }
    } catch {
      /* ignore */
    }
  };

  const run = async (fn) => {
    try {
      setBusy(true);
      const data = await fn();
      setState(data);
      if (data?.expired) setError("Мачът е приключен — линкът е изтрит.");
      return data;
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при въвеждане."));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const score = (side) =>
    run(async () => (await axiosInstance.post(API_PATHS.PUBLIC_MATCH_LIVE_SCORE(token), { side })).data);

  const undo = () => run(async () => (await axiosInstance.post(API_PATHS.PUBLIC_MATCH_LIVE_UNDO(token))).data);

  const recordStat = (action) => {
    let athleteId = selectedId;
    if (action === "ace" || action === "error") {
      const server = (state?.court || []).find((s) => Number(s.zone) === 1);
      if (server?.athlete_id) {
        athleteId = server.athlete_id;
        setSelectedId(server.athlete_id);
      }
    }
    if (!athleteId && !NO_PLAYER.has(action)) {
      toast.error("Изберете състезател от корта.");
      return;
    }
    run(
      async () =>
        (
          await axiosInstance.post(API_PATHS.PUBLIC_MATCH_LIVE_STAT(token), {
            action,
            athlete_id: athleteId || null,
            apply_score: true,
          })
        ).data,
    );
  };

  const formatLabel = useMemo(() => {
    const code = state?.format || "bo5";
    return MATCH_FORMATS.find((f) => f.code === code)?.label || "3 от 5";
  }, [state?.format]);

  const selected = useMemo(() => {
    if (!state || !selectedId) return null;
    return (state.court || []).find((p) => Number(p.athlete_id) === Number(selectedId)) || null;
  }, [state, selectedId]);

  if (loading) {
    return (
      <div className="publicWatchPage">
        <p className="publicWatchMuted">Зареждане...</p>
      </div>
    );
  }

  if (error || state?.expired) {
    return (
      <div className="publicWatchPage publicWatchPage--ended">
        <h1>Мачът приключи</h1>
        <p>{error || "Публичният линк вече не е активен."}</p>
      </div>
    );
  }

  if (!state) return null;

  const mset = state.set;
  const setFinished = mset?.status === "finished";
  const matchDone = state.status === "finished" || Boolean(state.match_won_by);
  const locked = Boolean(state.input_locked);
  const canWrite = !locked && !matchDone && !setFinished;
  const autoPhase = mset?.we_serve ? "serve" : "receive";
  const activePhase = phaseOverride || state.phase || autoPhase;
  const phaseLabel = PHASES.find((p) => p.id === activePhase)?.label || activePhase;
  const posKey = `${mset?.rotation ?? 1}:${activePhase}`;
  const positionOverrides = posByKey[posKey] || null;
  const canEditPositions = (activePhase === "receive" || activePhase === "serve") && canWrite;

  return (
    <div ref={rootRef} className={`publicWatchPage${fullscreen ? " publicWatchPage--fs" : ""}`}>
      <div className="matchLiveHud publicWatchHud">
      <div className="publicWatchTop">
        <div>
          <strong>vs {state.opponent_name || "противник"}</strong>
          <div className="publicWatchMeta">
            {formatLabel} · {state.sets_won_us ?? 0}:{state.sets_won_opp ?? 0}
            {mset
              ? ` · Гейм ${mset.set_number} · R${mset.rotation} · ${
                  mset.we_serve ? "наш сервис" : "чужд сервис"
                }`
              : ""}
            {locked ? " · заключено" : ""}
          </div>
        </div>
        <div className="publicWatchTopActions">
          <button type="button" className="publicWatchFsBtn" disabled={busy || !canWrite} onClick={undo}>
            Undo
          </button>
          <button type="button" className="publicWatchFsBtn" onClick={toggleFullscreen}>
            <span className="matchLiveBtnFull">{fullscreen ? "Изход от пълен екран" : "Пълен екран"}</span>
            <span className="matchLiveBtnShort" aria-hidden>
              {fullscreen ? "Изход" : "Екран"}
            </span>
          </button>
        </div>
      </div>

      <div className="matchLiveScore publicWatchScore">
        <div className="matchLiveScoreRow">
          <div className="matchLiveScoreSide matchLiveScoreSide--us">
            <button type="button" disabled={busy || !canWrite} onClick={() => score("us")}>
              +
            </button>
            <div>
              <div className="matchLiveScoreLabel">НИЕ</div>
              <div className="matchLiveScoreNum">{mset?.our_score ?? 0}</div>
            </div>
          </div>
          <div className="matchLiveScoreMid">
            <div>Гейм {mset?.set_number ?? "—"}</div>
            <div className="matchLiveServePill">
              {mset ? (mset.we_serve ? "● наш сервис" : "○ чужд сервис") : "—"}
            </div>
          </div>
          <div className="matchLiveScoreSide matchLiveScoreSide--opp">
            <div>
              <div className="matchLiveScoreLabel">OPP</div>
              <div className="matchLiveScoreNum">{mset?.opp_score ?? 0}</div>
            </div>
            <button type="button" disabled={busy || !canWrite} onClick={() => score("opp")}>
              +
            </button>
          </div>
        </div>

        <div className="matchLivePhaseBar" role="tablist">
          {PHASES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activePhase === p.id}
              className={`matchLivePhaseBtn${activePhase === p.id ? " is-active" : ""}`}
              onClick={() => {
                const next = p.id === autoPhase ? null : p.id;
                setPhaseOverride(next);
                load(next || undefined).catch(() => {});
              }}
            >
              <span className="matchLivePhaseLabel">{p.label}</span>
              {p.id === autoPhase && !phaseOverride ? <span className="matchLivePhaseAuto">auto</span> : null}
            </button>
          ))}
        </div>
      </div>
      </div>

      {locked ? <div className="matchLiveLockBanner">Въвеждането е заключено от треньора</div> : null}

      {(state.sets || []).length > 0 ? (
        <div className="matchLiveSetStrip">
          {(state.sets || []).map((s) => (
            <span key={s.set_number} className={s.status === "finished" ? "is-done" : "is-live"}>
              G{s.set_number} {s.our_score}:{s.opp_score}
            </span>
          ))}
        </div>
      ) : null}

      <MatchLiveSideStats
        selected={selected}
        disabled={busy || !canWrite}
        onStat={recordStat}
        events={state.recent_events || []}
      >
        <MatchCourt
          variant="pro"
          layout="tactical"
          size={fullscreen ? "lg" : "md"}
          phase={activePhase}
          rotation={mset?.rotation ?? 1}
          system={state.system || "5-1"}
          slots={state.court || []}
          libero={state.libero}
          showServe={Boolean(mset?.we_serve) && activePhase === "serve"}
          title={`Ротация ${mset?.rotation ?? 1}`}
          subtitle={`${state.system} · ${phaseLabel}`}
          activeZone={selected?.zone ?? null}
          positionEditable={canEditPositions && Boolean(mset) && mset.status !== "finished"}
          positionOverrides={positionOverrides}
          showAlignment={canEditPositions}
          onPositionsChange={(next) => {
            setPosByKey((prev) => ({ ...prev, [posKey]: next }));
          }}
          onZoneClick={(zone) => {
            const p = (state.court || []).find((s) => Number(s.zone) === Number(zone));
            if (p) setSelectedId(p.athlete_id);
          }}
        />
      </MatchLiveSideStats>
    </div>
  );
}
