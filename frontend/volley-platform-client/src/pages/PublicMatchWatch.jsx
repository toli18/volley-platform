import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import MatchCourt from "../components/matches/MatchCourt";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { MATCH_FORMATS, shortPlayerName } from "../utils/matchPositions";
import { normalizeError } from "../utils/normalizeError";

const POLL_MS = 2000;

const PHASES = [
  { id: "base", label: "База" },
  { id: "serve", label: "Сервис" },
  { id: "receive", label: "Посрещане" },
];

const STAT_GROUPS = [
  {
    title: "Атака",
    items: [
      { action: "kill", label: "Атака+", tone: "good" },
      { action: "attack_error", label: "Атака−", tone: "bad" },
    ],
  },
  {
    title: "Сервис / блок",
    items: [
      { action: "ace", label: "Ас", tone: "good" },
      { action: "error", label: "Грешка Сервис", tone: "bad" },
      { action: "block", label: "Блок+", tone: "good" },
    ],
  },
  {
    title: "Защита",
    items: [{ action: "dig", label: "Защита", tone: "neutral" }],
  },
  {
    title: "Посрещане",
    items: [
      { action: "pass_3", label: "#", tone: "good" },
      { action: "pass_2", label: "+", tone: "good" },
      { action: "pass_1", label: "−", tone: "neutral" },
      { action: "pass_error", label: "Грешка Поср.", tone: "bad" },
    ],
  },
];

const ACTION_LABEL = {
  kill: "Атака+",
  ace: "Ас",
  block: "Блок+",
  attack_error: "Атака−",
  error: "Грешка сервис",
  dig: "Защита",
  pass_1: "Пос. −",
  pass_2: "Пос. +",
  pass_3: "Пос. #",
  pass_error: "Грешка поср.",
  opp_point: "Точка OPP",
  our_point: "Точка НИЕ",
  opp_error: "Грешка на противника",
};

export default function PublicMatchWatch() {
  const { token } = useParams();
  const rootRef = useRef(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [phaseOverride, setPhaseOverride] = useState(null);

  const load = useCallback(async () => {
    const params = phaseOverride ? { phase: phaseOverride } : undefined;
    const res = await axiosInstance.get(API_PATHS.PUBLIC_MATCH_LIVE(token), { params });
    setState(res.data);
    return res.data;
  }, [token, phaseOverride]);

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
  }, [load]);

  useEffect(() => {
    if (loading || state?.expired || state?.status === "finished") return undefined;
    const t = setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loading, state?.expired, state?.status, load]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const formatLabel = useMemo(() => {
    const code = state?.format || "bo5";
    return MATCH_FORMATS.find((f) => f.code === code)?.label || "3 от 5";
  }, [state?.format]);

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
  const autoPhase = mset?.we_serve ? "serve" : "receive";
  const activePhase = phaseOverride || state.phase || autoPhase;
  const phaseLabel = PHASES.find((p) => p.id === activePhase)?.label || activePhase;

  return (
    <div
      ref={rootRef}
      className={`publicWatchPage${fullscreen ? " publicWatchPage--fs" : ""}`}
    >
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
          </div>
        </div>
        <button type="button" className="publicWatchFsBtn" onClick={toggleFullscreen}>
          {fullscreen ? "Изход от пълен екран" : "Пълен екран"}
        </button>
      </div>

      {(state.sets || []).length > 0 ? (
        <div className="matchLiveSetStrip">
          {(state.sets || []).map((s) => (
            <span key={s.set_number} className={s.status === "finished" ? "is-done" : "is-live"}>
              G{s.set_number} {s.our_score}:{s.opp_score}
            </span>
          ))}
        </div>
      ) : null}

      <div className="matchLiveScore publicWatchScore">
        <div className="matchLiveScoreRow">
          <div className="matchLiveScoreSide matchLiveScoreSide--us">
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
          </div>
        </div>

        <div className="matchLivePhaseBar" role="tablist" aria-label="Формация">
          {PHASES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activePhase === p.id}
              className={`matchLivePhaseBtn${activePhase === p.id ? " is-active" : ""}`}
              onClick={() => setPhaseOverride(p.id === autoPhase ? null : p.id)}
            >
              <span className="matchLivePhaseLabel">{p.label}</span>
              {p.id === autoPhase && !phaseOverride ? <span className="matchLivePhaseAuto">auto</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="matchLiveGrid matchLiveGrid--courtOnly">
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
          positionEditable={false}
          showAlignment={activePhase === "receive"}
        />
      </div>

      {/* Визуални бутони за статистика — само преглед, без въвеждане */}
      <div className="matchLiveEntryBar publicWatchEntry" aria-hidden={false}>
        <div className="matchLiveSelected publicWatchSelectedHint">
          Преглед на статистика (само наблюдение)
        </div>
        <div className="matchLiveEntryRow" role="group" aria-label="Статистика (преглед)">
          <button type="button" className="matchLiveStatBtn matchLiveStatBtn--good" disabled>
            Грешка на противника
          </button>
          {STAT_GROUPS.flatMap((g) =>
            g.items.map((it) => (
              <button
                key={it.action}
                type="button"
                className={`matchLiveStatBtn matchLiveStatBtn--${it.tone}${
                  it.label.length <= 2 ? " matchLiveStatBtn--sym" : ""
                }`}
                disabled
                title={`${g.title}: ${ACTION_LABEL[it.action] || it.label}`}
              >
                {it.label}
              </button>
            )),
          )}
        </div>
        <div className="matchLiveEvents matchLiveEvents--compact">
          <div className="matchLiveStatGroupTitle">Последни</div>
          {(state.recent_events || []).slice(0, 6).map((ev) => (
            <div key={ev.id} className="matchLiveEventRow">
              <span>R{ev.rotation}</span>
              <span>{ev.athlete_name ? shortPlayerName(ev.athlete_name) : "—"}</span>
              <span>{ACTION_LABEL[ev.action] || ev.action}</span>
              <span>
                {ev.our_score}:{ev.opp_score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
