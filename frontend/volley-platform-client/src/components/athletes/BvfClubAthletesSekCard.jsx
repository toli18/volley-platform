import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import BvfCreateAthleteModal from "./BvfCreateAthleteModal";
import BvfLinkByEgnModal from "./BvfLinkByEgnModal";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import {
  Button,
  Card,
  EmptyState,
  Input,
  OverflowActionSheet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

const PAGE_SIZE = 25;

const DATA_INDICATORS = [
  {
    key: "name",
    short: "Име",
    title: "Име (собствено / бащино / фамилия)",
    missingAny: ["собствено име", "бащино име", "фамилия"],
  },
  { key: "egn", short: "ЕГН", title: "ЕГН", missingAny: ["ЕГН"] },
  { key: "dob", short: "ДР", title: "Дата на раждане", missingAny: ["дата на раждане"] },
  { key: "city", short: "Град", title: "Град", missingAny: ["град"] },
  { key: "sex", short: "Пол", title: "Пол", missingAny: ["пол"] },
];

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

function form03Label(seasonYear) {
  const y = seasonYear != null ? Number(seasonYear) : null;
  if (y && !Number.isNaN(y)) {
    return `Заявление Форма 03 · сезон ${y}/${y + 1}`;
  }
  return "Заявление Форма 03";
}

function form03Short(seasonYear) {
  const y = seasonYear != null ? Number(seasonYear) : null;
  if (y && !Number.isNaN(y)) return `${y}/${y + 1}`;
  return "Форма 03";
}

function missingSet(row) {
  return new Set(row?.missing || []);
}

function hasPhoto(row) {
  if (row?.in_sek) return true;
  if (row?.has_photo === true) return true;
  if (row?.readiness === "ready_create") return true;
  return !(row?.missing || []).some((m) => String(m).toLowerCase().includes("снимка"));
}

function hasMissingData(row) {
  if (row?.in_sek) return false;
  const miss = missingSet(row);
  return DATA_INDICATORS.some((ind) => ind.missingAny.some((m) => miss.has(m)));
}

function Form03Row({ hasForm03, seasonYear }) {
  const ok = Boolean(hasForm03);
  return (
    <li className={ok ? "is-ok" : "is-missing"}>
      <span aria-hidden>{ok ? "✓" : "—"}</span>
      <span>{form03Label(seasonYear)}</span>
    </li>
  );
}

function SekChecklist({ missing, inSek, hasForm03, seasonYear }) {
  if (inSek) {
    return (
      <>
        <ul className="sekAthleteChecklist" style={{ marginTop: 8 }}>
          <Form03Row hasForm03={hasForm03} seasonYear={seasonYear} />
        </ul>
        <p className="sekAthleteCardOk" style={{ margin: "8px 0 0", fontSize: 12 }}>
          Свързан със СЕК - не се търсят липсващи данни или документи за регистрация.
        </p>
      </>
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
      <Form03Row hasForm03={hasForm03} seasonYear={seasonYear} />
    </ul>
  );
}

function DataIndicators({ row }) {
  if (row.in_sek) {
    return <span className="sekMatrixMuted">В СЕК</span>;
  }
  const miss = missingSet(row);
  return (
    <div className="sekMatrixIndicators" role="list">
      {DATA_INDICATORS.map((ind) => {
        const ok = !ind.missingAny.some((m) => miss.has(m));
        return (
          <span
            key={ind.key}
            role="listitem"
            className={`sekMatrixInd${ok ? " is-ok" : " is-bad"}`}
            title={ok ? `${ind.title}: попълнено` : `${ind.title}: липсва`}
          >
            <span className="sekMatrixIndMark" aria-hidden>
              {ok ? "✓" : "✗"}
            </span>
            <span className="sekMatrixIndLabel">{ind.short}</span>
          </span>
        );
      })}
    </div>
  );
}

function PhotoBadge({ row }) {
  if (row.in_sek) {
    return <span className="sekMatrixPhoto is-ok">✓ Има</span>;
  }
  const ok = hasPhoto(row);
  return ok ? (
    <span className="sekMatrixPhoto is-ok">✓ Има</span>
  ) : (
    <span className="sekMatrixPhoto is-missing" title="Липсва локална снимка">
      ✗ Липсва
    </span>
  );
}

function Form03Badge({ row, seasonYear }) {
  const ok = Boolean(row.has_form_03);
  const label = form03Short(row.season_year ?? seasonYear);
  return (
    <span
      className={`sekMatrixForm03${ok ? " is-ok" : " is-missing"}`}
      title={form03Label(row.season_year ?? seasonYear)}
    >
      {ok ? `✓ ${label}` : `✗ ${label}`}
    </span>
  );
}

function primaryAction(row) {
  if (row.in_sek) {
    return { kind: "profile", label: "Профил / документи" };
  }
  if (row.can_link) {
    return { kind: "link", label: "Свържи по ЕГН" };
  }
  if (row.can_create) {
    return { kind: "create", label: "Създай в СЕК" };
  }
  return { kind: "create", label: "Създай в СЕК", disabled: true };
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
  const [subTab, setSubTab] = useState("missing"); // missing | in_sek | all | ready | no_photo | need_data
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [page, setPage] = useState(1);
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
    if (subTab === "ready") return missing.filter((r) => r.readiness === "ready_create" || r.can_create);
    if (subTab === "no_photo") return missing.filter((r) => !hasPhoto(r));
    if (subTab === "need_data") return missing.filter((r) => hasMissingData(r));
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

  useEffect(() => {
    setPage(1);
  }, [subTab, coachFilter, q, searchQuery, board?.counts?.total]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pagedRows = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, pageSafe]);

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
  const seasonYear = board?.season_year ?? null;
  const missingPool = board?.missing_sek || [];
  const readyCount =
    counts.ready_create ?? missingPool.filter((r) => r.readiness === "ready_create" || r.can_create).length;
  const noPhotoCount = missingPool.filter((r) => !hasPhoto(r)).length;
  const needDataCount = missingPool.filter((r) => hasMissingData(r)).length;

  const filterChip = (id, label, active) => (
    <button
      key={id}
      type="button"
      className={`sekFilterChip${active ? " is-active" : ""}`}
      onClick={() => setSubTab(id)}
    >
      {label}
    </button>
  );

  const renderPrimary = (r) => {
    const primary = primaryAction(r);
    if (primary.kind === "profile") {
      return (
        <Button as={Link} to={`/coach/athletes/${r.athlete_id}?tab=bvf`} size="sm" variant="secondary">
          {primary.label}
        </Button>
      );
    }
    if (primary.kind === "link") {
      return (
        <Button
          type="button"
          size="sm"
          disabled={!r.can_link || !permanent || busyId === r.athlete_id}
          onClick={() => setLinkTarget(r)}
          title={!r.can_link ? "Нужен е ЕГН (10 цифри)" : undefined}
        >
          {primary.label}
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        disabled={primary.disabled || !r.can_create || !permanent || busyId === r.athlete_id}
        onClick={() => setCreateTarget(r)}
        title={!r.can_create ? "Нужни са пълни данни и локална снимка" : undefined}
      >
        {primary.label}
      </Button>
    );
  };

  const overflowActionsFor = (r) => {
    const primary = primaryAction(r);
    const actions = [];
    if (!r.in_sek) {
      if (primary.kind !== "link" && r.can_link) {
        actions.push({
          key: "link",
          label: "Свържи по ЕГН",
          disabled: !permanent || busyId === r.athlete_id,
          onClick: () => setLinkTarget(r),
        });
      }
      if (primary.kind !== "create" && r.can_create) {
        actions.push({
          key: "create",
          label: "Създай в СЕК",
          disabled: !permanent || busyId === r.athlete_id,
          onClick: () => setCreateTarget(r),
        });
      }
      if (!r.can_create) {
        actions.push({
          key: "notify",
          label: busyId === r.athlete_id ? "Изпращане…" : "Съобщи на треньора",
          disabled: busyId === r.athlete_id,
          onClick: () => requestTask(r.athlete_id),
        });
      }
    }
    if (onPay) {
      actions.push({
        key: "pay",
        label: "Плати",
        onClick: () => onPay(resolveAthlete(r)),
      });
    }
    if (onTransfer) {
      actions.push({
        key: "transfer",
        label: "Прехвърли",
        onClick: () => onTransfer(resolveAthlete(r)),
      });
    }
    return actions;
  };

  const renderCard = (r) => (
    <article key={r.athlete_id} className={`sekAthleteCard${r.in_sek ? " sekAthleteCard--linked" : ""}`}>
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

      <SekChecklist
        missing={r.missing}
        inSek={r.in_sek}
        hasForm03={r.has_form_03}
        seasonYear={r.season_year ?? seasonYear}
      />

      {r.sek_task_code && !r.in_sek ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309" }}>
          Задача към треньора: {r.sek_task_detail || r.sek_task_code}
        </p>
      ) : null}

      <div className="sekAthleteCardActions">
        {renderPrimary(r)}
        <OverflowActionSheet label="Още действия" actions={overflowActionsFor(r)} />
      </div>
    </article>
  );

  const renderTable = () => (
    <div className="sekMatrixScroll">
      <Table className="sekMatrixTable">
        <TableHeader>
          <TableRow>
            <TableHead>Състезател</TableHead>
            <TableHead>Данни</TableHead>
            <TableHead>Снимка</TableHead>
            <TableHead>Форма 03</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((r) => (
            <TableRow key={r.athlete_id} className={r.in_sek ? "sekMatrixRow--linked" : undefined}>
              <TableCell>
                <div className="sekMatrixAthlete">
                  <Link to={`/coach/athletes/${r.athlete_id}?tab=bvf`} className="sekAthleteCardName">
                    {r.athlete_name}
                  </Link>
                  <div className="sekMatrixSub">
                    {r.coach_name || "—"}
                    {r.bvf_player_number ? ` · № ${r.bvf_player_number}` : ""}
                  </div>
                  {r.sek_task_code && !r.in_sek ? (
                    <div className="sekMatrixTaskHint">{r.sek_task_detail || r.sek_task_code}</div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <DataIndicators row={r} />
              </TableCell>
              <TableCell>
                <PhotoBadge row={r} />
              </TableCell>
              <TableCell>
                <Form03Badge row={r} seasonYear={seasonYear} />
              </TableCell>
              <TableCell>
                <div className="sekMatrixActions">
                  {renderPrimary(r)}
                  <OverflowActionSheet label="Още действия" actions={overflowActionsFor(r)} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      <Card title={title}>
        {!compact ? (
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
            Чеклист за готовност към СЕК. Първо <strong>Свържи по ЕГН</strong>, иначе{" "}
            <strong>Създай в СЕК</strong> при пълни данни + снимка. Форма 03 е за текущия сезон.
          </p>
        ) : null}

        {!permanent ? (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b45309" }}>
            За link/create е нужна постоянна връзка с БФВ (API ключ в Администрация БФВ).
          </p>
        ) : null}

        <div className="sekBoardToolbar">
          <div className="sekFilterChips">
            {filterChip("missing", `Липсват в СЕК (${counts.missing_sek ?? 0})`, subTab === "missing")}
            {filterChip("in_sek", `В СЕК (${counts.in_sek ?? 0})`, subTab === "in_sek")}
            {filterChip("all", `Всички (${counts.total ?? 0})`, subTab === "all")}
            {filterChip("ready", `Готови: ${readyCount}`, subTab === "ready")}
            {filterChip("no_photo", `Без снимка (${noPhotoCount})`, subTab === "no_photo")}
            {filterChip("need_data", `Липсващи данни (${needDataCount})`, subTab === "need_data")}
            <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={load}>
              {loading ? "Зареждане…" : "Обнови"}
            </Button>
          </div>

          <div className="sekViewToggle" role="group" aria-label="Изглед">
            <button
              type="button"
              className={`sekViewBtn${viewMode === "table" ? " is-active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Таблица
            </button>
            <button
              type="button"
              className={`sekViewBtn${viewMode === "cards" ? " is-active" : ""}`}
              onClick={() => setViewMode("cards")}
            >
              Карти
            </button>
          </div>
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
          <>
            {viewMode === "table" ? (
              renderTable()
            ) : (
              <div className="sekAthleteCardGrid">{pagedRows.map((r) => renderCard(r))}</div>
            )}

            <div className="sekPager">
              <span>
                {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, rows.length)} от {rows.length}
              </span>
              <div className="sekPagerBtns">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Назад
                </Button>
                <span className="sekPagerPage">
                  {pageSafe}/{pageCount}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pageSafe >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Напред
                </Button>
              </div>
            </div>
          </>
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
