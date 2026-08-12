import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import BvfCreateAthleteModal from "./BvfCreateAthleteModal";
import BvfLinkByEgnModal from "./BvfLinkByEgnModal";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import { Button, Card, EmptyState, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function readinessLabel(r) {
  switch (r) {
    case "ready_create":
      return "Готов за създаване";
    case "ready_create_need_photo":
      return "Липсва снимка";
    case "can_link":
      return "Може връзка по ЕГН";
    case "can_link_need_data":
      return "ЕГН има · липсват данни";
    case "need_data":
      return "Липсват данни";
    case "in_sek":
      return "Свързан със СЕК";
    default:
      return r || "—";
  }
}

const CHECKLIST_ITEMS = [
  "собствено име",
  "бащино име",
  "фамилия",
  "ЕГН",
  "дата на раждане",
  "град",
  "националност",
  "пол",
  "снимка",
];

function SekChecklist({ missing, inSek }) {
  if (inSek) {
    return (
      <p className="sekAthleteCardOk" style={{ margin: "8px 0 0" }}>
        Свързан със СЕК — не се търсят липсващи данни или документи за регистрация.
      </p>
    );
  }
  const miss = new Set(missing || []);
  return (
    <ul className="sekAthleteChecklist">
      {CHECKLIST_ITEMS.map((item) => {
        const ok = !miss.has(item);
        return (
          <li key={item} className={ok ? "is-ok" : "is-missing"}>
            <span aria-hidden>{ok ? "✓" : "○"}</span>
            <span>{item}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Списък състезатели с чеклист готовност за СЕК.
 * Използва се в Админ БФВ и в меню „Състезатели“ на главния треньор.
 */
export default function BvfClubAthletesSekCard({
  toast,
  permanent: permanentProp,
  coachFilter = "",
  searchQuery = null,
  athletesLookup = null,
  onPay,
  onTransfer,
  title = "Състезатели → СЕК",
  compact = false,
}) {
  const { permanent: hookPermanent } = useClubBvfLink({ enabled: permanentProp == null });
  const permanent = permanentProp != null ? Boolean(permanentProp) : hookPermanent;

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [subTab, setSubTab] = useState("missing"); // missing | in_sek | all
  const [q, setQ] = useState("");
  const [linkTarget, setLinkTarget] = useState(null);
  const [createTarget, setCreateTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_ATHLETES_SEK_BOARD);
      setBoard(res.data || null);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на състезателите."));
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const allRows = useMemo(() => {
    const missing = board?.missing_sek || [];
    const inSek = board?.in_sek || [];
    if (subTab === "in_sek") return inSek;
    if (subTab === "missing") return missing;
    return [...missing, ...inSek];
  }, [board, subTab]);

  const rows = useMemo(() => {
    let list = allRows;
    if (coachFilter) {
      list = list.filter((r) => String(r.coach_id) === String(coachFilter));
    }
    const needle = (searchQuery != null ? searchQuery : q).trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) => {
      const hay = `${r.athlete_name || ""} ${r.egn || ""} ${r.coach_name || ""} ${r.bvf_player_number || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [allRows, coachFilter, q, searchQuery]);

  const resolveAthlete = (row) => {
    if (!athletesLookup) return { id: row.athlete_id, athlete_name: row.athlete_name, coach_id: row.coach_id };
    return athletesLookup.get(Number(row.athlete_id)) || {
      id: row.athlete_id,
      athlete_name: row.athlete_name,
      coach_id: row.coach_id,
    };
  };

  const requestTask = async (athleteId) => {
    try {
      setBusyId(athleteId);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_REQUEST_SEK_TASK(athleteId), {});
      toast?.success(
        res.data?.coach_name
          ? `Съобщено на ${res.data.coach_name}: ${res.data.sek_task_detail || "липсва снимка/данни"}`
          : "Задачата е записана за груповия треньор.",
      );
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно изпращане към треньора."));
    } finally {
      setBusyId(null);
    }
  };

  const counts = board?.counts || {};

  return (
    <>
      <Card title={title}>
        {!compact ? (
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
            Чеклист за готовност към СЕК. Ако състезателят е свързан — не се търсят липсващи данни/документи за
            регистрация. Първо <strong>Свържи по ЕГН</strong>, иначе <strong>Създай в СЕК</strong> при пълни данни +
            снимка.
          </p>
        ) : null}

        {!permanent ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b45309" }}>
            За link/create е нужна постоянна връзка с БФВ (API ключ в Администрация БФВ).
          </p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <button
            type="button"
            className={`uiButton${subTab === "missing" ? "" : " uiButton--secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setSubTab("missing")}
          >
            Липсват в СЕК ({counts.missing_sek ?? 0})
          </button>
          <button
            type="button"
            className={`uiButton${subTab === "in_sek" ? "" : " uiButton--secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setSubTab("in_sek")}
          >
            В СЕК ({counts.in_sek ?? 0})
          </button>
          <button
            type="button"
            className={`uiButton${subTab === "all" ? "" : " uiButton--secondary"}`}
            style={{ fontSize: 13 }}
            onClick={() => setSubTab("all")}
          >
            Всички ({counts.total ?? 0})
          </button>
          <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={load}>
            {loading ? "Зареждане…" : "Обнови"}
          </Button>
          <span className="uiBadge">Готови: {counts.ready_create ?? 0}</span>
        </div>

        {searchQuery == null ? (
          <label style={{ display: "grid", gap: 4, maxWidth: 320, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Търсене</span>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="име / ЕГН / треньор" />
          </label>
        ) : null}

        {loading && !board ? (
          <p className="uiMuted">Зареждане…</p>
        ) : !rows.length ? (
          <EmptyState
            title={subTab === "in_sek" ? "Няма свързани в СЕК" : "Няма резултати"}
            description="Промени филтъра или търсенето."
          />
        ) : (
          <div className="sekAthleteCardGrid">
            {rows.map((r) => (
              <article
                key={r.athlete_id}
                className={`sekAthleteCard${r.in_sek ? " sekAthleteCard--linked" : ""}`}
              >
                <div className="sekAthleteCardHead">
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/coach/athletes/${r.athlete_id}?tab=bvf`} className="sekAthleteCardName">
                      {r.athlete_name}
                    </Link>
                    <div className="uiMuted" style={{ fontSize: 12 }}>
                      {r.coach_name || "—"}
                      {r.bvf_player_number ? ` · № ${r.bvf_player_number}` : ""}
                    </div>
                  </div>
                  <span
                    className={`uiBadge${
                      r.in_sek
                        ? " uiBadge--success"
                        : r.can_create
                          ? " uiBadge--success"
                          : r.readiness === "ready_create_need_photo"
                            ? " uiBadge--warning"
                            : ""
                    }`}
                  >
                    {readinessLabel(r.readiness)}
                  </span>
                </div>

                <SekChecklist missing={r.missing} inSek={r.in_sek} />

                {r.sek_task_code && !r.in_sek ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309" }}>
                    Задача към треньора: {r.sek_task_detail || r.sek_task_code}
                  </p>
                ) : null}

                <div className="sekAthleteCardActions">
                  {r.in_sek ? (
                    <Button as={Link} to={`/coach/athletes/${r.athlete_id}?tab=bvf`} size="sm" variant="secondary">
                      Профил / документи
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!r.can_link || !permanent || busyId === r.athlete_id}
                        onClick={() => setLinkTarget(r)}
                        title={!r.can_link ? "Нужен е ЕГН (10 цифри)" : undefined}
                      >
                        Свържи по ЕГН
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!r.can_create || !permanent || busyId === r.athlete_id}
                        onClick={() => setCreateTarget(r)}
                        title={!r.can_create ? "Нужни са пълни данни и локална снимка" : undefined}
                      >
                        Създай в СЕК
                      </Button>
                      {!r.can_create ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyId === r.athlete_id}
                          onClick={() => requestTask(r.athlete_id)}
                        >
                          {busyId === r.athlete_id ? "…" : "Съобщи на треньора"}
                        </Button>
                      ) : null}
                    </>
                  )}
                  {onPay ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => onPay(resolveAthlete(r))}>
                      Плати
                    </Button>
                  ) : null}
                  {onTransfer ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => onTransfer(resolveAthlete(r))}>
                      Прехвърли
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <BvfLinkByEgnModal
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        athleteId={linkTarget?.athlete_id}
        athleteName={linkTarget?.athlete_name}
        initialEgn={linkTarget?.egn || ""}
        toast={toast}
        onLinked={() => {
          setLinkTarget(null);
          load();
        }}
      />

      <BvfCreateAthleteModal
        open={Boolean(createTarget)}
        onClose={() => setCreateTarget(null)}
        athleteId={createTarget?.athlete_id}
        athleteName={createTarget?.athlete_name}
        initialEgn={createTarget?.egn || ""}
        missing={createTarget?.missing || []}
        hasPhoto={
          createTarget?.readiness === "ready_create" ||
          Boolean(createTarget?.has_photo) ||
          !(createTarget?.missing || []).some((m) => String(m).toLowerCase().includes("снимка"))
        }
        toast={toast}
        onCreated={() => {
          setCreateTarget(null);
          load();
        }}
      />
    </>
  );
}
