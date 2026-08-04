import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import MatchCourt from "../../components/matches/MatchCourt";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { positionShort, shortPlayerName } from "../../utils/matchPositions";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

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
  /** null = auto от we_serve (serve|receive); "base" = ръчен изглед */
  const [phaseOverride, setPhaseOverride] = useState(null);
  /** zone → {x,y}% coach stack overrides (per rotation+phase) */
  const [posByKey, setPosByKey] = useState({});
  const [statsOpen, setStatsOpen] = useState(false);

  const selected = useMemo(() => {
    if (!state || !selectedId) return null;
    return (state.court || []).find((p) => Number(p.athlete_id) === Number(selectedId)) || null;
  }, [state, selectedId]);

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const detail = await axiosInstance.get(API_PATHS.TEAM_MATCH(teamIdNum, matchIdNum));
        if (!alive) return;
        setRoster(detail.data?.roster || []);
        let data = await load();
        if (!alive) return;
        if (!data.set) {
          data = (
            await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_START(teamIdNum, matchIdNum), {
              we_serve: true,
              set_number: 1,
            })
          ).data;
          if (!alive) return;
          setState(data);
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
  }, [teamIdNum, matchIdNum]);

  const run = async (fn, { resetPhase = false } = {}) => {
    try {
      setBusy(true);
      const data = await fn();
      if (resetPhase) setPhaseOverride(null);
      setState(data);
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при live действие."));
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
      { resetPhase: true },
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
      { resetPhase: true },
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
      return res.data;
    });

  const nextSet = () =>
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_NEXT_SET(teamIdNum, matchIdNum), {
        we_serve: true,
      });
      toast.success("Нов сет.");
      return res.data;
    });

  if (loading) return <p className="coachMobileMuted">Зареждане на live мач...</p>;
  if (error) return <p className="coachMobileMuted">{error}</p>;
  if (!state) return null;

  const mset = state.set;
  const setFinished = mset?.status === "finished";
  const autoPhase = mset?.we_serve ? "serve" : "receive";
  const activePhase = phaseOverride || state.phase || autoPhase;
  const phaseLabel = PHASES.find((p) => p.id === activePhase)?.label || activePhase;
  const posKey = `${mset?.rotation ?? 1}:${activePhase}`;
  const positionOverrides = posByKey[posKey] || null;
  const canEditPositions = activePhase === "receive" || activePhase === "serve";

  return (
    <section className="matchLivePage">
      <div className="matchLiveTop">
        <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchLiveBack">
          ← Корт
        </Link>
        <div className="matchLiveMeta">
          <strong>vs {state.opponent_name || "противник"}</strong>
          <span>
            Сет {mset?.set_number ?? "—"} · R{mset?.rotation ?? "—"} · {mset?.we_serve ? "наш сервис" : "чужд сервис"} ·{" "}
            {phaseLabel}
          </span>
        </div>
        <div className="matchLiveTopActions">
          <button type="button" className="matchLiveUndo" disabled={busy || !state.can_undo} onClick={undo}>
            Undo
          </button>
          <button
            type="button"
            className="matchLiveStatsOpenBtn"
            onClick={() => setStatsOpen(true)}
          >
            Статистика
          </button>
          {setFinished ? (
            <button type="button" className="matchLiveNext" disabled={busy || state.status === "finished"} onClick={nextSet}>
              Нов сет
            </button>
          ) : null}
          <button type="button" className="matchLiveStop" disabled={busy} onClick={finishMatch}>
            Stop
          </button>
        </div>
      </div>

      <div className="matchLiveScore">
        <div className="matchLiveScoreRow">
          <div className="matchLiveScoreSide matchLiveScoreSide--us">
            <button type="button" disabled={busy || setFinished} onClick={() => score("us")}>
              +
            </button>
            <div>
              <div className="matchLiveScoreLabel">НИЕ</div>
              <div className="matchLiveScoreNum">{mset?.our_score ?? 0}</div>
            </div>
          </div>
          <div className="matchLiveScoreMid">
            <div>Сет {mset?.set_number ?? 1}</div>
            <div className="matchLiveServePill">{mset?.we_serve ? "● наш сервис" : "○ чужд сервис"}</div>
          </div>
          <div className="matchLiveScoreSide matchLiveScoreSide--opp">
            <div>
              <div className="matchLiveScoreLabel">OPP</div>
              <div className="matchLiveScoreNum">{mset?.opp_score ?? 0}</div>
            </div>
            <button type="button" disabled={busy || setFinished} onClick={() => score("opp")}>
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
              disabled={busy || setFinished || state.status === "finished"}
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
          positionEditable={canEditPositions && !setFinished && state.status !== "finished"}
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
            disabled={busy || setFinished || state.status === "finished"}
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
                disabled={busy || setFinished || state.status === "finished"}
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
