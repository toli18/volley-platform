import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import {
  downloadPdfBlob,
  isMobileBrowser,
  isNativeApp,
  navigateToHttpsDownload,
  openPdfPreviewWindow,
} from "../../utils/downloadPdfBlob";
import { Button, Input, Modal } from "../ui";
import { useToast } from "../ToastProvider";
import { parseApiError } from "../../utils/normalizeError";

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
        jersey_number: j === 0 || j ? String(j) : "",
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

function jerseySortKey(athleteId, jerseyByAthlete) {
  const parsed = parseJerseyInput(jerseyByAthlete[athleteId]);
  if (parsed === null || parsed === "invalid") return [1, 999, athleteId];
  return [0, parsed, athleteId];
}

function sortRosterByJersey(list, jerseyByAthlete) {
  return [...list].sort((a, b) => {
    const ka = jerseySortKey(a.athlete_id, jerseyByAthlete);
    const kb = jerseySortKey(b.athlete_id, jerseyByAthlete);
    for (let i = 0; i < 3; i += 1) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });
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
  const [captainAthleteId, setCaptainAthleteId] = useState(null);
  const [liberoAthleteIds, setLiberoAthleteIds] = useState([]);
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
    const initialIds = preset.slice(0, TEAM_SHEET_MAX_PLAYERS);
    setSelectedAthleteIds(initialIds);
    setJerseyByAthlete(buildJerseyMapFromRoster(rosterNow));
    setCaptainAthleteId(initialIds[0] ?? null);
    setLiberoAthleteIds([]);
    // Reset only when dialog opens; avoid wiping edits on parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    if (sheetBusy) return;
    onClose?.();
    setSheetStep(1);
  };

  const sortedRoster = useMemo(
    () => sortRosterByJersey(roster, jerseyByAthlete),
    [roster, jerseyByAthlete],
  );

  const toggleAthlete = (athleteId) => {
    const id = Number(athleteId);
    if (selectedAthleteIds.includes(id)) {
      setSelectedAthleteIds((prev) => prev.filter((x) => x !== id));
      if (captainAthleteId === id) {
        const rest = selectedAthleteIds.filter((x) => x !== id);
        setCaptainAthleteId(rest[0] ?? null);
      }
      setLiberoAthleteIds((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (selectedAthleteIds.length >= TEAM_SHEET_MAX_PLAYERS) {
      toast.error(`Можете да изберете най-много ${TEAM_SHEET_MAX_PLAYERS} състезатели.`);
      return;
    }
    setSelectedAthleteIds((prev) => [...prev, id]);
  };

  const toggleCaptainTag = (athleteId) => {
    const id = Number(athleteId);
    if (!selectedAthleteIds.includes(id)) return;
    setCaptainAthleteId((prev) => (prev === id ? null : id));
  };

  const toggleLiberoTag = (athleteId) => {
    const id = Number(athleteId);
    if (!selectedAthleteIds.includes(id)) return;
    setLiberoAthleteIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) {
        toast.error("Можете да изберете най-много 2 либеро.");
        return prev;
      }
      return [...prev, id];
    });
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
    if (!captainAthleteId || !selectedAthleteIds.includes(Number(captainAthleteId))) {
      toast.error("Изберете капитан на отбора.");
      return;
    }

    const jersey_overrides = [];
    for (const id of selectedAthleteIds) {
      const parsed = parseJerseyInput(jerseyByAthlete[id]);
      if (parsed != null && parsed !== "invalid") {
        jersey_overrides.push({ athlete_id: id, jersey_number: parsed });
      }
    }

    const body = {
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
      captain_athlete_id: Number(captainAthleteId),
      libero_athlete_ids: liberoAthleteIds
        .map(Number)
        .filter((id) => id && selectedAthleteIds.includes(id)),
    };
    const filename = `timov-list-${tid}.pdf`;
    // Mobile: sync-open a tab, then navigate it to HTTPS attachment URL (no iframe).
    const useLink = isMobileBrowser() || isNativeApp();
    const previewWindow = useLink ? openPdfPreviewWindow() : null;

    try {
      setSheetBusy(true);
      if (useLink) {
        const res = await axiosInstance.post(
          `${API_PATHS.TEAM_SHEET_PDF(tid)}?as=link`,
          body,
        );
        const path = res?.data?.url || (res?.data?.token
          ? API_PATHS.TEAM_SHEET_FILE(tid, res.data.token)
          : null);
        if (!path) throw new Error("Сървърът не върна линк за изтегляне.");
        const result = navigateToHttpsDownload(path, {
          previewWindow,
          filename: res?.data?.filename || filename,
        });
        toast.success(
          result === "opened" || result === "navigated"
            ? "PDF е готов. Ако не се запише сам, ползвай Изтегли / Сподели в новия таб."
            : "Тимовият лист (О-2) се изтегля. Провери Downloads / Известия.",
        );
      } else {
        const res = await axiosInstance.post(API_PATHS.TEAM_SHEET_PDF(tid), body, {
          responseType: "blob",
        });
        const result = await downloadPdfBlob(res.data, filename);
        if (result === "cancelled") {
          toast.error("Изтеглянето е отказано. Опитай отново.");
          return;
        }
        toast.success(
          result === "shared"
            ? "Тимовият лист (О-2) е готов. Запиши го от менюто Сподели."
            : "Тимовият лист (О-2) е генериран. Провери Downloads / Файлове.",
        );
      }
      window.setTimeout(() => {
        onClose?.();
        setSheetStep(1);
      }, 500);
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(await parseApiError(err, "Неуспешно генериране на тимов лист."));
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissable={!sheetBusy}
      showClose={!sheetBusy}
      title={sheetStep === 1 ? "Тимов лист (О-2) · Стъпка 1" : "Тимов лист (О-2) · Стъпка 2"}
      size="compact"
      className="teamSheetO2Modal"
    >
      <div className={`teamSheetO2Body${sheetStep === 2 ? " teamSheetO2Body--step2" : ""}`}>
        <div className="teamSheetO2Top">
          <p className="teamSheetO2Hint">
            {sheetStep === 1
              ? "Попълнете данните за листа"
              : "Изберете състезателите и проверете номерата (до 14). Докосни K / L в реда."}
          </p>
          {sheetStep === 2 ? (
            <div className="teamSheetO2Toolbar">
              <span className="teamSheetO2Count">
                Състезатели ({selectedAthleteIds.length}/{TEAM_SHEET_MAX_PLAYERS})
                {captainAthleteId ? " · K ✓" : ""}
                {liberoAthleteIds.length ? ` · L ${liberoAthleteIds.length}` : ""}
              </span>
              <div className="teamSheetO2Links">
                <button
                  type="button"
                  className="teamSheetO2Link"
                  disabled={sheetBusy || roster.length === 0}
                  onClick={selectAllAthletes}
                >
                  Всички
                </button>
                <button
                  type="button"
                  className="teamSheetO2Link teamSheetO2Link--muted"
                  disabled={sheetBusy || selectedAthleteIds.length === 0}
                  onClick={() => {
                    setSelectedAthleteIds([]);
                    setCaptainAthleteId(null);
                    setLiberoAthleteIds([]);
                  }}
                >
                  Изчисти
                </button>
                <button
                  type="button"
                  className="teamSheetO2Link"
                  disabled={sheetBusy || roster.length === 0}
                  onClick={resetJerseysFromProfile}
                >
                  Номера от профил
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {sheetStep === 1 ? (
          <div className="teamSheetO2Step1">
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
          </div>
        ) : roster.length === 0 ? (
          <p className="teamSheetO2Note">Няма състезатели.</p>
        ) : (
          <div className="teamSheetO2List">
            {sortedRoster.map((m) => {
              const id = m.athlete_id;
              const checked = selectedAthleteIds.includes(id);
              const isCaptain = captainAthleteId === id;
              const isLibero = liberoAthleteIds.includes(id);
              return (
                <div
                  key={id}
                  className={`teamSheetO2Row${checked ? "" : " teamSheetO2Row--dim"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={sheetBusy}
                    onChange={() => toggleAthlete(id)}
                    aria-label={`Включи ${m.athlete_name}`}
                  />
                  <input
                    className="teamSheetO2Jersey"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    disabled={sheetBusy || !checked}
                    value={jerseyByAthlete[id] ?? ""}
                    onChange={(e) => setJersey(id, e.target.value)}
                    placeholder="№"
                    aria-label={`Номер ${m.athlete_name}`}
                  />
                  <span className="teamSheetO2Name" title={m.athlete_name}>
                    {m.athlete_name}
                  </span>
                  <div className="teamSheetO2Tags">
                    <button
                      type="button"
                      className={`teamSheetO2Tag${isCaptain ? " is-active is-captain" : ""}`}
                      disabled={sheetBusy || !checked}
                      aria-pressed={isCaptain}
                      aria-label={`Капитан: ${m.athlete_name}`}
                      onClick={() => toggleCaptainTag(id)}
                    >
                      K
                    </button>
                    <button
                      type="button"
                      className={`teamSheetO2Tag${isLibero ? " is-active is-libero" : ""}`}
                      disabled={sheetBusy || !checked}
                      aria-pressed={isLibero}
                      aria-label={`Либеро: ${m.athlete_name}`}
                      onClick={() => toggleLiberoTag(id)}
                    >
                      L
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="teamSheetO2Footer">
        {sheetStep === 2 ? (
          <p className="teamSheetO2Note">
            PDF се подрежда по № · K = Капитан · L = Либеро (промените важат само за този лист).
          </p>
        ) : null}
        <div className="uiModalActions teamSheetO2Actions">
          {sheetStep === 1 ? (
            <>
              <Button disabled={sheetBusy} onClick={() => setSheetStep(2)}>
                Напред · Състезатели
              </Button>
              <Button variant="secondary" disabled={sheetBusy} onClick={close}>
                Отказ
              </Button>
            </>
          ) : (
            <>
              <Button disabled={sheetBusy || selectedAthleteIds.length === 0} onClick={downloadTeamSheet}>
                {sheetBusy ? "Генериране..." : "Изтегли PDF"}
              </Button>
              <Button variant="secondary" disabled={sheetBusy} onClick={() => setSheetStep(1)}>
                Назад
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
