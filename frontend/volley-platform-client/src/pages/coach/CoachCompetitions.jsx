import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import useNavRoles from "../../navigation/useNavRoles";
import TeamSheetO2Modal from "../../components/schedule/TeamSheetO2Modal";
import CompetitionEventModal from "../../components/schedule/CompetitionEventModal";
import { useToast } from "../../components/ToastProvider";
import { COMPETITION_KIND_OPTIONS, competitionKindLabel } from "../../utils/competitionKinds";
import { Button, Input } from "../../components/ui";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEndKey(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** from = начало на текущия месец; to = край на месеца след +monthsAhead (вкл. текущия). */
function forwardMonthsRange(monthsAhead = 2) {
  const now = new Date();
  const from = monthStartKey(now);
  const end = new Date(now.getFullYear(), now.getMonth() + Math.max(0, monthsAhead - 1), 1);
  const to = monthEndKey(end.getFullYear(), end.getMonth());
  return { from, to };
}

function formatRangeLabel(from, to) {
  try {
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    const opts = { day: "numeric", month: "short", year: "numeric" };
    return `${a.toLocaleDateString("bg-BG", opts)} – ${b.toLocaleDateString("bg-BG", opts)}`;
  } catch {
    return `${from} – ${to}`;
  }
}

const PERIOD_PRESETS = [
  { id: "2m", label: "2 месеца", months: 2 },
  { id: "3m", label: "3 месеца", months: 3 },
  { id: "month", label: "Този месец", months: 1 },
  { id: "custom", label: "Период", months: null },
];

function defaultCompetitionForm(date, coachId = "") {
  return {
    team_id: "",
    coach_id: coachId ? String(coachId) : "",
    card_index_id: "",
    competition_kind: COMPETITION_KIND_OPTIONS[0].value,
    date: date || todayKey(),
    location: "",
    start_time: "10:00",
    end_time: "12:00",
    notes: "",
  };
}

function statusLabel(row) {
  if (row.roster_locked || row.roster_status === "locked") return "Заключен състав";
  if (row.roster_status === "confirmed") return "Състав готов";
  if (row.needs_roster || row.roster_status === "pending") return "Чака тимов лист";
  return row.roster_status || "—";
}

export default function CoachCompetitions() {
  const toast = useToast();
  const { user, isHeadCoachUser } = useNavRoles();
  const currentUserId = user?.id;
  const defaultRange = useMemo(() => forwardMonthsRange(2), []);
  const [periodPreset, setPeriodPreset] = useState("2m");
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [compForm, setCompForm] = useState(() => defaultCompetitionForm(todayKey(), ""));
  const [saving, setSaving] = useState(false);
  const [rosterEvent, setRosterEvent] = useState(null);
  const [roster, setRoster] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [savingRoster, setSavingRoster] = useState(false);
  const [teams, setTeams] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [cardIndexes, setCardIndexes] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetCtx, setSheetCtx] = useState(null);

  const rangeLabel = useMemo(() => formatRangeLabel(fromDate, toDate), [fromDate, toDate]);

  const applyPreset = (presetId) => {
    setPeriodPreset(presetId);
    if (presetId === "custom") return;
    const preset = PERIOD_PRESETS.find((p) => p.id === presetId);
    const months = preset?.months || 2;
    const next = forwardMonthsRange(months);
    setFromDate(next.from);
    setToDate(next.to);
  };

  const load = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) {
      toast.error("Невалиден период (от ≤ до).");
      return;
    }
    setBusy(true);
    try {
      const params = { from: fromDate, to: toDate };
      if (filter === "mine") params.mine = true;
      if (filter === "needs_roster") params.needs_roster = true;
      const res = await axiosInstance.get(API_PATHS.SCHEDULE_COMPETITIONS_LIST, { params });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на състезания."));
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [fromDate, toDate, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const tRes = await axiosInstance.get(API_PATHS.TEAMS_LIST);
        setTeams(Array.isArray(tRes.data) ? tRes.data : []);
      } catch {
        setTeams([]);
      }
      try {
        const ciRes = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_LOCAL);
        const ci = ciRes.data;
        const list = Array.isArray(ci) ? ci : ci?.items || ci?.card_indexes || [];
        setCardIndexes(
          list.map((c) => ({
            id: c.id,
            label: c.label || c.age_group || `Картотека #${c.id}`,
          })),
        );
      } catch {
        setCardIndexes([]);
      }
      if (isHeadCoachUser) {
        try {
          const cRes = await axiosInstance.get(API_PATHS.CLUB_HEAD_COACHES || "/api/club-head/coaches");
          setCoaches(Array.isArray(cRes.data) ? cRes.data : cRes.data?.coaches || []);
        } catch {
          setCoaches(user ? [{ id: user.id, name: user.name || user.email }] : []);
        }
      }
    })();
  }, [isHeadCoachUser, user]);

  const openCreate = () => {
    setCompForm(defaultCompetitionForm(todayKey(), currentUserId ? String(currentUserId) : ""));
    setModalOpen(true);
  };

  const saveCompetition = async () => {
    if (!compForm.team_id || !compForm.location.trim()) {
      toast.error("Избери група и място.");
      return;
    }
    const coachId = isHeadCoachUser ? Number(compForm.coach_id || 0) : currentUserId;
    if (!coachId) {
      toast.error("Избери треньор.");
      return;
    }
    setSaving(true);
    try {
      await axiosInstance.post(API_PATHS.SCHEDULE_COMPETITION_CREATE, {
        team_id: Number(compForm.team_id),
        coach_id: coachId,
        date: compForm.date,
        location: compForm.location.trim(),
        start_time: compForm.start_time,
        end_time: compForm.end_time,
        competition_kind: compForm.competition_kind,
        notes: compForm.notes.trim() || null,
        card_index_id: compForm.card_index_id ? Number(compForm.card_index_id) : null,
      });
      toast.success("Състезанието е създадено.");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване."));
    } finally {
      setSaving(false);
    }
  };

  const openRoster = async (event) => {
    setRosterEvent(event);
    setRoster(null);
    try {
      const res = await axiosInstance.get(API_PATHS.SCHEDULE_COMPETITION_ROSTER(event.id));
      setRoster(res.data);
      setSelectedIds(res.data?.athlete_ids || []);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на тимовия лист."));
      setRosterEvent(null);
    }
  };

  const toggleAthlete = (id) => {
    setSelectedIds((prev) => {
      const n = Number(id);
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= (roster?.max_athletes || 14)) {
        toast.error(`Максимум ${roster?.max_athletes || 14} състезатели.`);
        return prev;
      }
      return [...prev, n];
    });
  };

  const saveRoster = async () => {
    if (!rosterEvent) return;
    setSavingRoster(true);
    try {
      await axiosInstance.put(API_PATHS.SCHEDULE_COMPETITION_ROSTER(rosterEvent.id), {
        athlete_ids: selectedIds,
      });
      toast.success("Тимовият лист е записан.");
      setRosterEvent(null);
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на тимовия лист."));
    } finally {
      setSavingRoster(false);
    }
  };

  const openOfficialSheet = async (event, rosterData = null) => {
    try {
      let data = rosterData;
      if (!data) {
        const res = await axiosInstance.get(API_PATHS.SCHEDULE_COMPETITION_ROSTER(event.id));
        data = res.data;
      }
      const team = teams.find((t) => Number(t.id) === Number(event.team_id));
      const overrideIds =
        rosterEvent?.id === event.id && selectedIds?.length ? selectedIds : data?.athlete_ids || [];
      const athletes = (data?.candidates || []).map((c) => ({
        athlete_id: Number(c.id),
        athlete_name: c.name,
      }));
      const kind = competitionKindLabel(event);
      const titleBits = [kind, event.carded_team_label].filter(Boolean);
      setSheetCtx({
        teamId: Number(event.team_id),
        athletes,
        athleteIds: (overrideIds || []).map(Number).filter(Boolean),
        form: {
          competition: titleBits.join(" · ") || kind,
          venue_city: event.location || "",
          age_group: team?.age_group || event.carded_team_label || "",
          sheet_date: event.date || todayKey(),
          jersey_color: "",
          head_coach: event.coach_name || user?.name || user?.email || "",
          assistant_1: "",
          assistant_2: "",
        },
      });
      setSheetOpen(true);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно отваряне на бланка О-2."));
    }
  };

  return (
    <div className="coachMobilePage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Състезания</h2>
        <span className="feesCoachHeadBadge">{rows.length}</span>
      </header>

      <div className="coachMobileSubNav" style={{ marginBottom: 8 }}>
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`coachMobileSubNavBtn${periodPreset === p.id ? " is-active" : ""}`}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="parentPortalScheduleNav" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="parentPortalScheduleNavLabel" style={{ textTransform: "none" }}>
          {rangeLabel}
        </span>
        {isHeadCoachUser ? (
          <Button size="sm" onClick={openCreate}>
            Ново състезание
          </Button>
        ) : null}
      </div>

      {periodPreset === "custom" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 8,
            marginBottom: 12,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>От</span>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>До</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <Button size="sm" variant="secondary" onClick={load} disabled={busy}>
            Приложи
          </Button>
        </div>
      ) : null}

      <div className="coachMobileSubNav" style={{ marginBottom: 12 }}>
        {[
          { id: "all", label: "Всички" },
          { id: "mine", label: "Моите" },
          { id: "needs_roster", label: "Чака лист" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={`coachMobileSubNavBtn${filter === f.id ? " is-active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {busy ? <p className="coachMobileMuted">Зареждане…</p> : null}
      {!busy && rows.length === 0 ? (
        <p className="coachMobileMuted">Няма състезания за този период.</p>
      ) : null}

      <ul className="feesAthleteList" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <li key={row.id} className="feesAthleteCardCompact" style={{ marginBottom: 8 }}>
            <div className="feesAthleteCardCompactMain">
              <strong>
                {row.date} · {row.start_time}–{row.end_time}
              </strong>
              <div className="coachMobileMuted">
                {row.competition_kind_label || row.competition_kind} · {row.location}
              </div>
              <div>
                {row.team_name || `Група #${row.team_id}`}
                {row.carded_team_label ? ` · ${row.carded_team_label}` : ""}
              </div>
              <div className="coachMobileMuted">
                {statusLabel(row)}
                {row.roster_selected_count
                  ? ` · ${row.roster_selected_count} в листа`
                  : ""}
              </div>
            </div>
            <div className="feesAthleteCardCompactActions feesAthleteCardCompactActions--stack" style={{ display: "grid", gap: 6 }}>
              <Button size="sm" variant={row.needs_roster ? undefined : "secondary"} onClick={() => openRoster(row)}>
                Тимов лист
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openOfficialSheet(row)}>
                Генерирай тимов лист
              </Button>
              <Link to="/coach/schedule" className="uiMuted" style={{ fontSize: 12, textAlign: "center" }}>
                В календара
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <CompetitionEventModal
        open={modalOpen}
        busy={saving}
        isHeadCoach={isHeadCoachUser}
        teams={teams}
        coaches={coaches}
        cardIndexes={cardIndexes}
        form={compForm}
        setForm={setCompForm}
        editId={null}
        onClose={() => setModalOpen(false)}
        onSave={saveCompetition}
      />

      {rosterEvent && roster ? (
        <div className="matchLiveSubOverlay" role="dialog" aria-modal="true">
          <button type="button" className="matchLiveSubBackdrop" aria-label="Затвори" onClick={() => setRosterEvent(null)} />
          <div className="matchLiveSubDrawer" style={{ maxHeight: "85vh", overflow: "auto" }}>
            <div className="matchLiveSubHead">
              <strong>Тимов лист · {rosterEvent.date}</strong>
              <button type="button" className="matchLiveStatsClose" onClick={() => setRosterEvent(null)}>
                ✕
              </button>
            </div>
            <p className="matchLiveSubHint">
              Макс. {roster.max_athletes}. Избрани: {selectedIds.length}. Корекции: {roster.edit_count}/3
              {roster.locked ? " · Заключен" : ` · Остават ${roster.edits_remaining}`}.
            </p>
            <div className="matchLiveSubSection">
              {(roster.candidates || []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`matchLiveSubChip${selectedIds.includes(Number(c.id)) ? " is-active" : ""}`}
                  disabled={roster.locked || !rosterEvent.can_edit_roster}
                  onClick={() => toggleAthlete(c.id)}
                >
                  {c.name}
                </button>
              ))}
              {!roster.candidates?.length ? (
                <p className="matchLiveSubEmpty">Няма кандидати (група/картотека).</p>
              ) : null}
            </div>
            <div className="matchLiveSubActions">
              <button type="button" className="matchLiveUndo" onClick={() => setRosterEvent(null)}>
                Затвори
              </button>
              <button
                type="button"
                className="matchLiveUndo"
                onClick={() => openOfficialSheet(rosterEvent, roster)}
              >
                Генерирай тимов лист
              </button>
              {rosterEvent.can_edit_roster && !roster.locked ? (
                <button type="button" className="matchLiveNext" disabled={savingRoster} onClick={saveRoster}>
                  {savingRoster ? "Запис…" : "Запиши състава"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <TeamSheetO2Modal
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSheetCtx(null);
        }}
        teamId={sheetCtx?.teamId}
        athletes={sheetCtx?.athletes || []}
        initialAthleteIds={sheetCtx?.athleteIds}
        initialForm={sheetCtx?.form}
      />
    </div>
  );
}
