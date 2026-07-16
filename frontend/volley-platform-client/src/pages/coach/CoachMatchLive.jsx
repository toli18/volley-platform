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
      { action: "kill", label: "Точка", tone: "good" },
      { action: "attack_error", label: "Грешка", tone: "bad" },
    ],
  },
  {
    title: "Сервис / блок",
    items: [
      { action: "ace", label: "Ас", tone: "good" },
      { action: "block", label: "Блок", tone: "good" },
      { action: "error", label: "Грешка", tone: "bad" },
    ],
  },
  {
    title: "Защита",
    items: [{ action: "dig", label: "Защита", tone: "neutral" }],
  },
  {
    title: "Посрещане",
    items: [
      { action: "pass_3", label: "3", tone: "neutral" },
      { action: "pass_2", label: "2", tone: "neutral" },
      { action: "pass_1", label: "1", tone: "neutral" },
      { action: "pass_0", label: "0", tone: "neutral" },
      { action: "free_ball", label: "Своб.", tone: "neutral" },
      { action: "pass_error", label: "Грешка", tone: "bad" },
    ],
  },
];

const ACTION_LABEL = {
  kill: "Точка атака",
  ace: "Ас",
  block: "Блок",
  attack_error: "Грешка атака",
  error: "Грешка",
  dig: "Защита",
  pass_0: "Пос. 0",
  pass_1: "Пос. 1",
  pass_2: "Пос. 2",
  pass_3: "Пос. 3",
  free_ball: "Свободна",
  pass_error: "Грешка поср.",
  opp_point: "Точка OPP",
  our_point: "Точка НИЕ",
};

export default function CoachMatchLive() {
  const { teamId, matchId } = useParams();
  const teamIdNum = Number(teamId);
  const matchIdNum = Number(matchId);
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  const selected = useMemo(() => {
    if (!state || !selectedId) return null;
    return (state.court || []).find((p) => Number(p.athlete_id) === Number(selectedId)) || null;
  }, [state, selectedId]);

  const load = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAM_MATCH_LIVE(teamIdNum, matchIdNum));
    setState(res.data);
    return res.data;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
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

  const run = async (fn) => {
    try {
      setBusy(true);
      const data = await fn();
      setState(data);
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при live действие."));
    } finally {
      setBusy(false);
    }
  };

  const score = (side) =>
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_SCORE(teamIdNum, matchIdNum), { side });
      return res.data;
    });

  const undo = () =>
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_UNDO(teamIdNum, matchIdNum));
      return res.data;
    });

  const recordStat = (action) => {
    if (!selectedId && !["opp_point", "our_point"].includes(action)) {
      toast.error("Изберете състезател от корта.");
      return;
    }
    run(async () => {
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCH_LIVE_STAT(teamIdNum, matchIdNum), {
        action,
        athlete_id: selectedId || null,
        apply_score: true,
      });
      return res.data;
    });
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

  return (
    <section className="matchLivePage">
      <div className="matchLiveTop">
        <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchLiveBack">
          ← Корт
        </Link>
        <div className="matchLiveMeta">
          <strong>vs {state.opponent_name || "противник"}</strong>
          <span>
            Сет {mset?.set_number ?? "—"} · R{mset?.rotation ?? "—"} · {mset?.we_serve ? "наш сервис" : "чужд сервис"}
          </span>
        </div>
        <div className="matchLiveTopActions">
          <button type="button" className="matchLiveUndo" disabled={busy || !state.can_undo} onClick={undo}>
            Undo
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

      <div className="matchLiveGrid">
        <MatchCourt
          variant="pro"
          slots={state.court || []}
          libero={state.libero}
          showServe={Boolean(mset?.we_serve)}
          title={`Ротация ${mset?.rotation ?? 1}`}
          subtitle={state.system}
          activeZone={selected?.zone ?? null}
          onZoneClick={(zone) => {
            const p = (state.court || []).find((s) => Number(s.zone) === Number(zone));
            if (p) setSelectedId(p.athlete_id);
          }}
        />

        <div className="matchLiveStatsPanel">
          <div className="matchLiveSelected">
            {selected ? (
              <>
                <span className="matchLiveSelectedJersey">#{selected.jersey_number}</span>
                <span>
                  {shortPlayerName(selected.athlete_name)} · {positionShort(selected.position)}
                </span>
              </>
            ) : (
              <span>Избери състезател от корта</span>
            )}
          </div>

          {STAT_GROUPS.map((g) => (
            <div key={g.title} className="matchLiveStatGroup">
              <div className="matchLiveStatGroupTitle">{g.title}</div>
              <div className="matchLiveStatBtns">
                {g.items.map((it) => (
                  <button
                    key={it.action}
                    type="button"
                    className={`matchLiveStatBtn matchLiveStatBtn--${it.tone}`}
                    disabled={busy || setFinished || state.status === "finished"}
                    onClick={() => recordStat(it.action)}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="matchLiveEvents">
            <div className="matchLiveStatGroupTitle">Последни</div>
            {(state.recent_events || []).slice(0, 8).map((ev) => (
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
