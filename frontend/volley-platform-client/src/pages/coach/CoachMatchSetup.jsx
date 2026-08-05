import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import MatchCourt from "../../components/matches/MatchCourt";
import MatchRotationStage from "../../components/matches/MatchRotationStage";
import StartingLineupCard from "../../components/matches/StartingLineupCard";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { reverseRotateZones, swapZoneAthletes } from "../../utils/matchCourtMath";
import {
  MATCH_MAX_ROSTER,
  MATCH_POSITIONS,
  MATCH_STATUS_LABEL,
  MATCH_SYSTEMS,
  MATCH_FORMATS,
  SYSTEM_LINEUP_HINT,
  positionShort,
} from "../../utils/matchPositions";
import { Button, EmptyState, Input } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

const ZONE_ORDER = [1, 2, 3, 4, 5, 6];

export default function CoachMatchSetup() {
  const { teamId, matchId } = useParams();
  const teamIdNum = Number(teamId);
  const matchIdNum = Number(matchId);
  const navigate = useNavigate();
  const toast = useToast();

  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState([]);
  const [match, setMatch] = useState(null);
  const [selected, setSelected] = useState({});
  const [zones, setZones] = useState({}); // zone -> athleteId
  const [liberoId, setLiberoId] = useState("");
  const [activeZone, setActiveZone] = useState(1);
  const [rotationView, setRotationView] = useState(1);
  const [step, setStep] = useState("roster");
  const [lineupCardOpen, setLineupCardOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({
    opponent_name: "",
    match_date: "",
    venue: "",
    system: "5-1",
    format: "bo5",
  });

  const selectedIds = useMemo(
    () => Object.keys(selected).map(Number).filter(Boolean),
    [selected]
  );

  const rosterPlayers = useMemo(() => {
    return selectedIds.map((id) => {
      const mem = members.find((m) => Number(m.athlete_id) === id);
      const row = selected[id];
      return {
        athlete_id: id,
        athlete_name: mem?.athlete_name || mem?.name || `Състезател #${id}`,
        jersey_number: Number(row?.jersey_number) || 0,
        position: row?.position || "OH",
      };
    });
  }, [selectedIds, selected, members]);

  const lineupSlotsPreview = useMemo(() => {
    return ZONE_ORDER.filter((z) => zones[z]).map((z) => {
      const p = rosterPlayers.find((r) => r.athlete_id === Number(zones[z]));
      return {
        zone: z,
        athlete_id: Number(zones[z]),
        athlete_name: p?.athlete_name || "",
        jersey_number: p?.jersey_number ?? "",
        position: p?.position || "OH",
      };
    });
  }, [zones, rosterPlayers]);

  const liberoPreview = useMemo(() => {
    if (!liberoId) return null;
    const p = rosterPlayers.find((r) => r.athlete_id === Number(liberoId));
    if (!p) return null;
    return {
      zone: 0,
      athlete_id: p.athlete_id,
      athlete_name: p.athlete_name,
      jersey_number: p.jersey_number,
      position: p.position,
    };
  }, [liberoId, rosterPlayers]);

  const applyMatchState = (m) => {
    setMatch(m);
    setMeta({
      opponent_name: m.opponent_name || "",
      match_date: m.match_date || "",
      venue: m.venue || "",
      system: m.system || "5-1",
      format: m.format || "bo5",
    });

    const nextSelected = {};
    for (const p of m.roster || []) {
      nextSelected[p.athlete_id] = {
        jersey_number: String(p.jersey_number ?? ""),
        position: p.position || "OH",
      };
    }
    setSelected(nextSelected);

    const nextZones = {};
    for (const s of m.lineup?.slots || []) {
      nextZones[s.zone] = s.athlete_id;
    }
    setZones(nextZones);
    setLiberoId(m.lineup?.libero?.athlete_id ? String(m.lineup.libero.athlete_id) : "");

    if (m.lineup?.complete) setStep("rotations");
    else if ((m.roster || []).length > 0) setStep("lineup");
    else setStep("roster");
  };

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [teamsRes, membersRes, matchRes] = await Promise.all([
        axiosInstance.get(API_PATHS.TEAMS_LIST),
        axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamIdNum)),
        axiosInstance.get(API_PATHS.TEAM_MATCH(teamIdNum, matchIdNum)),
      ]);
      const teams = Array.isArray(teamsRes.data) ? teamsRes.data : [];
      const team = teams.find((t) => Number(t.id) === teamIdNum);
      setTeamName(team?.name || `Отбор #${teamIdNum}`);
      setMembers(Array.isArray(membersRes.data?.members) ? membersRes.data.members : []);
      applyMatchState(matchRes.data);
    } catch (err) {
      setError(normalizeError(err, "Грешка при зареждане на мача."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [teamIdNum, matchIdNum]);

  const toggleAthlete = (athleteId) => {
    const id = Number(athleteId);
    setSelected((prev) => {
      if (prev[id]) {
        const copy = { ...prev };
        delete copy[id];
        setZones((zPrev) => {
          const zCopy = { ...zPrev };
          for (const [zone, aid] of Object.entries(zCopy)) {
            if (Number(aid) === id) delete zCopy[zone];
          }
          return zCopy;
        });
        setLiberoId((cur) => (Number(cur) === id ? "" : cur));
        return copy;
      }
      if (Object.keys(prev).length >= MATCH_MAX_ROSTER) {
        toast.error(`Можете да изберете най-много ${MATCH_MAX_ROSTER} състезатели.`);
        return prev;
      }
      const used = new Set(
        Object.values(prev)
          .map((r) => Number(r.jersey_number))
          .filter((n) => Number.isFinite(n) && n >= 0)
      );
      let jersey = 1;
      while (used.has(jersey) && jersey < 100) jersey += 1;
      return {
        ...prev,
        [id]: { jersey_number: String(jersey), position: "OH" },
      };
    });
  };

  const updatePlayer = (athleteId, patch) => {
    const id = Number(athleteId);
    setSelected((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...patch } };
    });
  };

  const saveMeta = async () => {
    const res = await axiosInstance.patch(API_PATHS.TEAM_MATCH(teamIdNum, matchIdNum), {
      opponent_name: meta.opponent_name.trim() || null,
      match_date: meta.match_date || null,
      venue: meta.venue.trim() || null,
      system: meta.system || "5-1",
      format: meta.format || "bo5",
    });
    return res.data;
  };

  const saveRoster = async () => {
    const players = selectedIds.map((athleteId, idx) => {
      const row = selected[athleteId];
      return {
        athlete_id: athleteId,
        jersey_number: Number(row?.jersey_number),
        position: row?.position || "OH",
        sort_order: idx,
      };
    });
    if (players.length === 0) {
      toast.error("Изберете поне един състезател.");
      return;
    }
    if (players.length < 6) {
      toast.error("За стартова шестица са нужни поне 6 състезатели.");
      return;
    }
    for (const p of players) {
      if (!Number.isInteger(p.jersey_number) || p.jersey_number < 0 || p.jersey_number > 99) {
        toast.error("Всеки състезател трябва да има валиден № екип (0–99).");
        return;
      }
    }
    const jerseys = players.map((p) => p.jersey_number);
    if (new Set(jerseys).size !== jerseys.length) {
      toast.error("Има дублирани номера на екип.");
      return;
    }

    try {
      setBusy(true);
      await saveMeta();
      const res = await axiosInstance.put(API_PATHS.TEAM_MATCH_ROSTER(teamIdNum, matchIdNum), { players });
      applyMatchState(res.data);
      setStep("lineup");
      toast.success("Съставът е записан. Подредете стартовата шестица.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на състава."));
    } finally {
      setBusy(false);
    }
  };

  const assignToActiveZone = (athleteId) => {
    const id = Number(athleteId);
    if (!activeZone) return;
    const next = { ...zones };
    for (const [zone, aid] of Object.entries(next)) {
      if (Number(aid) === id) delete next[Number(zone)];
    }
    next[activeZone] = id;
    setZones(next);
    if (Number(liberoId) === id) setLiberoId("");

    // След избор — към следващата празна зона (по ред 1→6)
    const fromIdx = ZONE_ORDER.indexOf(Number(activeZone));
    const searchOrder = [...ZONE_ORDER.slice(fromIdx + 1), ...ZONE_ORDER.slice(0, fromIdx)];
    const nextEmpty = searchOrder.find((z) => !next[z]);
    if (nextEmpty) setActiveZone(nextEmpty);
  };

  const persistLineupMap = async (zoneMap, nextLiberoId = liberoId) => {
    const missing = ZONE_ORDER.filter((z) => !zoneMap[z]);
    if (missing.length) {
      toast.error("Попълнете всички 6 зони преди размяна.");
      return null;
    }
    const slots = ZONE_ORDER.map((zone) => ({ zone, athlete_id: Number(zoneMap[zone]) }));
    const res = await axiosInstance.put(API_PATHS.TEAM_MATCH_LINEUP(teamIdNum, matchIdNum), {
      slots,
      libero_athlete_id: nextLiberoId ? Number(nextLiberoId) : null,
    });
    applyMatchState(res.data);
    return res.data;
  };

  const swapOnLineupStep = async (fromZone, toZone) => {
    const next = swapZoneAthletes(zones, fromZone, toZone);
    setZones(next);
    setActiveZone(toZone);
    if (ZONE_ORDER.every((z) => next[z])) {
      try {
        setBusy(true);
        await persistLineupMap(next, liberoId);
      } catch (err) {
        toast.error(normalizeError(err, "Неуспешна размяна."));
      } finally {
        setBusy(false);
      }
    }
  };

  const swapOnRotationView = async (fromZone, toZone) => {
    const list = match?.rotations || [];
    const rot = list.find((r) => Number(r.rotation) === Number(rotationView)) || list[0];
    if (!rot?.slots?.length) return;
    const visible = {};
    for (const s of rot.slots) visible[s.zone] = s.athlete_id;
    const swappedVisible = swapZoneAthletes(visible, fromZone, toZone);
    const stepsBack = Math.max(0, Number(rot.rotation) - 1);
    const newStart = reverseRotateZones(swappedVisible, stepsBack);
    setZones(newStart);
    try {
      setBusy(true);
      await persistLineupMap(newStart, liberoId);
      toast.success("Размяната е записана.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна размяна."));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveLineup = async () => {
    const missing = ZONE_ORDER.filter((z) => !zones[z]);
    if (missing.length) {
      toast.error("Попълнете всички 6 зони на корта.");
      return;
    }
    const slots = ZONE_ORDER.map((zone) => ({ zone, athlete_id: Number(zones[zone]) }));
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.TEAM_MATCH_LINEUP(teamIdNum, matchIdNum), {
        slots,
        libero_athlete_id: liberoId ? Number(liberoId) : null,
      });
      applyMatchState(res.data);
      setStep("rotations");
      setRotationView(1);
      toast.success("Стартовата шестица е записана. Ротациите R1–R6 са готови.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на шестицата."));
    } finally {
      setBusy(false);
    }
  };

  const usedOnCourt = useMemo(() => new Set(Object.values(zones).map(Number)), [zones]);

  const benchForZone = useMemo(() => {
    return rosterPlayers.filter((p) => {
      if (Number(liberoId) === p.athlete_id) return false;
      return true;
    });
  }, [rosterPlayers, liberoId]);

  const currentRotation = useMemo(() => {
    const list = match?.rotations || [];
    return list.find((r) => Number(r.rotation) === Number(rotationView)) || list[0] || null;
  }, [match, rotationView]);

  const maxRotation = match?.rotations?.length || 6;

  const goRotation = (next) => {
    const clamped = Math.min(maxRotation, Math.max(1, Number(next)));
    setRotationView(clamped);
  };

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;
  if (!match) return <EmptyState title="Мачът не е намерен" />;

  return (
    <section className="coachMobileHubSection">
      <div style={{ marginBottom: 8 }}>
        <Link to={`/coach/teams/${teamIdNum}/matches`} className="coachMobileMuted" style={{ fontSize: 13 }}>
          ← Мачове · {teamName}
        </Link>
        <h2 style={{ margin: "6px 0 4px", fontSize: 20 }}>
          {match.opponent_name ? `vs ${match.opponent_name}` : "Настройка на мач"}
        </h2>
        <p className="coachMobileMuted" style={{ margin: 0, fontSize: 13 }}>
          {MATCH_STATUS_LABEL[match.status] || match.status} · схема {match.system}
        </p>
      </div>

      <div className="matchStepTabs">
        <button
          type="button"
          className={`matchStepTab${step === "roster" ? " matchStepTab--active" : ""}`}
          onClick={() => setStep("roster")}
        >
          1. Състав
        </button>
        <button
          type="button"
          className={`matchStepTab${step === "lineup" ? " matchStepTab--active" : ""}`}
          onClick={() => setStep("lineup")}
          disabled={selectedIds.length < 6}
        >
          2. Шестица
        </button>
        <button
          type="button"
          className={`matchStepTab${step === "rotations" ? " matchStepTab--active" : ""}`}
          onClick={() => setStep("rotations")}
          disabled={!match.lineup?.complete}
        >
          3. Ротации
        </button>
      </div>

      {step === "roster" ? (
        <>
          <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
            <Input
              placeholder="Противник"
              value={meta.opponent_name}
              onChange={(e) => setMeta((p) => ({ ...p, opponent_name: e.target.value }))}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Дата</span>
              <Input
                type="date"
                value={meta.match_date}
                onChange={(e) => setMeta((p) => ({ ...p, match_date: e.target.value }))}
              />
            </label>
            <Input
              placeholder="Място"
              value={meta.venue}
              onChange={(e) => setMeta((p) => ({ ...p, venue: e.target.value }))}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Схема</span>
              <select
                value={meta.system}
                onChange={(e) => setMeta((p) => ({ ...p, system: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d8e1ec",
                  fontSize: 15,
                  background: "#fff",
                }}
              >
                {MATCH_SYSTEMS.map((s) => (
                  <option key={s.code} value={s.code} disabled={!s.enabled && s.code !== meta.system}>
                    {s.label}
                    {!s.enabled ? " (скоро)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Формат</span>
              <select
                value={meta.format}
                onChange={(e) => setMeta((p) => ({ ...p, format: e.target.value }))}
                disabled={match?.status === "live" || match?.status === "finished"}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d8e1ec",
                  fontSize: 15,
                  background: "#fff",
                }}
              >
                {MATCH_FORMATS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label} — {f.hint}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 14 }}>
              Състезатели ({selectedIds.length}/{MATCH_MAX_ROSTER})
            </strong>
          </div>

          {members.length === 0 ? (
            <EmptyState title="Празен състав" description="Добавете състезатели в отбора първо." />
          ) : (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, background: "#f8fafc", overflow: "hidden" }}>
              {members.map((m) => {
                const id = Number(m.athlete_id);
                const row = selected[id];
                const checked = Boolean(row);
                return (
                  <div
                    key={id}
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: "10px 12px",
                      borderBottom: "1px solid #eef2f7",
                      background: checked ? "#fff" : "transparent",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleAthlete(id)} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {m.athlete_name || m.name || `Състезател #${id}`}
                      </span>
                      {checked ? (
                        <span className="coachMobileMuted" style={{ marginLeft: "auto", fontSize: 12 }}>
                          {row.jersey_number ? `#${row.jersey_number}` : ""} {positionShort(row.position)}
                        </span>
                      ) : null}
                    </label>
                    {checked ? (
                      <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, paddingLeft: 28 }}>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>№ екип</span>
                          <Input
                            type="number"
                            min={0}
                            max={99}
                            value={row.jersey_number}
                            onChange={(e) => updatePlayer(id, { jersey_number: e.target.value })}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Позиция</span>
                          <select
                            value={row.position}
                            onChange={(e) => updatePlayer(id, { position: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #d8e1ec",
                              fontSize: 14,
                              background: "#fff",
                            }}
                          >
                            {MATCH_POSITIONS.map((p) => (
                              <option key={p.code} value={p.code}>
                                {p.short} — {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <Button disabled={busy || selectedIds.length < 6} onClick={saveRoster}>
            {busy ? "Запис..." : "Запази и към шестицата"}
          </Button>
        </>
      ) : null}

      {step === "lineup" ? (
        <>
          <p className="coachMobileMuted" style={{ margin: 0, fontSize: 13 }}>
            Кликни зона (син номер), после състезател.{" "}
            {SYSTEM_LINEUP_HINT[meta.system] || SYSTEM_LINEUP_HINT["5-1"]} След избор → следващата празна.
            {ZONE_ORDER.every((z) => zones[z]) ? " После можеш да влачиш за размяна." : ""}
          </p>
          <MatchCourt
            variant="pro"
            layout="grid"
            size="md"
            phase="grid"
            system={meta.system || "5-1"}
            rotation={1}
            slots={lineupSlotsPreview}
            libero={liberoPreview}
            activeZone={activeZone}
            editable
            rearrangeable={ZONE_ORDER.every((z) => zones[z])}
            showServe
            onZoneClick={setActiveZone}
            onSwapZones={swapOnLineupStep}
            title={meta.opponent_name ? `vs ${meta.opponent_name}` : teamName}
            subtitle={`СТАРТОВА ШЕСТИЦА · ${meta.system || "5-1"}`}
          />

          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 13 }}>За зона {activeZone} · избери състезател</strong>
            <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
              {benchForZone.map((p) => {
                const onCourt = usedOnCourt.has(p.athlete_id);
                const inThisZone = Number(zones[activeZone]) === p.athlete_id;
                return (
                  <button
                    key={p.athlete_id}
                    type="button"
                    disabled={busy}
                    onClick={() => assignToActiveZone(p.athlete_id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: inThisZone ? "2px solid #0f766e" : "1px solid #e2e8f0",
                      background: inThisZone ? "#ecfdf5" : "#fff",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    #{p.jersey_number} {p.athlete_name} · {positionShort(p.position)}
                    {onCourt && !inThisZone ? " (премести)" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Либеро (по избор)</span>
            <select
              value={liberoId}
              onChange={(e) => {
                const val = e.target.value;
                setLiberoId(val);
                if (val) {
                  setZones((prev) => {
                    const next = { ...prev };
                    for (const [zone, aid] of Object.entries(next)) {
                      if (Number(aid) === Number(val)) delete next[zone];
                    }
                    return next;
                  });
                }
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d8e1ec",
                fontSize: 15,
                background: "#fff",
              }}
            >
              <option value="">— без либеро —</option>
              {rosterPlayers
                .filter((p) => !usedOnCourt.has(p.athlete_id) || Number(liberoId) === p.athlete_id)
                .map((p) => (
                  <option key={p.athlete_id} value={p.athlete_id}>
                    #{p.jersey_number} {p.athlete_name} · {positionShort(p.position)}
                  </option>
                ))}
            </select>
          </label>

          <div style={{ display: "grid", gap: 8 }}>
            <Button disabled={busy} onClick={saveLineup}>
              {busy ? "Запис..." : "Запази шестицата · виж ротации"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setStep("roster")}>
              Назад към състава
            </Button>
          </div>
        </>
      ) : null}

      {step === "rotations" ? (
        currentRotation ? (
          <>
            <MatchRotationStage
              rotation={currentRotation.rotation}
              system={match.system}
              opponentName={match.opponent_name || ""}
              slots={currentRotation.slots}
              libero={currentRotation.libero}
              canPrev={Number(rotationView) > 1}
              canNext={Number(rotationView) < maxRotation}
              rearrangeable={!busy}
              onSwapZones={swapOnRotationView}
              onPrev={() => goRotation(Number(rotationView) - 1)}
              onNext={() => goRotation(Number(rotationView) + 1)}
              onBack={() => goRotation(1)}
              onRotate={() => goRotation(Number(rotationView) >= maxRotation ? 1 : Number(rotationView) + 1)}
              onEditLineup={() => setStep("lineup")}
              onShowLineupCard={() => setLineupCardOpen(true)}
              onStartLive={() => navigate(`/coach/teams/${teamIdNum}/matches/${matchIdNum}/live`)}
            />
            <Button variant="secondary" disabled={busy} onClick={() => navigate(`/coach/teams/${teamIdNum}/matches`)}>
              Към списъка с мачове
            </Button>
            <StartingLineupCard
              open={lineupCardOpen}
              onClose={() => setLineupCardOpen(false)}
              teamName={teamName}
              system={match.system}
              opponentName={match.opponent_name || ""}
              setNumber="1"
              slots={match.lineup?.slots || []}
              libero={match.lineup?.libero || null}
            />
          </>
        ) : (
          <EmptyState title="Няма ротации" description="Запишете стартовата шестица първо." />
        )
      ) : null}
    </section>
  );
}
