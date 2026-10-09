import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { competitionKindLabel } from "../../utils/competitionKinds";
import { Button } from "../ui";
import { useToast } from "../ToastProvider";

function kindBg(kind) {
  return competitionKindLabel(kind) || kind || "—";
}

export default function RisImportModal({
  open,
  onClose,
  onImported,
  fromDate,
  toDate,
  teams = [],
  coaches = [],
  cardIndexes = [],
  defaultCoachId = "",
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState(null);
  const [games, setGames] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [teamId, setTeamId] = useState("");
  const [coachId, setCoachId] = useState(defaultCoachId ? String(defaultCoachId) : "");
  const [cardIndexId, setCardIndexId] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setSelected(new Set());
    setTeamId("");
    setCoachId(defaultCoachId ? String(defaultCoachId) : "");
    setCardIndexId("");
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [st, gamesRes] = await Promise.all([
          axiosInstance.get(API_PATHS.RIS_STATUS),
          axiosInstance.get(API_PATHS.RIS_CLUB_GAMES, {
            params: { from: fromDate, to: toDate },
          }),
        ]);
        if (cancelled) return;
        setStatus(st.data || null);
        setGames(Array.isArray(gamesRes.data?.games) ? gamesRes.data.games : []);
      } catch (err) {
        if (!cancelled) {
          toast.error(normalizeError(err, "Неуспешно зареждане от БФВ календар."));
          setGames([]);
          setStatus(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fromDate, toDate, defaultCoachId]);

  const selectable = useMemo(
    () => games.filter((g) => !g.already_imported && !g.has_placeholders),
    [games],
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const n = Number(id);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const selectAllNew = () => {
    setSelected(new Set(selectable.map((g) => Number(g.ris_game_id))));
  };

  const importSelected = async () => {
    if (!teamId) {
      toast.error("Избери тренировъчна група за импорта.");
      return;
    }
    if (!coachId) {
      toast.error("Избери треньор.");
      return;
    }
    if (!selected.size) {
      toast.error("Маркирай поне един мач.");
      return;
    }
    setImporting(true);
    try {
      const items = [...selected].map((ris_game_id) => {
        const g = games.find((x) => Number(x.ris_game_id) === Number(ris_game_id));
        const suggested = g?.suggested_card_index_id;
        return {
          ris_game_id: Number(ris_game_id),
          team_id: Number(teamId),
          coach_id: Number(coachId),
          card_index_id: cardIndexId
            ? Number(cardIndexId)
            : suggested
              ? Number(suggested)
              : null,
          start_time: g?.time_placeholder ? null : g?.start_time || null,
          end_time: g?.end_time || null,
        };
      });
      const res = await axiosInstance.post(API_PATHS.RIS_IMPORT_GAMES, { items });
      const created = res.data?.created_count || 0;
      const skipped = res.data?.skipped_count || 0;
      const errs = res.data?.error_count || 0;
      if (created) toast.success(`Импортирани: ${created}`);
      if (skipped) toast.info(`Пропуснати (вече има): ${skipped}`);
      if (errs) toast.error(`Грешки при импорт: ${errs}`);
      onImported?.(res.data);
      onClose?.();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен импорт."));
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="matchLiveSubOverlay" role="dialog" aria-modal="true">
      <button type="button" className="matchLiveSubBackdrop" aria-label="Затвори" onClick={onClose} />
      <div className="matchLiveSubDrawer" style={{ maxHeight: "min(90dvh, 720px)", overflow: "auto" }}>
        <div className="matchLiveSubHead">
          <strong>От БФВ календар</strong>
          <button type="button" className="matchLiveStatsClose" onClick={onClose}>
            ✕
          </button>
        </div>

        {!status?.linked ? (
          <p className="matchLiveSubHint" style={{ color: "#fbbf24" }}>
            Клубът няма връзка със СЕК (bvf_club_id). Свържи клуба в BVF Admin, после пробвай пак.
          </p>
        ) : (
          <p className="matchLiveSubHint">
            Официални мачове за клуба · {fromDate} – {toDate}
            {status?.season_year ? ` · сезон ${status.season_year}` : ""}
          </p>
        )}

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Група</span>
            <select
              className="uiInput"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              style={{ minHeight: 40 }}
            >
              <option value="">— избери —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || `Група #${t.id}`}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Треньор</span>
            <select
              className="uiInput"
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              style={{ minHeight: 40 }}
            >
              <option value="">— избери —</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email || `Треньор #${c.id}`}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              Картотечен отбор (общ, опционално)
            </span>
            <select
              className="uiInput"
              value={cardIndexId}
              onChange={(e) => setCardIndexId(e.target.value)}
              style={{ minHeight: 40 }}
            >
              <option value="">Авто по възраст / без</option>
              {cardIndexes.map((ci) => (
                <option key={ci.id} value={ci.id}>
                  {ci.label || ci.age_group || `Картотека #${ci.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" onClick={selectAllNew} disabled={!selectable.length}>
            Маркирай новите ({selectable.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
            Изчисти
          </Button>
        </div>

        {loading ? <p className="coachMobileMuted">Зареждане от RIS…</p> : null}
        {!loading && games.length === 0 ? (
          <p className="coachMobileMuted">Няма мачове в БФВ календара за този период.</p>
        ) : null}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {games.map((g) => {
            const id = Number(g.ris_game_id);
            const checked = selected.has(id);
            const disabled = g.already_imported || g.has_placeholders;
            return (
              <li
                key={id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 10,
                  opacity: disabled ? 0.55 : 1,
                  background: checked ? "#f0f9ff" : "#fff",
                }}
              >
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: disabled ? "default" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(id)}
                    style={{ marginTop: 4 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>
                      {g.date} · {g.start_time}
                      {g.time_placeholder ? " (час уточни)" : ""}
                    </strong>
                    <div className="coachMobileMuted" style={{ fontSize: 13 }}>
                      vs {g.opponent_name || "—"} · {kindBg(g.competition_kind)}
                      {g.match_number ? ` · №${g.match_number}` : ""}
                    </div>
                    <div style={{ fontSize: 13 }}>{g.location}</div>
                    {g.championship_label ? (
                      <div className="coachMobileMuted" style={{ fontSize: 12 }}>
                        {g.championship_label}
                        {g.age_group_short ? ` · ${g.age_group_short}` : ""}
                      </div>
                    ) : null}
                    {g.already_imported ? (
                      <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>Вече импортиран</div>
                    ) : null}
                    {g.has_placeholders ? (
                      <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                        Отборът още не е определен в БФВ
                      </div>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="matchLiveSubActions" style={{ marginTop: 12 }}>
          <button type="button" className="matchLiveUndo" onClick={onClose}>
            Затвори
          </button>
          <button
            type="button"
            className="matchLiveNext"
            disabled={importing || !selected.size || !status?.linked}
            onClick={importSelected}
          >
            {importing ? "Импорт…" : `Импортирай (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
