import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import MatchCourt from "../../components/matches/MatchCourt";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { positionShort, shortPlayerName, MATCH_FORMATS } from "../../utils/matchPositions";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

const POLL_MS = 2500;
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
  pass_0: "Пос. 0",
  pass_1: "Пос. −",
  pass_2: "Пос. +",
  pass_3: "Пос. #",
  free_ball: "Свободна",
  pass_error: "Грешка поср.",
  opp_point: "Точка OPP",
  our_point: "Точка НИЕ",
  opp_error: "Грешка на противника",
};

const PHASES = [
  { id: "base", label: "База" },
  { id: "serve", label: "Сервис" },
  { id: "receive", label: "Посрещане" },
];

const NO_PLAYER_ACTIONS = new Set(["opp_point", "our_point", "opp_error"]);

const EMPTY_ROW = () => ({
  kills: 0,
  attack_err: 0,
  aces: 0,
  serve_err: 0,
  blocks: 0,
  digs: 0,
  pass_hash: 0,
  pass_plus: 0,
  pass_minus: 0,
  pass_err: 0,
});

function buildStatTable({ roster = [], court = [], libero = null, events = [] }) {
  const byId = new Map();

  const ensure = (id, seed = {}) => {
    const key = Number(id);
    if (!key) return null;
    if (!byId.has(key)) {
      byId.set(key, {
        athlete_id: key,
        jersey_number: seed.jersey_number ?? "—",
        athlete_name: seed.athlete_name || "",
        position: seed.position || "",
        ...EMPTY_ROW(),
      });
    } else if (seed.athlete_name || seed.jersey_number != null || seed.position) {
      const row = byId.get(key);
      if (seed.athlete_name) row.athlete_name = seed.athlete_name;
      if (seed.jersey_number != null) row.jersey_number = seed.jersey_number;
      if (seed.position) row.position = seed.position;
    }
    return byId.get(key);
  };

  for (const p of roster) {
    ensure(p.athlete_id, p);
  }
  for (const p of court) {
    ensure(p.athlete_id, p);
  }
  if (libero) ensure(libero.athlete_id, libero);

  for (const ev of events) {
    if (!ev.athlete_id) continue;
    const row =
      ensure(ev.athlete_id, {
        athlete_name: ev.athlete_name || "",
      }) || null;
    if (!row) continue;
    switch (ev.action) {
      case "kill":
        row.kills += 1;
        break;
      case "attack_error":
        row.attack_err += 1;
        break;
      case "ace":
        row.aces += 1;
        break;
      case "error":
        row.serve_err += 1;
        break;
      case "block":
        row.blocks += 1;
        break;
      case "dig":
        row.digs += 1;
        break;
      case "pass_3":
        row.pass_hash += 1;
        break;
      case "pass_2":
        row.pass_plus += 1;
        break;
      case "pass_1":
        row.pass_minus += 1;
        break;
      case "pass_error":
        row.pass_err += 1;
        break;
      default:
        break;
    }
  }

  return [...byId.values()].sort((a, b) => Number(a.jersey_number) - Number(b.jersey_number));
}

function rowSummary(row) {
  const bits = [];
  if (row.kills) bits.push(`${row.kills} точки атака`);
  if (row.attack_err) bits.push(`${row.attack_err} гр. атака`);
  if (row.aces) bits.push(`${row.aces} ас`);
  if (row.serve_err) bits.push(`${row.serve_err} гр. сервис`);
  if (row.blocks) bits.push(`${row.blocks} блок`);
  if (row.digs) bits.push(`${row.digs} защита`);
  const passTotal = row.pass_hash + row.pass_plus + row.pass_minus + row.pass_err;
  if (passTotal) {
    bits.push(`поср. #${row.pass_hash}/+${row.pass_plus}/−${row.pass_minus}/гр${row.pass_err}`);
  }
  return bits.length ? bits.join(" · ") : "няма записи";
}

export default function CoachMatchLive() {
  const { teamId, matchId } = useParams();
  const [searchParams] = useSearchParams();
  const viewOnly = searchParams.get("mode") === "view";
  const teamIdNum = Number(teamId);
  const matchIdNum = Number(matchId);
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [phaseOverride, setPhaseOverride] = useState(null);
  /** zone → {x,y}% coach stack overrides (per rotation+phase) */
  const [posByKey, setPosByKey] = useState({});
  const [statsOpen, setStatsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateServe, setGateServe] = useState(true);
  const [gateRotation, setGateRotation] = useState(1);
  const [gateMode, setGateMode] = useState("start"); // start | next
  const [shareHint, setShareHint] = useState("");

  const selected = useMemo(() => {
    if (!state || !selectedId) return null;
    return (state.court || []).find((p) => Number(p.athlete_id) === Number(selectedId)) || null;
  }, [state, selectedId]);

  const formatLabel = useMemo(() => {
    const code = state?.format || "bo5";
    return MATCH_FORMATS.find((f) => f.code === code)?.label || "3 от 5";
  }, [state?.format]);

  const statRows = useMemo(
    () =>
      buildStatTable({
        roster,
        court: state?.court || [],
        libero: state?.libero,
        events: state?.recent_events || [],
      }),
    [roster, state],
  );

  const load = async (phase) => {
    const params = phase ? { phase } : undefined;
    const res = await axiosInstance.get(API_PATHS.TEAM_MATCH_LIVE(teamIdNum, matchIdNum), { params });
    setState(res.data);
    return res.data;
  };

  const openGate = (mode, data) => {
    setGateMode(mode);
    setGateServe(true);
    setGateRotation(1);
    setGateOpen(true);
    if (data?.can_edit_lineup && mode === "next") {
      // keep defaults
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const detail = await axiosInstance.get(API_PATHS.TEAM_MATCH(teamIdNum, matchIdNum));
        if (!alive) return;
        setRoster(detail.data?.roster || []);
        const data = await load();
        if (!alive) return;
        if (!viewOnly && data.needs_set_start && data.status !== "finished") {
          openGate((data.sets || []).length > 0 ? "next" : "start", data);
        }
      } catch (err) {
        if (!alive) return;
        setError(normalizeError(err, "Неуспешно зареждане на live мача."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamIdNum, matchIdNum, viewOnly]);

  /** Споделен екран: периодично опресняване за втория телефон/таблет. */
  useEffect(() => {
    if (loading || !state || state.status === "finished") return undefined;
    const t = setInterval(() => {
      if (busy || gateOpen) return;
      load(phaseOverride || undefined).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loading, state?.status, state?.set?.id, busy, gateOpen, phaseOverride, teamIdNum, matchIdNum]);

  const run = async (fn, { resetPhase = false, autoGate = false } = {}) => {
    try {
      setBusy(true);
      const data = await fn();
      if (resetPhase) setPhaseOverride(null);
      setState(data);
      if (
        autoGate &&
        data?.needs_set_start &&
        !data?.match_won_by &&
        data?.status !== "finished" &&
        (data.sets || []).some((s) => s.status === "finished")
      ) {
        openGate("next", data);
      }
      return data;
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при live действие."));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const score = (side) =>
    run(
      async () => {
        const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_SCORE(teamIdNum, matchIdNum), { side });
        return res.data;
      },
      { resetPhase: true, autoGate: true },
    );

  const undo = () =>
    run(
      async () => {
        const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_UNDO(teamIdNum, matchIdNum));
        return res.data;
      },
      { resetPhase: true },
    );

  const recordStat = (action) => {
    if (!selectedId && !NO_PLAYER_ACTIONS.has(action)) {
      toast.error("Изберете състезател от корта.");
      return;
    }
    run(
      async () => {
        const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_STAT(teamIdNum, matchIdNum), {
          action,
          athlete_id: selectedId || null,
          apply_score: true,
        });
        return res.data;
      },
      { resetPhase: true, autoGate: true },
    );
  };

  const selectPhase = (phaseId) => {
    const auto = state?.set?.we_serve ? "serve" : "receive";
    if (phaseId === auto) {
      setPhaseOverride(null);
      run(() => load());
      return;
    }
    setPhaseOverride(phaseId);
    run(() => load(phaseId));
  };

  const finishMatch = () =>
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_FINISH(teamIdNum, matchIdNum));
      toast.success("Мачът е приключен.");
      setGateOpen(false);
      navigate(`/coach/teams/${teamIdNum}/matches/${matchIdNum}/report`);
      return res.data;
    });

  const confirmGate = () =>
    run(
      async () => {
        const body = { we_serve: gateServe, rotation: gateRotation };
        const path =
          gateMode === "next"
            ? API_PATHS.TEAM_MATCH_LIVE_NEXT_SET(teamIdNum, matchIdNum)
            : API_PATHS.TEAM_MATCH_LIVE_START(teamIdNum, matchIdNum);
        const res = await axiosInstance.post(path, body);
        setGateOpen(false);
        toast.success(gateMode === "next" ? "Нов гейм." : "Гейм 1 стартиран.");
        return res.data;
      },
      { resetPhase: true },
    );

  const openNextGate = () => openGate("next", state);

  const copyShareLink = async (mode) => {
    const url = `${window.location.origin}/coach/teams/${teamIdNum}/matches/${matchIdNum}/live${
      mode === "view" ? "?mode=view" : ""
    }`;
    try {
      await navigator.clipboard.writeText(url);
      setShareHint(mode === "view" ? "Копиран линк за преглед" : "Копиран линк за въвеждане");
      toast.success(mode === "view" ? "Линк за преглед копиран." : "Линк за въвеждане копиран.");
    } catch {
      setShareHint(url);
      toast.error("Копирай линка ръчно от полето по-долу.");
    }
  };

  const toggleLock = () => {
    if (viewOnly) {
      toast.error("В режим преглед не можеш да заключваш.");
      return;
    }
    const next = !state?.input_locked;
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_LOCK(teamIdNum, matchIdNum), {
        locked: next,
      });
      toast.success(next ? "Въвеждането е заключено." : "Въвеждането е отключено.");
      return res.data;
    });
  };

  if (loading) return <p className="coachMobileMuted">Зареждане на live мач...</p>;
  if (error) return <p className="coachMobileMuted">{error}</p>;
  if (!state) return null;

  const mset = state.set;
  const setFinished = mset?.status === "finished";
  const matchDone = state.status === "finished" || Boolean(state.match_won_by);
  const inputLocked = Boolean(state.input_locked);
  const canWrite = !viewOnly && !inputLocked && !matchDone;
  const playing = Boolean(mset) && mset.status === "in_progress" && canWrite;
  const autoPhase = mset?.we_serve ? "serve" : "receive";
  const activePhase = phaseOverride || state.phase || autoPhase;
  const phaseLabel = PHASES.find((p) => p.id === activePhase)?.label || activePhase;
  const posKey = `${mset?.rotation ?? 1}:${activePhase}`;
  const positionOverrides = posByKey[posKey] || null;
  const canEditPositions = (activePhase === "receive" || activePhase === "serve") && canWrite;
  const nextSetNumber = (state.sets || []).length + 1;
  const gateTitle =
    gateMode === "next" ? `Гейм ${nextSetNumber} — подготовка` : "Старт на гейм 1";

  return (
    <section className="matchLivePage">
      {gateOpen ? (
        <div className="matchLiveGateOverlay" role="dialog" aria-modal="true" aria-label={gateTitle}>
          <div className="matchLiveGateCard">
            <h3>{gateTitle}</h3>
            <p className="matchLiveGateHint">
              {formatLabel} · геймове {state.sets_won_us ?? 0}:{state.sets_won_opp ?? 0}
              {gateMode === "next" ? " · можеш да смениш шестицата преди старт" : ""}
            </p>

            <div className="matchLiveGateField">
              <span>Започваме на</span>
              <div className="matchLiveGateToggle">
                <button
                  type="button"
                  className={gateServe ? "is-active" : ""}
                  disabled={busy}
                  onClick={() => setGateServe(true)}
                >
                  Сервис
                </button>
                <button
                  type="button"
                  className={!gateServe ? "is-active" : ""}
                  disabled={busy}
                  onClick={() => setGateServe(false)}
                >
                  Посрещане
                </button>
              </div>
            </div>

            <div className="matchLiveGateField">
              <span>Стартова ротация</span>
              <div className="matchLiveGateRots">
                {[1, 2, 3, 4, 5, 6].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={gateRotation === r ? "is-active" : ""}
                    disabled={busy}
                    onClick={() => setGateRotation(r)}
                  >
                    R{r}
                  </button>
                ))}
              </div>
            </div>

            {state.can_edit_lineup ? (
              <Link
                to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`}
                className="matchLiveGateLineupLink"
              >
                Промени шестицата →
              </Link>
            ) : null}

            <div className="matchLiveGateActions">
              <button type="button" className="matchLiveNext" disabled={busy} onClick={confirmGate}>
                {busy ? "..." : gateMode === "next" ? "Старт на гейма" : "Започни мача"}
              </button>
              {gateMode === "next" || matchDone ? (
                <button type="button" className="matchLiveStop" disabled={busy} onClick={finishMatch}>
                  Приключи мача
                </button>
              ) : (
                <button
                  type="button"
                  className="matchLiveUndo"
                  disabled={busy}
                  onClick={() => navigate(`/coach/teams/${teamIdNum}/matches/${matchIdNum}`)}
                >
                  Назад
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="matchLiveTop">
        <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchLiveBack">
          ← Корт
        </Link>
        <div className="matchLiveMeta">
          <strong>vs {state.opponent_name || "противник"}</strong>
          <span>
            {formatLabel} · {state.sets_won_us ?? 0}:{state.sets_won_opp ?? 0}
            {mset
              ? ` · Гейм ${mset.set_number} · R${mset.rotation} · ${
                  mset.we_serve ? "наш сервис" : "чужд сервис"
                } · ${phaseLabel}`
              : ""}
            {matchDone
              ? state.match_won_by === "us"
                ? " · победа"
                : state.match_won_by === "opp"
                  ? " · загуба"
                  : " · приключен"
              : ""}
          </span>
        </div>
        <div className="matchLiveTopActions">
          <button type="button" className="matchLiveUndo" disabled={busy || !state.can_undo || !canWrite} onClick={undo}>
            Undo
          </button>
          <button type="button" className="matchLiveStatsOpenBtn" onClick={() => setStatsOpen(true)}>
            Статистика
          </button>
          {!viewOnly && !matchDone ? (
            <button
              type="button"
              className={`matchLiveLockBtn${inputLocked ? " is-locked" : ""}`}
              disabled={busy}
              onClick={toggleLock}
              title="Заключи въвеждането на другия екран"
            >
              {inputLocked ? "Отключи" : "Заключи"}
            </button>
          ) : null}
          {setFinished && state.needs_set_start && !matchDone && !viewOnly ? (
            <button type="button" className="matchLiveNext" disabled={busy || inputLocked} onClick={openNextGate}>
              Следващ гейм
            </button>
          ) : null}
          {!viewOnly ? (
            <button type="button" className="matchLiveStop" disabled={busy || matchDone} onClick={finishMatch}>
              Приключи мача
            </button>
          ) : null}
        </div>
      </div>

      {viewOnly ? <div className="matchLiveViewBanner">Режим преглед — само наблюдение в реално време</div> : null}
      {inputLocked && !matchDone ? (
        <div className="matchLiveLockBanner">Въвеждането е заключено</div>
      ) : null}

      {!matchDone && !viewOnly ? (
        <div className="matchLiveShareBar">
          <button type="button" className="matchLiveShareBtn" onClick={() => copyShareLink("edit")}>
            Линк въвеждане
          </button>
          <button type="button" className="matchLiveShareBtn" onClick={() => copyShareLink("view")}>
            Линк преглед
          </button>
          {shareHint ? <span className="matchLiveShareHint">{shareHint}</span> : null}
        </div>
      ) : null}
      {(state.sets || []).length > 0 ? (
        <div className="matchLiveSetStrip" aria-label="Резултат по геймове">
          {(state.sets || []).map((s) => (
            <span key={s.set_number} className={s.status === "finished" ? "is-done" : "is-live"}>
              G{s.set_number} {s.our_score}:{s.opp_score}
            </span>
          ))}
        </div>
      ) : null}

      {matchDone ? (
        <div className="matchLiveMatchDone">
          Мачът е приключен · {state.sets_won_us}:{state.sets_won_opp}
          {state.match_won_by === "us" ? " (победа)" : state.match_won_by === "opp" ? " (загуба)" : ""}
          <button
            type="button"
            className="matchLiveNext"
            style={{ marginLeft: 10 }}
            onClick={() => navigate(`/coach/teams/${teamIdNum}/matches/${matchIdNum}/report`)}
          >
            Отчет
          </button>
        </div>
      ) : null}

      <div className="matchLiveScore">
        <div className="matchLiveScoreRow">
          <div className="matchLiveScoreSide matchLiveScoreSide--us">
            <button type="button" disabled={busy || !playing} onClick={() => score("us")}>
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
              {mset ? (mset.we_serve ? "● наш сервис" : "○ чужд сервис") : "изчаква старт"}
            </div>
          </div>
          <div className="matchLiveScoreSide matchLiveScoreSide--opp">
            <div>
              <div className="matchLiveScoreLabel">OPP</div>
              <div className="matchLiveScoreNum">{mset?.opp_score ?? 0}</div>
            </div>
            <button type="button" disabled={busy || !playing} onClick={() => score("opp")}>
              +
            </button>
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
              disabled={busy || !playing}
              onClick={() => selectPhase(p.id)}
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
          size="md"
          phase={activePhase}
          rotation={mset?.rotation ?? 1}
          system={state.system || "5-1"}
          slots={state.court || []}
          libero={state.libero}
          showServe={Boolean(mset?.we_serve) && activePhase === "serve"}
          title={`Ротация ${mset?.rotation ?? 1}`}
          subtitle={`${state.system} · ${phaseLabel}`}
          activeZone={selected?.zone ?? null}
          positionEditable={canEditPositions && playing}
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
      </div>

      <div className="matchLiveEntryBar">
        <div className="matchLiveSelected">
          {selected ? (
            <>
              <span className="matchLiveSelectedJersey">#{selected.jersey_number}</span>
              <span>
                {shortPlayerName(selected.athlete_name)} · {positionShort(selected.position)}
              </span>
            </>
          ) : (
            <span>Избери състезател от корта за въвеждане</span>
          )}
        </div>

        <div className="matchLiveEntryRow" role="group" aria-label="Въвеждане на статистика">
          <button
            type="button"
            className="matchLiveStatBtn matchLiveStatBtn--good"
            disabled={busy || !playing}
            onClick={() => recordStat("opp_error")}
            title="Грешка на противника"
          >
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
                disabled={busy || !playing}
                onClick={() => recordStat(it.action)}
                title={`${g.title}: ${ACTION_LABEL[it.action] || it.label}`}
              >
                {it.label}
              </button>
            )),
          )}
        </div>

        <div className="matchLiveEvents matchLiveEvents--compact">
          <div className="matchLiveStatGroupTitle">Последни</div>
          {(state.recent_events || []).slice(0, 4).map((ev) => (
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

      {statsOpen ? (
        <div className="matchLiveStatsOverlay" role="dialog" aria-modal="true" aria-label="Статистика">
          <button type="button" className="matchLiveStatsBackdrop" aria-label="Затвори" onClick={() => setStatsOpen(false)} />
          <div className="matchLiveStatsDrawer matchLiveStatsDrawer--wide">
            <div className="matchLiveStatsDrawerHead">
              <div>
                <strong>Статистика на мача</strong>
                <div className="matchLiveStatsLegend">
                  # перфектно · + добро · − слабо · посрещане / атака / сервис по състезател
                </div>
              </div>
              <button type="button" className="matchLiveStatsClose" onClick={() => setStatsOpen(false)}>
                ✕
              </button>
            </div>

            <div className="matchLiveStatTableWrap">
              <table className="matchLiveStatTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Име</th>
                    <th>Поз</th>
                    <th title="Точки атака">Ат+</th>
                    <th title="Грешки атака">Ат−</th>
                    <th title="Асове">Ас</th>
                    <th title="Грешки сервис">Ср−</th>
                    <th title="Блок">Бл</th>
                    <th title="Защита">Защ</th>
                    <th title="Посрещане #">#</th>
                    <th title="Посрещане +">+</th>
                    <th title="Посрещане −">−</th>
                    <th title="Грешка посрещане">П−</th>
                    <th>Разтълкуване</th>
                  </tr>
                </thead>
                <tbody>
                  {statRows.map((row) => (
                    <tr key={row.athlete_id}>
                      <td>{row.jersey_number}</td>
                      <td className="matchLiveStatTableName">{shortPlayerName(row.athlete_name) || row.athlete_name}</td>
                      <td>{positionShort(row.position)}</td>
                      <td>{row.kills || "·"}</td>
                      <td>{row.attack_err || "·"}</td>
                      <td>{row.aces || "·"}</td>
                      <td>{row.serve_err || "·"}</td>
                      <td>{row.blocks || "·"}</td>
                      <td>{row.digs || "·"}</td>
                      <td>{row.pass_hash || "·"}</td>
                      <td>{row.pass_plus || "·"}</td>
                      <td>{row.pass_minus || "·"}</td>
                      <td>{row.pass_err || "·"}</td>
                      <td className="matchLiveStatTableSum">{rowSummary(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="matchLiveLeave"
        onClick={() => navigate(`/coach/teams/${teamIdNum}/matches/${matchIdNum}`)}
      >
        Към настройките на мача
      </button>
    </section>
  );
}
