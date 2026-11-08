import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { MATCH_ACTION_LABEL, MATCH_STAT_SIDE_LEFT, MATCH_STAT_SIDE_RIGHT } from "../../components/matches/MatchLiveSideStats";
import { Button, EmptyState, Input } from "../../components/ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import {
  getVimeoEmbedUrl,
  getYoutubeEmbedUrl,
  isDirectVideoUrl,
  resolveMediaUrl,
} from "../../utils/drillVideo";
import { MATCH_STATUS_LABEL, shortPlayerName } from "../../utils/matchPositions";
import { normalizeError } from "../../utils/normalizeError";

const CODING_ACTIONS = [...MATCH_STAT_SIDE_LEFT, ...MATCH_STAT_SIDE_RIGHT];

function formatOffset(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseOffsetInput(raw) {
  const t = String(raw || "").trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Math.max(0, Number(t));
  const m = t.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (m) return Math.max(0, Number(m[1]) * 60 + Number(m[2]));
  return 0;
}

function playerLabel(p) {
  const name = shortPlayerName(p.athlete_name) || p.athlete_name || "—";
  return p.jersey_number != null ? `#${p.jersey_number} ${name}` : name;
}

function VideoFrame({ url }) {
  const resolved = resolveMediaUrl(url);
  if (!resolved) {
    return <div className="matchVideoEmpty">Поставете линк към видео (YouTube, Vimeo или директен файл).</div>;
  }
  const yt = getYoutubeEmbedUrl(resolved);
  if (yt) {
    return (
      <div className="matchVideoFrame">
        <iframe title="Мач видео" src={`${yt}?enablejsapi=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  const vimeo = getVimeoEmbedUrl(resolved);
  if (vimeo) {
    return (
      <div className="matchVideoFrame">
        <iframe title="Мач видео" src={vimeo} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (isDirectVideoUrl(resolved)) {
    return (
      <div className="matchVideoFrame">
        <video src={resolved} controls playsInline />
      </div>
    );
  }
  return (
    <div className="matchVideoEmpty">
      Линкът е записан. Отваряне:{" "}
      <a href={resolved} target="_blank" rel="noreferrer">
        отвори видео
      </a>
    </div>
  );
}

export default function CoachMatchVideoCoding() {
  const { teamId, matchId } = useParams();
  const teamIdNum = Number(teamId);
  const matchIdNum = Number(matchId);

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [offsetDraft, setOffsetDraft] = useState("0:00");
  const [athleteId, setAthleteId] = useState("");
  const [setId, setSetId] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("pending");

  const load = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAM_MATCH_VIDEO_CODING(teamIdNum, matchIdNum));
    setState(res.data);
    setUrlDraft(res.data.video_url || "");
    if (!setId && (res.data.sets || []).length) {
      // setId comes from proposals; sets summary has set_number only - we store set_id on create via backend pick
    }
    return res.data;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await load();
        if (!alive) return;
        setState(data);
      } catch (err) {
        if (!alive) return;
        setError(normalizeError(err, "Неуспешно зареждане."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIdNum, matchIdNum]);

  const setOptions = useMemo(
    () =>
      (state?.sets || []).map((s) => ({
        id: s.id,
        num: s.set_number,
        label: `G${s.set_number} ${s.our_score}:${s.opp_score}`,
      })),
    [state?.sets]
  );

  const visible = useMemo(() => {
    const rows = state?.proposals || [];
    if (filter === "all") return rows;
    return rows.filter((p) => p.status === filter);
  }, [state?.proposals, filter]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(normalizeError(err, "Грешка при операцията."));
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = () =>
    run(async () => {
      await axiosInstance.put(API_PATHS.TEAM_MATCH_VIDEO_CODING_URL(teamIdNum, matchIdNum), {
        video_url: urlDraft.trim() || null,
      });
    });

  const addProposal = (action) =>
    run(async () => {
      const body = {
        action,
        athlete_id: athleteId ? Number(athleteId) : null,
        set_id: setId ? Number(setId) : null,
        video_offset_sec: parseOffsetInput(offsetDraft),
        note: note.trim() || null,
      };
      await axiosInstance.post(API_PATHS.TEAM_MATCH_VIDEO_CODING_PROPOSALS(teamIdNum, matchIdNum), body);
      setNote("");
    });

  const approve = (id) =>
    run(async () => {
      await axiosInstance.post(API_PATHS.TEAM_MATCH_VIDEO_CODING_APPROVE(teamIdNum, matchIdNum, id));
    });

  const reject = (id) =>
    run(async () => {
      await axiosInstance.post(API_PATHS.TEAM_MATCH_VIDEO_CODING_REJECT(teamIdNum, matchIdNum, id));
    });

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error && !state) return <EmptyState title="Грешка" description={error} />;
  if (!state) return null;

  return (
    <section className="matchReportPage matchVideoCodingPage">
      <div className="matchReportTop">
        <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}/report`} className="matchLiveBack">
          ← Отчет
        </Link>
        <div className="matchReportMeta">
          <h2>Видео coding · vs {state.opponent_name || "противник"}</h2>
          <p>
            {MATCH_STATUS_LABEL[state.status] || state.status}
            {state.pending_count ? ` · ${state.pending_count} чакащи` : ""}
          </p>
        </div>
        <div className="matchReportTopActions">
          <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}`} className="matchReportLinkBtn">
            Настройки
          </Link>
          <Link to={`/coach/teams/${teamIdNum}/matches/${matchIdNum}/report`} className="matchReportLinkBtn">
            Отчет
          </Link>
        </div>
      </div>

      {error ? <p className="coachMobileError">{error}</p> : null}

      <div className="matchVideoUrlRow">
        <Input
          label="Линк към видео"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://youtube.com/... или .mp4"
          disabled={busy}
        />
        <Button type="button" disabled={busy} onClick={saveUrl}>
          Запази линк
        </Button>
      </div>

      <VideoFrame url={state.video_url} />

      <div className="matchVideoCodeForm">
        <div className="matchVideoCodeFields">
          <label>
            Време (м:с или сек)
            <input
              type="text"
              value={offsetDraft}
              onChange={(e) => setOffsetDraft(e.target.value)}
              disabled={busy}
              inputMode="numeric"
            />
          </label>
          <label>
            Играч
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} disabled={busy}>
              <option value="">(без играч)</option>
              {(state.roster || []).map((p) => (
                <option key={p.athlete_id} value={p.athlete_id}>
                  {playerLabel(p)}
                </option>
              ))}
            </select>
          </label>
          {setOptions.length ? (
            <label>
              Гейм
              <select value={setId} onChange={(e) => setSetId(e.target.value)} disabled={busy}>
                <option value="">(последен)</option>
                {setOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Бележка
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} maxLength={255} />
          </label>
        </div>
        <p className="coachMobileMuted">Маркирай действие при текущото време. После одобри от списъка по-долу.</p>
        <div className="matchVideoActionGrid">
          {CODING_ACTIONS.map((a) => (
            <button
              key={a.action}
              type="button"
              className={`matchVideoActionBtn tone-${a.tone || "neutral"}`}
              disabled={busy}
              onClick={() => addProposal(a.action)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="matchReportTabs">
        {[
          ["pending", "Чакащи"],
          ["approved", "Одобрени"],
          ["rejected", "Отхвърлени"],
          ["all", "Всички"],
        ].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <p className="coachMobileMuted">Няма записи в тази категория.</p>
      ) : (
        <ul className="matchVideoProposalList">
          {visible.map((p) => (
            <li key={p.id} className={`matchVideoProposal is-${p.status}`}>
              <div className="matchVideoProposalMain">
                <strong>{formatOffset(p.video_offset_sec)}</strong>
                <span>{MATCH_ACTION_LABEL[p.action] || p.action}</span>
                <span>
                  {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                  {shortPlayerName(p.athlete_name) || p.athlete_name || "—"}
                </span>
                {p.set_number != null ? <span className="matchVideoProposalMeta">G{p.set_number}</span> : null}
                {p.note ? <span className="matchVideoProposalMeta">{p.note}</span> : null}
                <span className="matchVideoProposalMeta">{p.source === "ai" ? "AI" : "ръчно"}</span>
              </div>
              {p.status === "pending" ? (
                <div className="matchVideoProposalActions">
                  <Button type="button" size="sm" disabled={busy} onClick={() => approve(p.id)}>
                    Одобри
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => reject(p.id)}>
                    Отхвърли
                  </Button>
                </div>
              ) : (
                <span className="matchVideoProposalStatus">{p.status === "approved" ? "одобрено" : "отхвърлено"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
