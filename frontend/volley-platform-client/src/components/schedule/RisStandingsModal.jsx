import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { Button, Modal } from "../ui";
import { useToast } from "../ToastProvider";

function teamName(team) {
  if (!team || typeof team !== "object") return "—";
  return (team.displayName || team.name || "—").trim() || "—";
}

function teamId(team) {
  if (!team || typeof team !== "object" || team.id == null) return null;
  const n = Number(team.id);
  return Number.isFinite(n) ? n : null;
}

function formatRatio(value) {
  if (value == null || value === "") return "—";
  return String(value);
}

export default function RisStandingsModal({ open, onClose, championshipId, titleHint = "" }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const [activeCompId, setActiveCompId] = useState("");
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = async () => {
    if (!championshipId) return;
    setLoading(true);
    try {
      const res = await axiosInstance.get(API_PATHS.RIS_CHAMPIONSHIP(championshipId), {
        params: { fresh: true },
      });
      setPayload(res.data || null);
      setFetchedAt(new Date());
      const comps = Array.isArray(res.data?.data?.competitions) ? res.data.data.competitions : [];
      if (comps.length) {
        setActiveCompId((prev) => {
          if (prev && comps.some((c) => String(c.id) === String(prev))) return prev;
          return String(comps[0].id);
        });
      } else {
        setActiveCompId("");
      }
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на класирането."));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !championshipId) return undefined;
    load();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when opened / id changes
  }, [open, championshipId]);

  const champ = payload?.data || null;
  const ourClubId = payload?.meta?.bvf_club_id != null ? Number(payload.meta.bvf_club_id) : null;
  const competitions = useMemo(
    () => (Array.isArray(champ?.competitions) ? champ.competitions : []),
    [champ],
  );
  const activeComp = competitions.find((c) => String(c.id) === String(activeCompId)) || competitions[0] || null;
  const standings = Array.isArray(activeComp?.standings) ? activeComp.standings : [];
  const bracket = activeComp?.bracket || null;
  const ageLabel = champ?.ageGroup?.name || champ?.ageGroup?.shortName || "";
  const title = champ?.label || champ?.name || titleHint || "Класиране БФВ";

  return (
    <Modal open={open} onClose={onClose} title="Класиране" size="wide">
      <div className="risImportBody">
        <p className="uiHint" style={{ margin: 0 }}>
          Актуални данни директно от БФВ (RIS)
          {fetchedAt
            ? ` · обновено ${fetchedAt.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
            : ""}
        </p>

        {loading && !champ ? <p className="uiHint">Зареждане…</p> : null}

        {champ ? (
          <>
            <div>
              <strong style={{ display: "block", fontSize: 15 }}>{title}</strong>
              {ageLabel ? <span className="uiHint">{ageLabel}</span> : null}
            </div>

            {competitions.length > 1 ? (
              <div className="coachMobileSubNav" style={{ marginBottom: 0 }}>
                {competitions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`coachMobileSubNavBtn${String(c.id) === String(activeComp?.id) ? " is-active" : ""}`}
                    onClick={() => setActiveCompId(String(c.id))}
                  >
                    {c.name || `Група ${c.id}`}
                  </button>
                ))}
              </div>
            ) : activeComp?.name ? (
              <p className="uiHint" style={{ margin: 0 }}>
                {activeComp.name}
              </p>
            ) : null}

            {standings.length ? (
              <div className="risStandingsTableWrap">
                <table className="risStandingsTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Отбор</th>
                      <th>М</th>
                      <th>П</th>
                      <th>З</th>
                      <th>С</th>
                      <th>Т</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, idx) => {
                      const tid = teamId(row.team);
                      const isUs = ourClubId != null && tid === ourClubId;
                      return (
                        <tr key={`${tid || idx}-${row.rank}`} className={isUs ? "is-our-club" : undefined}>
                          <td>{row.rank ?? idx + 1}</td>
                          <td>
                            {teamName(row.team)}
                            {isUs ? " · ние" : ""}
                          </td>
                          <td>{row.played ?? 0}</td>
                          <td>{row.won ?? 0}</td>
                          <td>{row.lost ?? 0}</td>
                          <td>
                            {row.setsWon ?? 0}:{row.setsLost ?? 0}
                            {row.setsRatio ? (
                              <span className="risStandingsRatio"> ({formatRatio(row.setsRatio)})</span>
                            ) : null}
                          </td>
                          <td>
                            <strong>{row.points ?? 0}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!standings.length && bracket ? (
              <p className="uiHint">Това е елиминационна фаза (bracket). Таблицацата ще се появи при групова фаза.</p>
            ) : null}

            {!standings.length && !bracket ? (
              <p className="uiHint">Няма класиране за тази група все още.</p>
            ) : null}
          </>
        ) : null}

        <div className="risImportActions">
          <Button variant="secondary" onClick={onClose}>
            Затвори
          </Button>
          <Button onClick={load} disabled={loading || !championshipId}>
            {loading ? "Обновяване…" : "Обнови сега"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
