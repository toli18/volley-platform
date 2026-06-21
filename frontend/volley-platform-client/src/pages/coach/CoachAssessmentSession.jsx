import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, EmptyState } from "../../components/ui";
import AssessmentEntryGrid from "../../components/assessment/AssessmentEntryGrid";
import TeamLiveCard from "../../components/assessment/TeamLiveCard";

const PHASES = [
  { value: "baseline", label: "Входящо (baseline)" },
  { value: "mid", label: "Междинно (mid)" },
  { value: "endline", label: "Изходящо (endline)" },
];

function currentSeason() {
  const d = new Date();
  const y = d.getFullYear();
  // Сезонът започва през август; преди това още сме в предходния сезон.
  const startYear = d.getMonth() >= 7 ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function phaseLabel(value) {
  return PHASES.find((p) => p.value === value)?.label || value;
}

export default function CoachAssessmentSession() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const [teams, setTeams] = useState([]);
  const [battery, setBattery] = useState([]);
  const [windows, setWindows] = useState([]);
  const [members, setMembers] = useState([]);

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedWindowId, setSelectedWindowId] = useState("");

  const [session, setSession] = useState(null);
  const [values, setValues] = useState({}); // { athleteId: { testCode: string } }

  const [loading, setLoading] = useState(true);
  const [openingSession, setOpeningSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // { type: "ok"|"err", text }

  // Нов прозорец (inline форма)
  const [newSeason, setNewSeason] = useState(currentSeason());
  const [newPhase, setNewPhase] = useState("baseline");
  const [creatingWindow, setCreatingWindow] = useState(false);

  const isFinalized = session?.status === "finalized";

  // --- Първоначално зареждане: отбори + батерия + прозорци ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [teamsRes, batteryRes, windowsRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAMS_LIST),
          axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY),
          axiosInstance.get(API_PATHS.ASSESSMENT_WINDOWS),
        ]);
        if (!alive) return;

        let teamList = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        if (!isHeadCoach) {
          teamList = teamList.filter((t) => Number(t?.coach_id) === currentUserId);
        }
        teamList = teamList.filter((t) => t.is_active !== false);
        teamList.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));

        setTeams(teamList);
        setBattery(Array.isArray(batteryRes.data) ? batteryRes.data : []);
        setWindows(Array.isArray(windowsRes.data) ? windowsRes.data : []);
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Неуспешно зареждане на данните.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isHeadCoach, currentUserId]);

  // --- Членове на избрания отбор ---
  useEffect(() => {
    if (!selectedTeamId) {
      setMembers([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(selectedTeamId));
        if (!alive) return;
        const mem = Array.isArray(res.data?.members) ? res.data.members : [];
        mem.sort((a, b) => String(a.athlete_name || "").localeCompare(String(b.athlete_name || ""), "bg"));
        setMembers(mem);
      } catch {
        if (alive) setMembers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedTeamId]);

  const prefillFromSession = (sess) => {
    const next = {};
    for (const r of sess?.results || []) {
      if (r.raw_value === null || r.raw_value === undefined) continue;
      next[r.athlete_id] = next[r.athlete_id] || {};
      next[r.athlete_id][r.test_code] = String(r.raw_value);
    }
    setValues(next);
  };

  // --- Отваряне/създаване на сесия при избран отбор + прозорец ---
  useEffect(() => {
    if (!selectedTeamId || !selectedWindowId) {
      setSession(null);
      setValues({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        setOpeningSession(true);
        setNotice(null);
        const createRes = await axiosInstance.post(API_PATHS.ASSESSMENT_SESSIONS, {
          window_id: Number(selectedWindowId),
          team_id: Number(selectedTeamId),
        });
        if (!alive) return;
        // Зареждаме пълната сесия (с резултати), за да префилнем грида.
        const full = await axiosInstance.get(API_PATHS.ASSESSMENT_SESSION_GET(createRes.data.id));
        if (!alive) return;
        setSession(full.data);
        prefillFromSession(full.data);
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешно отваряне на сесия." });
        setSession(null);
      } finally {
        if (alive) setOpeningSession(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedTeamId, selectedWindowId]);

  const handleChange = (athleteId, testCode, value) => {
    setValues((prev) => ({
      ...prev,
      [athleteId]: { ...(prev[athleteId] || {}), [testCode]: value },
    }));
  };

  const buildResultsPayload = () => {
    const results = [];
    for (const athleteIdStr of Object.keys(values)) {
      const athleteId = Number(athleteIdStr);
      const perTest = values[athleteIdStr] || {};
      for (const testCode of Object.keys(perTest)) {
        const raw = perTest[testCode];
        if (raw === "" || raw === null || raw === undefined) continue;
        const num = Number(raw);
        if (Number.isNaN(num)) continue;
        results.push({ athlete_id: athleteId, test_code: testCode, raw_value: num });
      }
    }
    return results;
  };

  const saveDraft = async () => {
    if (!session) return false;
    const results = buildResultsPayload();
    if (results.length === 0) {
      setNotice({ type: "err", text: "Няма въведени резултати за запис." });
      return false;
    }
    try {
      setSaving(true);
      setNotice(null);
      await axiosInstance.post(API_PATHS.ASSESSMENT_RESULTS_BULK(session.id), { results });
      setNotice({ type: "ok", text: `Запазени са ${results.length} резултата.` });
      return true;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешен запис на резултатите." });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finalizeSession = async () => {
    if (!session) return;
    const ok = window.confirm(
      "Приключване на сесията ще изчисли резултатите и ще заключи въвеждането. Продължаваме ли?"
    );
    if (!ok) return;

    // Първо записваме въведеното (finalize чете от базата).
    const saved = await saveDraft();
    if (!saved) return;

    try {
      setFinalizing(true);
      const res = await axiosInstance.post(API_PATHS.ASSESSMENT_SESSION_FINALIZE(session.id));
      setSession(res.data);
      prefillFromSession(res.data);
      setNotice({ type: "ok", text: "Сесията е приключена и резултатите са изчислени." });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешно приключване на сесията." });
    } finally {
      setFinalizing(false);
    }
  };

  const createWindow = async () => {
    if (!newSeason.trim()) {
      setNotice({ type: "err", text: "Въведете сезон (напр. 2025/26)." });
      return;
    }
    try {
      setCreatingWindow(true);
      setNotice(null);
      const res = await axiosInstance.post(API_PATHS.ASSESSMENT_WINDOWS, {
        season: newSeason.trim(),
        phase: newPhase,
        cycle: "6м",
      });
      const win = res.data;
      setWindows((prev) => {
        const exists = prev.some((w) => w.id === win.id);
        return exists ? prev : [...prev, win];
      });
      setSelectedWindowId(String(win.id));
      setNotice({ type: "ok", text: `Прозорецът „${win.season} · ${phaseLabel(win.phase)}“ е готов.` });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешно откриване на прозорец." });
    } finally {
      setCreatingWindow(false);
    }
  };

  const windowOptions = useMemo(
    () =>
      [...windows].sort((a, b) => {
        const bySeason = String(b.season || "").localeCompare(String(a.season || ""), "bg");
        if (bySeason !== 0) return bySeason;
        const order = { baseline: 0, mid: 1, endline: 2 };
        return (order[a.phase] ?? 9) - (order[b.phase] ?? 9);
      }),
    [windows]
  );

  const canCreateWindows = ["club_head_coach", "platform_admin", "federation_admin"].includes(role);

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;

  if (teams.length === 0) {
    return (
      <EmptyState
        title="Няма отбори"
        description="Нужен е поне един отбор със състав, за да проведете диагностика."
      />
    );
  }

  return (
    <div className="coachMobilePage">
      <div className="devHead">
        <h2 className="coachMobileSectionTitle" style={{ margin: 0 }}>
          Диагностична сесия
        </h2>
        <Link to="/coach/assessment/battery" className="devBack">
          Тестова батерия →
        </Link>
      </div>

      <div className="assessToolbar">
        <label className="assessField">
          <span>Отбор</span>
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
            <option value="">— Избери отбор —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {[t.name, t.age_group].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>

        <label className="assessField">
          <span>Прозорец</span>
          <select value={selectedWindowId} onChange={(e) => setSelectedWindowId(e.target.value)}>
            <option value="">— Избери прозорец —</option>
            {windowOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.season} · {phaseLabel(w.phase)}
              </option>
            ))}
          </select>
        </label>

        {session ? (
          <span className={`assessBadge assessBadge--${isFinalized ? "finalized" : "open"}`}>
            {isFinalized ? "Приключена" : "Отворена"}
          </span>
        ) : null}
      </div>

      {canCreateWindows ? (
        <div className="assessCreateRow">
          <label className="assessField">
            <span>Нов прозорец — сезон</span>
            <input value={newSeason} onChange={(e) => setNewSeason(e.target.value)} placeholder="2025/26" />
          </label>
          <label className="assessField">
            <span>Фаза</span>
            <select value={newPhase} onChange={(e) => setNewPhase(e.target.value)}>
              {PHASES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={createWindow} disabled={creatingWindow}>
            {creatingWindow ? "Откриване..." : "Започни прозорец"}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <div className={`assessNotice assessNotice--${notice.type === "ok" ? "ok" : "err"}`}>{notice.text}</div>
      ) : null}

      {!selectedTeamId || !selectedWindowId ? (
        <p className="assessMuted">Изберете отбор и прозорец, за да започнете въвеждане.</p>
      ) : openingSession ? (
        <p className="assessMuted">Отваряне на сесия...</p>
      ) : (
        <>
          {isFinalized ? (
            <p className="assessMuted">
              Сесията е приключена. Резултатите са изчислени и въвеждането е заключено. Натиснете
              име на състезател за Картата за развитие.
            </p>
          ) : null}

          {members.length ? (
            <TeamLiveCard tests={battery} athletes={members} values={values} />
          ) : null}

          <AssessmentEntryGrid
            tests={battery}
            athletes={members}
            values={values}
            onChange={handleChange}
            disabled={isFinalized || saving || finalizing}
            athleteHref={
              isFinalized
                ? (athleteId) => `/coach/assessment/athletes/${athleteId}?from=/coach/assessment`
                : null
            }
          />

          {!isFinalized ? (
            <div className="assessActions">
              <Button type="button" variant="secondary" onClick={saveDraft} disabled={saving || finalizing}>
                {saving ? "Запазване..." : "Запази чернова"}
              </Button>
              <Button type="button" onClick={finalizeSession} disabled={saving || finalizing}>
                {finalizing ? "Приключване..." : "Приключи сесия"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
