import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { competitionKindLabel } from "../../utils/competitionKinds";
import { Button, Input, Modal } from "../ui";
import { useToast } from "../ToastProvider";

function kindLabel(kind) {
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!importing}
      title="От БФВ календар"
      size="wide"
    >
      <div className="risImportBody">
        {!status?.linked && !loading ? (
          <p className="uiHint" style={{ margin: 0, color: "#b45309" }}>
            Клубът няма връзка със СЕК (bvf_club_id). Свържи клуба в BVF Admin, после пробвай пак.
          </p>
        ) : (
          <p className="uiHint" style={{ margin: 0 }}>
            Официални мачове за клуба · {fromDate} – {toDate}
            {status?.season_year ? ` · сезон ${status.season_year}` : ""}
          </p>
        )}

        <Input as="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Избери тренировъчна група</option>
          {teams.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name || `Група #${t.id}`}
            </option>
          ))}
        </Input>

        <Input as="select" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
          <option value="">Избери треньор</option>
          {coaches.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name || c.email || `Треньор #${c.id}`}
            </option>
          ))}
        </Input>

        <Input as="select" value={cardIndexId} onChange={(e) => setCardIndexId(e.target.value)}>
          <option value="">Картотека: авто по възраст / без</option>
          {cardIndexes.map((ci) => (
            <option key={ci.id} value={String(ci.id)}>
              {ci.label || ci.age_group || `Картотека #${ci.id}`}
            </option>
          ))}
        </Input>

        <div className="competitionsToolbarActions">
          <Button size="sm" variant="secondary" onClick={selectAllNew} disabled={!selectable.length || loading}>
            Маркирай новите ({selectable.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            Изчисти
          </Button>
        </div>

        {loading ? <p className="uiHint">Зареждане от БФВ…</p> : null}
        {!loading && games.length === 0 ? (
          <p className="uiHint">Няма мачове в БФВ календара за този период.</p>
        ) : null}

        <div className="risImportList">
          {games.map((g) => {
            const id = Number(g.ris_game_id);
            const checked = selected.has(id);
            const disabled = Boolean(g.already_imported || g.has_placeholders);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(id)}
                aria-pressed={checked}
                className={`risImportRow${checked ? " is-checked" : ""}`}
              >
                <span className="risImportCheck" aria-hidden>
                  {checked ? "✓" : ""}
                </span>
                <span className="risImportRowText">
                  <strong>
                    {g.date} · {g.start_time}
                    {g.time_placeholder ? " (час уточни)" : ""}
                  </strong>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    vs {g.opponent_name || "—"} · {kindLabel(g.competition_kind)}
                    {g.match_number ? ` · №${g.match_number}` : ""}
                  </span>
                  <span style={{ fontSize: 13 }}>{g.location}</span>
                  {g.championship_label ? (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {g.championship_label}
                      {g.age_group_short ? ` · ${g.age_group_short}` : ""}
                    </span>
                  ) : null}
                  {g.already_imported ? (
                    <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Вече импортиран</span>
                  ) : null}
                  {g.has_placeholders ? (
                    <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>
                      Отборът още не е определен в БФВ
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="risImportActions">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Затвори
          </Button>
          <Button onClick={importSelected} disabled={importing || !selected.size || !status?.linked}>
            {importing ? "Импорт…" : `Импортирай (${selected.size})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
