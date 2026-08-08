import { useMemo, useState } from "react";

import { positionShort, shortPlayerName } from "../../utils/matchPositions";

export const MATCH_STAT_SIDE_LEFT = [
  { action: "kill", label: "Атака+", tone: "good", ctx: "always" },
  { action: "attack_error", label: "Атака−", tone: "bad", ctx: "always" },
  { action: "ace", label: "Ас", tone: "good", ctx: "serve" },
  { action: "error", label: "Гр.Серв", tone: "bad", ctx: "serve" },
  { action: "block", label: "Блок+", tone: "good", ctx: "always" },
  { action: "opp_error", label: "Гр.OPP", tone: "good", ctx: "always" },
  // Противникът забива / блок-аут / топка в нашето поле — точка за тях, без наш играч
  { action: "opp_point", label: "Точ.OPP", tone: "bad", ctx: "always" },
];

export const MATCH_STAT_SIDE_RIGHT = [
  { action: "dig", label: "Защита", tone: "neutral", ctx: "always" },
  { action: "pass_3", label: "#", tone: "good", ctx: "receive" },
  { action: "pass_2", label: "+", tone: "good", ctx: "receive" },
  { action: "pass_1", label: "−", tone: "neutral", ctx: "receive" },
  { action: "pass_error", label: "Гр.Пос", tone: "bad", ctx: "receive" },
];

export const MATCH_ACTION_LABEL = {
  kill: "Атака+",
  ace: "Ас",
  block: "Блок+",
  attack_error: "Атака−",
  error: "Грешка сервис",
  dig: "Защита",
  pass_1: "Пос. −",
  pass_2: "Пос. +",
  pass_3: "Пос. #",
  pass_error: "Грешка поср.",
  opp_point: "Точка за противника (атака / блок-аут)",
  our_point: "Точка НИЕ",
  opp_error: "Грешка на противника",
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

function SideCol({ items, side, disabled, phase, onStat, extraTop = null, requirePlayer = false }) {
  return (
    <div className={`matchLiveSideCol matchLiveSideCol--${side}`} role="group" aria-label={`Статистика ${side}`}>
      {extraTop}
      {items.map((it) => {
        const ctxOk = actionEnabledForPhase(it.ctx, phase);
        const needsPlayer =
          requirePlayer && !["opp_error", "ace", "error", "our_point", "opp_point"].includes(it.action);
        const isOff = disabled || !ctxOk || needsPlayer;
        return (
          <button
            key={it.action}
            type="button"
            className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--${it.tone}${
              it.label.length <= 2 ? " matchLiveStatBtn--sym" : ""
            }${ctxOk ? "" : " is-ctxOff"}`}
            disabled={isOff}
            onClick={() => onStat?.(it.action)}
            title={
              needsPlayer
                ? "Първо избери състезател от корта (червено)"
                : ctxOk
                  ? MATCH_ACTION_LABEL[it.action] || it.label
                  : `${MATCH_ACTION_LABEL[it.action] || it.label} (не за тази фаза)`
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function SubDrawer({
  open,
  onClose,
  selected,
  bench = [],
  liberoId = null,
  busy,
  onConfirm,
}) {
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
  bench = [],
  liberoId = null,
  busy = false,
  events = [],
  children,
}) {
  const [subOpen, setSubOpen] = useState(false);

  const leftItems = useMemo(() => MATCH_STAT_SIDE_LEFT, []);
  const rightItems = useMemo(() => MATCH_STAT_SIDE_RIGHT, []);

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
        items={leftItems}
        side="left"
        disabled={disabled}
        phase={phase}
        onStat={onStat}
        requirePlayer={!selected}
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
        items={rightItems}
        side="right"
        disabled={disabled}
        phase={phase}
        onStat={onStat}
        requirePlayer={!selected}
        extraTop={
          <>
            {subBtn}
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
    </div>
  );
}
