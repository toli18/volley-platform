import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Input, Modal } from "../ui";
import { useToast } from "../ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

export const TEAM_SHEET_MAX_PLAYERS = 14;

const todayIso = () => new Date().toISOString().slice(0, 10);

function normalizeAthletes(list) {
  return (Array.isArray(list) ? list : [])
    .map((m) => {
      const id = Number(m.athlete_id ?? m.id);
      if (!id) return null;
      const j = m.jersey_number;
      return {
        athlete_id: id,
        athlete_name: m.athlete_name || m.name || `Състезател #${id}`,
        jersey_number:
          j === 0 || j ? String(j) : "",
      };
    })
    .filter(Boolean);
}

function parseJerseyInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 99) return "invalid";
  return n;
}

function buildJerseyMapFromRoster(roster) {
  const map = {};
  for (const m of roster) {
    map[m.athlete_id] = m.jersey_number ?? "";
  }
  return map;
}

/**
 * Официална бланка О-2 — същата като „Генерирай тимов лист“ в тренировъчната група.
 */
export default function TeamSheetO2Modal({
  open,
  onClose,
  teamId,
  athletes = [],
  initialAthleteIds = null,
  initialForm = null,
}) {
  const toast = useToast();
  const roster = useMemo(() => normalizeAthletes(athletes), [athletes]);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetStep, setSheetStep] = useState(1);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState([]);
  const [jerseyByAthlete, setJerseyByAthlete] = useState({});
  const [sheetForm, setSheetForm] = useState({
    competition: "",
    venue_city: "",
    age_group: "",
    sheet_date: todayIso(),
    jersey_color: "",
    head_coach: "",
    assistant_1: "",
    assistant_2: "",
  });

  useEffect(() => {
    if (!open) return;
    const defaults = {
      competition: "",
      venue_city: "",
      age_group: "",
      sheet_date: todayIso(),
      jersey_color: "",
      head_coach: "",
      assistant_1: "",
      assistant_2: "",
      ...(initialForm || {}),
    };
    setSheetForm(defaults);
    setSheetStep(1);
    const rosterNow = normalizeAthletes(athletes);
    const preset = Array.isArray(initialAthleteIds)
      ? initialAthleteIds.map(Number).filter(Boolean)
      : rosterNow.map((m) => m.athlete_id);
    setSelectedAthleteIds(preset.slice(0, TEAM_SHEET_MAX_PLAYERS));
    setJerseyByAthlete(buildJerseyMapFromRoster(rosterNow));
    // Reset only when dialog opens — avoid wiping edits on parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    if (sheetBusy) return;
    onClose?.();
    setSheetStep(1);
  };

  const toggleAthlete = (athleteId) => {
    const id = Number(athleteId);
    if (selectedAthleteIds.includes(id)) {
      setSelectedAthleteIds((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (selectedAthleteIds.length >= TEAM_SHEET_MAX_PLAYERS) {
      toast.error(`Можете да изберете най-много ${TEAM_SHEET_MAX_PLAYERS} състезатели.`);
      return;
    }
    setSelectedAthleteIds((prev) => [...prev, id]);
  };

  const selectAllAthletes = () => {
    const ids = roster.map((m) => m.athlete_id);
    if (ids.length > TEAM_SHEET_MAX_PLAYERS) {
      toast.error(`Изберете до ${TEAM_SHEET_MAX_PLAYERS} състезатели (има ${ids.length}).`);
      setSelectedAthleteIds(ids.slice(0, TEAM_SHEET_MAX_PLAYERS));
      return;
    }
    setSelectedAthleteIds(ids);
  };

  const setJersey = (athleteId, value) => {
    const id = Number(athleteId);
    setJerseyByAthlete((prev) => ({ ...prev, [id]: value }));
  };

  const resetJerseysFromProfile = () => {
    setJerseyByAthlete(buildJerseyMapFromRoster(roster));
    toast.success("Номерата са върнати от профилите.");
  };

  const validateSelectedJerseys = () => {
    const used = new Map();
    for (const id of selectedAthleteIds) {
      const parsed = parseJerseyInput(jerseyByAthlete[id]);
      if (parsed === "invalid") {
        const row = roster.find((m) => m.athlete_id === id);
        toast.error(`Невалиден номер за ${row?.athlete_name || id} (0–99).`);
        return false;
      }
      if (parsed == null) continue;
      if (used.has(parsed)) {
        const other = roster.find((m) => m.athlete_id === used.get(parsed));
        const row = roster.find((m) => m.athlete_id === id);
        toast.error(
          `Номер ${parsed} е дублиран в листа (${row?.athlete_name || id} и ${other?.athlete_name || used.get(parsed)}).`,
        );
        return false;
      }
      used.set(parsed, id);
    }
    return true;
  };

  const downloadTeamSheet = async () => {
    const tid = Number(teamId);
    if (!tid) {
      toast.error("Липсва тренировъчна група за бланката.");
      return;
    }
    if (selectedAthleteIds.length === 0) {
      toast.error("Изберете поне един състезател.");
      return;
    }
    if (!validateSelectedJerseys()) return;

    const jersey_overrides = [];
    for (const id of selectedAthleteIds) {
      const parsed = parseJerseyInput(jerseyByAthlete[id]);
      if (parsed != null && parsed !== "invalid") {
        jersey_overrides.push({ athlete_id: id, jersey_number: parsed });
      }
    }

    try {
      setSheetBusy(true);
      const res = await axiosInstance.post(
        API_PATHS.TEAM_SHEET_PDF(tid),
        {
          competition: sheetForm.competition.trim() || null,
          venue_city: sheetForm.venue_city.trim() || null,
          age_group: sheetForm.age_group.trim() || null,
          sheet_date: sheetForm.sheet_date || null,
          jersey_color: sheetForm.jersey_color.trim() || null,
          head_coach: sheetForm.head_coach.trim() || null,
          assistant_1: sheetForm.assistant_1.trim() || null,
          assistant_2: sheetForm.assistant_2.trim() || null,
          athlete_ids: selectedAthleteIds,
          jersey_overrides,
        },
        { responseType: "blob" },
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timov-list-${tid}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Тимовият лист (О-2) е генериран.");
      onClose?.();
      setSheetStep(1);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно генериране на тимов лист."));
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissable={!sheetBusy}
      title={sheetStep === 1 ? "Тимов лист (О-2) · Стъпка 1" : "Тимов лист (О-2) · Стъпка 2"}
      size="compact"
    >
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          {sheetStep === 1
            ? "Попълнете данните за листа"
            : "Изберете състезателите и проверете номерата (до 14)"}
        </p>

        {sheetStep === 1 ? (
          <>
            <Input
              placeholder="Състезание"
              value={sheetForm.competition}
              onChange={(e) => setSheetForm((p) => ({ ...p, competition: e.target.value }))}
            />
            <Input
              placeholder="Място / град на състезанието"
              value={sheetForm.venue_city}
              onChange={(e) => setSheetForm((p) => ({ ...p, venue_city: e.target.value }))}
            />
            <Input
              placeholder="Възраст"
              value={sheetForm.age_group}
              onChange={(e) => setSheetForm((p) => ({ ...p, age_group: e.target.value }))}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Дата</span>
              <Input
                type="date"
                value={sheetForm.sheet_date}
                onChange={(e) => setSheetForm((p) => ({ ...p, sheet_date: e.target.value }))}
              />
            </label>
            <Input
              placeholder="Цвят на екип"
              value={sheetForm.jersey_color}
              onChange={(e) => setSheetForm((p) => ({ ...p, jersey_color: e.target.value }))}
            />
            <Input
              placeholder="Старши треньор"
              value={sheetForm.head_coach}
              onChange={(e) => setSheetForm((p) => ({ ...p, head_coach: e.target.value }))}
            />
            <Input
              placeholder="Помощник-треньор 1"
              value={sheetForm.assistant_1}
              onChange={(e) => setSheetForm((p) => ({ ...p, assistant_1: e.target.value }))}
            />
            <Input
              placeholder="Помощник-треньор 2"
              value={sheetForm.assistant_2}
              onChange={(e) => setSheetForm((p) => ({ ...p, assistant_2: e.target.value }))}
            />
            <div className="uiModalActions">
              <Button disabled={sheetBusy} onClick={() => setSheetStep(2)}>
                Напред · Състезатели
              </Button>
              <Button variant="secondary" disabled={sheetBusy} onClick={close}>
                Отказ
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                  Състезатели ({selectedAthleteIds.length}/{TEAM_SHEET_MAX_PLAYERS})
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={sheetBusy || roster.length === 0}
                    onClick={selectAllAthletes}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#0f766e",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Всички
                  </button>
                  <button
                    type="button"
                    disabled={sheetBusy || selectedAthleteIds.length === 0}
                    onClick={() => setSelectedAthleteIds([])}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#64748b",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Изчисти
                  </button>
                  <button
                    type="button"
                    disabled={sheetBusy || roster.length === 0}
                    onClick={resetJerseysFromProfile}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#0f766e",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Номера от профил
                  </button>
                </div>
              </div>
              {roster.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Няма състезатели.</p>
              ) : (
                <div
                  style={{
                    maxHeight: 320,
                    overflow: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: "6px 8px",
                    background: "#f8fafc",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {roster.map((m) => {
                    const id = m.athlete_id;
                    const checked = selectedAthleteIds.includes(id);
                    return (
                      <div
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 4px",
                          borderBottom: "1px solid #eef2f7",
                          fontSize: 14,
                          opacity: checked ? 1 : 0.55,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={sheetBusy}
                          onChange={() => toggleAthlete(id)}
                          aria-label={`Включи ${m.athlete_name}`}
                        />
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={99}
                          disabled={sheetBusy || !checked}
                          value={jerseyByAthlete[id] ?? ""}
                          onChange={(e) => setJersey(id, e.target.value)}
                          placeholder="№"
                          style={{ width: 56, flexShrink: 0, padding: "6px 8px" }}
                          aria-label={`Номер ${m.athlete_name}`}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>{m.athlete_name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Номерата идват от профила; промяната тук важи само за този лист (не записва профила).
            </p>
            <div className="uiModalActions">
              <Button disabled={sheetBusy || selectedAthleteIds.length === 0} onClick={downloadTeamSheet}>
                {sheetBusy ? "Генериране..." : "Изтегли PDF"}
              </Button>
              <Button variant="secondary" disabled={sheetBusy} onClick={() => setSheetStep(1)}>
                Назад
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
