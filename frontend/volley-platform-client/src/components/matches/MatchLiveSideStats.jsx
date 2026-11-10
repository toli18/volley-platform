import { useMemo, useState } from "react";

import { positionShort, shortPlayerName } from "../../utils/matchPositions";

/**
 * Категория → опции (# / + / − / гр.).
 * action без options = директен бутон (едно натискане).
 */
export const MATCH_STAT_GROUPS_LEFT = [
  {
    id: "attack",
    label: "Атака",
    ctx: "always",
    requirePlayer: true,
    options: [
      { action: "kill", label: "#", tone: "good" },
      { action: "attack_zero", label: "0", tone: "neutral" },
      { action: "attack_error", label: "−", tone: "bad" },
    ],
  },
  {
    id: "serve",
    label: "Сервис",
    ctx: "serve",
    requirePlayer: false,
    options: [
      { action: "ace", label: "#", tone: "good" },
      { action: "serve_in", label: "0", tone: "neutral" },
      { action: "error", label: "Гр", tone: "bad" },
    ],
  },
  {
    id: "block",
    label: "Блок",
    ctx: "always",
    requirePlayer: true,
    options: [
      { action: "block", label: "#", tone: "good" },
      { action: "block_touch", label: "0", tone: "neutral" },
      { action: "block_error", label: "−", tone: "bad" },
    ],
  },
  {
    id: "opp_attack",
    label: "Ат.OPP",
    ctx: "always",
    requirePlayer: false,
    action: "opp_point",
    tone: "bad",
  },
  {
    id: "opp_error",
    label: "Гр.OPP",
    ctx: "always",
    requirePlayer: false,
    action: "opp_error",
    tone: "good",
  },
  {
    id: "indiv_error",
    label: "Гр.Инд",
    ctx: "always",
    requirePlayer: true,
    action: "indiv_error",
    tone: "bad",
  },
];

export const MATCH_STAT_GROUPS_RIGHT = [
  {
    id: "pass",
    label: "Поср.",
    ctx: "receive",
    requirePlayer: true,
    options: [
      { action: "pass_3", label: "#", tone: "good" },
      { action: "pass_2", label: "+", tone: "good" },
      { action: "pass_1", label: "−", tone: "neutral" },
      { action: "pass_error", label: "Гр", tone: "bad" },
    ],
  },
  {
    id: "set",
    label: "Вдиг.",
    ctx: "always",
    requirePlayer: true,
    options: [
      { action: "set_hash", label: "#", tone: "good" },
      { action: "set_plus", label: "+", tone: "good" },
      { action: "set_minus", label: "−", tone: "neutral" },
      { action: "set_error", label: "Гр", tone: "bad" },
    ],
  },
  {
    id: "dig",
    label: "Защита",
    ctx: "always",
    requirePlayer: true,
    options: [
      { action: "dig_plus", label: "+", tone: "good" },
      { action: "dig_zero", label: "0", tone: "neutral" },
      { action: "dig_minus", label: "−", tone: "neutral" },
    ],
  },
  {
    id: "free_ball",
    label: "Free",
    ctx: "always",
    requirePlayer: true,
    action: "free_ball",
    tone: "neutral",
  },
];

/** Плосък списък за video coding / обратна съвместимост. */
function flattenGroups(groups) {
  const out = [];
  for (const g of groups) {
    if (g.options?.length) {
      for (const opt of g.options) {
        out.push({ action: opt.action, label: `${g.label} ${opt.label}`, tone: opt.tone, ctx: g.ctx });
      }
    } else if (g.action) {
      out.push({ action: g.action, label: g.label, tone: g.tone || "neutral", ctx: g.ctx });
    }
  }
  return out;
}

export const MATCH_STAT_SIDE_LEFT = flattenGroups(MATCH_STAT_GROUPS_LEFT);
export const MATCH_STAT_SIDE_RIGHT = flattenGroups(MATCH_STAT_GROUPS_RIGHT);

export const MATCH_ACTION_LABEL = {
  kill: "Атака #",
  attack_zero: "Атака 0",
  attack_error: "Атака −",
  ace: "Ас #",
  serve_in: "Сервис 0",
  error: "Грешка сервис",
  block: "Блок #",
  block_touch: "Блок touch / 0",
  block_error: "Блок −",
  dig: "Защита",
  dig_plus: "Защита +",
  dig_zero: "Защита 0",
  dig_minus: "Защита −",
  set_hash: "Вдигане #",
  set_plus: "Вдигане +",
  set_minus: "Вдигане −",
  set_error: "Грешка вдигане",
  pass_1: "Пос. −",
  pass_2: "Пос. +",
  pass_3: "Пос. #",
  pass_error: "Грешка поср.",
  free_ball: "Free ball",
  opp_point: "Атака / точка на противника",
  our_point: "Точка НИЕ",
  opp_error: "Грешка на противника",
  team_error: "Отборна грешка",
  indiv_error: "Индивидуална грешка (мрежа, улавяне, двойно, линия…)",
  substitution: "Смяна",
};

/** Действия, които местят резултат / сервис / ротация (side-out). */
export const SCORE_ACTIONS = new Set([
  "kill",
  "ace",
  "block",
  "our_point",
  "opp_error",
  "attack_error",
  "error",
  "pass_error",
  "opp_point",
  "team_error",
  "indiv_error",
  "block_error",
  "set_error",
]);

/** Посрещане #/+/- и защита — само статистика, без точка и без ротация. */
export function actionAffectsScore(action) {
  return SCORE_ACTIONS.has(action);
}

/** Кои бутони са активни според фазата (сервис / посрещане). */
export function actionEnabledForPhase(ctx, phase) {
  if (!ctx || ctx === "always") return true;
  if (phase === "base") return true;
  if (ctx === "serve") return phase === "serve";
  if (ctx === "receive") return phase === "receive";
  return true;
}

const NO_PLAYER_ACTIONS = new Set([
  "opp_error",
  "opp_point",
  "ace",
  "serve_in",
  "error",
  "our_point",
]);

function SideCol({
  groups,
  side,
  disabled,
  phase,
  onStat,
  extraTop = null,
  requirePlayer = false,
  openGroupId,
  onToggleGroup,
}) {
  return (
    <div className={`matchLiveSideCol matchLiveSideCol--${side}`} role="group" aria-label={`Статистика ${side}`}>
      {extraTop}
      {groups.map((g) => {
        const ctxOk = actionEnabledForPhase(g.ctx, phase);
        const groupNeedsPlayer = Boolean(g.requirePlayer) && requirePlayer;
        const isOpen = openGroupId === g.id;
        const hasOptions = Array.isArray(g.options) && g.options.length > 0;

        if (!hasOptions) {
          const action = g.action;
          const needsPlayer = requirePlayer && !NO_PLAYER_ACTIONS.has(action);
          const isOff = disabled || !ctxOk || needsPlayer;
          return (
            <button
              key={g.id}
              type="button"
              className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--${g.tone || "neutral"}${
                ctxOk ? "" : " is-ctxOff"
              }`}
              disabled={isOff}
              onClick={() => onStat?.(action)}
              title={
                needsPlayer
                  ? "Първо избери състезател от корта"
                  : ctxOk
                    ? MATCH_ACTION_LABEL[action] || g.label
                    : `${MATCH_ACTION_LABEL[action] || g.label} (не за тази фаза)`
              }
            >
              {g.label}
            </button>
          );
        }

        const isOff = disabled || !ctxOk || groupNeedsPlayer;
        return (
          <div key={g.id} className={`matchLiveStatGroup${isOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--group${ctxOk ? "" : " is-ctxOff"}${
                isOpen ? " is-open" : ""
              }`}
              disabled={isOff}
              onClick={() => onToggleGroup?.(isOpen ? null : g.id)}
              title={
                groupNeedsPlayer
                  ? "Първо избери състезател от корта"
                  : ctxOk
                    ? g.label
                    : `${g.label} (не за тази фаза)`
              }
            >
              {g.label}
            </button>
            {isOpen ? (
              <div className="matchLiveStatOptions" role="group" aria-label={`${g.label} опции`}>
                {g.options.map((opt) => (
                  <button
                    key={opt.action}
                    type="button"
                    className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--${opt.tone} matchLiveStatBtn--sym`}
                    disabled={disabled}
                    onClick={() => {
                      onToggleGroup?.(null);
                      onStat?.(opt.action);
                    }}
                    title={MATCH_ACTION_LABEL[opt.action] || opt.label}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function findCourtRole(court = [], ...roles) {
  const want = new Set(roles.map((r) => String(r).toUpperCase()));
  return (court || []).find((p) => want.has(String(p?.role || "").toUpperCase())) || null;
}

function DoubleSubDrawer({ open, onClose, court = [], bench = [], busy, onConfirm }) {
  const [setterInId, setSetterInId] = useState("");
  const [oppositeInId, setOppositeInId] = useState("");

  const starterSetter = findCourtRole(court, "A");
  const starterOpposite = findCourtRole(court, "O");

  const setterBench = useMemo(() => {
    const rows = [...(bench || [])];
    rows.sort((a, b) => {
      const aS = String(a.position || "").toUpperCase() === "S" ? 0 : 1;
      const bS = String(b.position || "").toUpperCase() === "S" ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return (a.jersey_number || 0) - (b.jersey_number || 0);
    });
    return rows;
  }, [bench]);

  const oppositeBench = useMemo(() => {
    const rows = [...(bench || [])];
    rows.sort((a, b) => {
      const aO = String(a.position || "").toUpperCase() === "OPP" ? 0 : 1;
      const bO = String(b.position || "").toUpperCase() === "OPP" ? 0 : 1;
      if (aO !== bO) return aO - bO;
      return (a.jersey_number || 0) - (b.jersey_number || 0);
    });
    return rows;
  }, [bench]);

  if (!open) return null;

  const canConfirm =
    starterSetter &&
    starterOpposite &&
    setterInId &&
    oppositeInId &&
    Number(setterInId) !== Number(oppositeInId);

  return (
    <div className="matchLiveSubOverlay" role="dialog" aria-modal="true" aria-label="Двойна смяна">
      <button type="button" className="matchLiveSubBackdrop" aria-label="Затвори" onClick={onClose} />
      <div className="matchLiveSubDrawer">
        <div className="matchLiveSubHead">
          <strong>Двойна смяна</strong>
          <button type="button" className="matchLiveStatsClose" onClick={onClose}>
            ✕
          </button>
        </div>
        {starterSetter && starterOpposite ? (
          <p className="matchLiveSubHint">
            Двойна смяна: смяна на{" "}
            <strong>
              #{starterSetter.jersey_number} {shortPlayerName(starterSetter.athlete_name)} (Р)
            </strong>{" "}
            и{" "}
            <strong>
              #{starterOpposite.jersey_number} {shortPlayerName(starterOpposite.athlete_name)} (Д)
            </strong>
            . Новият Р влиза на мястото на Д, новият Д на мястото на Р.
          </p>
        ) : (
          <p className="matchLiveSubEmpty">На корта няма ясни Р и Д (схема 5-1).</p>
        )}

        <div className="matchLiveSubSection">
          <label className="matchLiveSubLabel" htmlFor="double-sub-setter">
            Нов разпределител (резерва)
          </label>
          <select
            id="double-sub-setter"
            className="matchLiveDoubleSelect"
            value={setterInId}
            disabled={busy || !starterSetter}
            onChange={(e) => setSetterInId(e.target.value)}
          >
            <option value="">Избери…</option>
            {setterBench.map((p) => (
              <option key={`ds-s-${p.athlete_id}`} value={p.athlete_id}>
                #{p.jersey_number} {shortPlayerName(p.athlete_name)} · {positionShort(p.position)}
              </option>
            ))}
          </select>
        </div>

        <div className="matchLiveSubSection">
          <label className="matchLiveSubLabel" htmlFor="double-sub-opp">
            Нов диагонал (резерва)
          </label>
          <select
            id="double-sub-opp"
            className="matchLiveDoubleSelect"
            value={oppositeInId}
            disabled={busy || !starterOpposite}
            onChange={(e) => setOppositeInId(e.target.value)}
          >
            <option value="">Избери…</option>
            {oppositeBench.map((p) => (
              <option key={`ds-o-${p.athlete_id}`} value={p.athlete_id}>
                #{p.jersey_number} {shortPlayerName(p.athlete_name)} · {positionShort(p.position)}
              </option>
            ))}
          </select>
        </div>

        <div className="matchLiveSubActions">
          <button type="button" className="matchLiveUndo" disabled={busy} onClick={onClose}>
            Отказ
          </button>
          <button
            type="button"
            className="matchLiveNext"
            disabled={busy || !canConfirm}
            onClick={() => onConfirm?.(Number(setterInId), Number(oppositeInId))}
          >
            Потвърди двойна смяна
          </button>
        </div>
      </div>
    </div>
  );
}

function SubDrawer({ open, onClose, selected, bench = [], liberoId = null, busy, onConfirm }) {
  const [inId, setInId] = useState(null);

  const selectedIsLibero =
    Boolean(selected) &&
    (String(selected.position || "").toUpperCase() === "L" ||
      String(selected.role || "").toUpperCase() === "L" ||
      (liberoId && Number(selected.athlete_id) === Number(liberoId)));
  const outId = selected && !selectedIsLibero ? Number(selected.athlete_id) : null;

  if (!open) return null;

  return (
    <div className="matchLiveSubOverlay" role="dialog" aria-modal="true" aria-label="Смяна">
      <button type="button" className="matchLiveSubBackdrop" aria-label="Затвори" onClick={onClose} />
      <div className="matchLiveSubDrawer">
        <div className="matchLiveSubHead">
          <strong>Смяна</strong>
          <button type="button" className="matchLiveStatsClose" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="matchLiveSubHint">
          Само полеви играч ↔ резерва. Либеро ↔ център е автоматично и не се брои за смяна.
        </p>

        <div className="matchLiveSubSection">
          <div className="matchLiveSubLabel">Излиза</div>
          {outId ? (
            <div className="matchLiveSubChip is-active" aria-current="true">
              #{selected.jersey_number} {shortPlayerName(selected.athlete_name)} ·{" "}
              {positionShort(selected.position)}
            </div>
          ) : selectedIsLibero ? (
            <p className="matchLiveSubEmpty">
              Избран е либерото — затвори и избери полеви играч от корта (не либеро).
            </p>
          ) : (
            <p className="matchLiveSubEmpty">Първо избери полеви състезател от корта.</p>
          )}
        </div>

        <div className="matchLiveSubSection">
          <div className="matchLiveSubLabel">Влиза (резерва)</div>
          {bench.length === 0 ? (
            <p className="matchLiveSubEmpty">Няма свободни от резервата.</p>
          ) : (
            bench.map((p) => (
              <button
                key={`in-${p.athlete_id}`}
                type="button"
                className={`matchLiveSubChip${Number(inId) === Number(p.athlete_id) ? " is-active" : ""}`}
                disabled={busy || !outId}
                onClick={() => setInId(p.athlete_id)}
              >
                #{p.jersey_number} {shortPlayerName(p.athlete_name)} · {positionShort(p.position)}
              </button>
            ))
          )}
        </div>

        <div className="matchLiveSubActions">
          <button type="button" className="matchLiveUndo" disabled={busy} onClick={onClose}>
            Отказ
          </button>
          <button
            type="button"
            className="matchLiveNext"
            disabled={busy || !outId || !inId}
            onClick={() => onConfirm?.(Number(outId), Number(inId))}
          >
            Потвърди смяна
          </button>
        </div>
      </div>
    </div>
  );
}

/** Корт в центъра, бутони за статистика отляво и отдясно (горе → долу). */
export default function MatchLiveSideStats({
  selected = null,
  disabled = false,
  phase = "base",
  onStat,
  onOpenStats = null,
  onSub = null,
  onDoubleSub = null,
  onCloseDoubleSub = null,
  doubleSub = null,
  court = [],
  bench = [],
  liberoId = null,
  busy = false,
  events = [],
  children,
}) {
  const [subOpen, setSubOpen] = useState(false);
  const [doubleOpen, setDoubleOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState(null);

  const leftGroups = useMemo(() => MATCH_STAT_GROUPS_LEFT, []);
  const rightGroups = useMemo(() => MATCH_STAT_GROUPS_RIGHT, []);
  const doubleActive = Boolean(doubleSub?.active);

  const subBtn = onSub ? (
    <button
      type="button"
      className="matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--sub"
      disabled={disabled}
      onClick={() => setSubOpen(true)}
      title="Смяна полеви ↔ резерва (не либеро)"
    >
      Смяна
    </button>
  ) : null;

  const doubleSubBtn =
    onDoubleSub || onCloseDoubleSub ? (
      <button
        type="button"
        className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--doubleSub${doubleActive ? " is-active" : ""}`}
        disabled={disabled || busy || (doubleActive ? !onCloseDoubleSub : !onDoubleSub)}
        onClick={() => {
          if (doubleActive) {
            onCloseDoubleSub?.();
            return;
          }
          setDoubleOpen(true);
        }}
        title={
          doubleActive
            ? "Връща титулярните Р и Д на местата на заместниците"
            : "Двойна смяна Р ↔ Д (5-1)"
        }
      >
        {doubleActive ? "Затвори дв." : "Дв.смяна"}
      </button>
    ) : null;

  const statsBtn = onOpenStats ? (
    <button
      type="button"
      className="matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--stats"
      onClick={onOpenStats}
      title="Статистика на мача"
    >
      Стат.
    </button>
  ) : null;

  return (
    <div className="matchLiveCourtRow">
      <SideCol
        groups={leftGroups}
        side="left"
        disabled={disabled}
        phase={phase}
        onStat={onStat}
        requirePlayer={!selected}
        openGroupId={openGroupId}
        onToggleGroup={setOpenGroupId}
      />
      <div className="matchLiveCourtMain">
        <div className={`matchLiveSelected matchLiveSideSelected${selected ? " is-picked" : ""}`}>
          {selected ? (
            <>
              <span className="matchLiveSelectedMark">Избран</span>
              <span className="matchLiveSelectedJersey">#{selected.jersey_number}</span>
              <span>{shortPlayerName(selected.athlete_name)}</span>
              {selected.role || selected.position ? (
                <span className="matchLiveSelectedRole">
                  {positionShort(selected.position || selected.role)}
                  {selected.zone != null ? ` · з.${selected.zone}` : ""}
                </span>
              ) : null}
            </>
          ) : (
            <span>{disabled ? "Въвеждането е спряно" : "Избери състезател от корта"}</span>
          )}
        </div>
        {children}
        <div className="matchLiveEvents matchLiveEvents--compact matchLiveSideEvents">
          {(events || []).slice(0, 4).map((ev) => {
            const isSub = ev.action === "substitution";
            const nameBit = isSub
              ? `${shortPlayerName(ev.athlete_name) || "—"} → ${shortPlayerName(ev.related_athlete_name) || "—"}`
              : ev.athlete_name
                ? shortPlayerName(ev.athlete_name)
                : "—";
            return (
              <div key={ev.id} className="matchLiveEventRow">
                <span>R{ev.rotation}</span>
                <span>{nameBit}</span>
                <span>{MATCH_ACTION_LABEL[ev.action] || ev.action}</span>
                <span>
                  {ev.our_score}:{ev.opp_score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <SideCol
        groups={rightGroups}
        side="right"
        disabled={disabled}
        phase={phase}
        onStat={onStat}
        requirePlayer={!selected}
        openGroupId={openGroupId}
        onToggleGroup={setOpenGroupId}
        extraTop={
          <>
            {subBtn}
            {doubleSubBtn}
            {statsBtn}
          </>
        }
      />
      {onSub ? (
        <SubDrawer
          key={subOpen ? "open" : "closed"}
          open={subOpen}
          onClose={() => setSubOpen(false)}
          selected={selected}
          bench={bench}
          liberoId={liberoId}
          busy={busy}
          onConfirm={(outId, inId) => {
            setSubOpen(false);
            onSub(outId, inId);
          }}
        />
      ) : null}
      {onDoubleSub ? (
        <DoubleSubDrawer
          key={doubleOpen ? "open" : "closed"}
          open={doubleOpen}
          onClose={() => setDoubleOpen(false)}
          court={court}
          bench={bench}
          busy={busy}
          onConfirm={(setterInId, oppositeInId) => {
            setDoubleOpen(false);
            onDoubleSub(setterInId, oppositeInId);
          }}
        />
      ) : null}
    </div>
  );
}
