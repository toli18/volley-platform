import { shortPlayerName } from "../../utils/matchPositions";

export const MATCH_STAT_SIDE_LEFT = [
  { action: "kill", label: "Атака+", tone: "good" },
  { action: "attack_error", label: "Атака−", tone: "bad" },
  { action: "ace", label: "Ас", tone: "good" },
  { action: "error", label: "Гр.Серв", tone: "bad" },
  { action: "block", label: "Блок+", tone: "good" },
  { action: "opp_error", label: "Гр.OPP", tone: "good" },
];

export const MATCH_STAT_SIDE_RIGHT = [
  { action: "dig", label: "Защита", tone: "neutral" },
  { action: "pass_3", label: "#", tone: "good" },
  { action: "pass_2", label: "+", tone: "good" },
  { action: "pass_1", label: "−", tone: "neutral" },
  { action: "pass_error", label: "Гр.Пос", tone: "bad" },
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
  opp_point: "Точка OPP",
  our_point: "Точка НИЕ",
  opp_error: "Грешка на противника",
};

function SideCol({ items, side, disabled, onStat, extraTop = null }) {
  return (
    <div className={`matchLiveSideCol matchLiveSideCol--${side}`} role="group" aria-label={`Статистика ${side}`}>
      {extraTop}
      {items.map((it) => (
        <button
          key={it.action}
          type="button"
          className={`matchLiveStatBtn matchLiveSideBtn matchLiveStatBtn--${it.tone}${
            it.label.length <= 2 ? " matchLiveStatBtn--sym" : ""
          }`}
          disabled={disabled}
          onClick={() => onStat?.(it.action)}
          title={MATCH_ACTION_LABEL[it.action] || it.label}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Корт в центъра, бутони за статистика отляво и отдясно (горе → долу). */
export default function MatchLiveSideStats({
  selected = null,
  disabled = false,
  onStat,
  onOpenStats = null,
  events = [],
  children,
}) {
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
      <SideCol items={MATCH_STAT_SIDE_LEFT} side="left" disabled={disabled} onStat={onStat} />
      <div className="matchLiveCourtMain">
        <div className="matchLiveSelected matchLiveSideSelected">
          {selected ? (
            <>
              <span className="matchLiveSelectedJersey">#{selected.jersey_number}</span>
              <span>{shortPlayerName(selected.athlete_name)}</span>
            </>
          ) : (
            <span>{disabled ? "Въвеждането е спряно" : "Избери състезател от корта"}</span>
          )}
        </div>
        {children}
        <div className="matchLiveEvents matchLiveEvents--compact matchLiveSideEvents">
          {(events || []).slice(0, 4).map((ev) => (
            <div key={ev.id} className="matchLiveEventRow">
              <span>R{ev.rotation}</span>
              <span>{ev.athlete_name ? shortPlayerName(ev.athlete_name) : "—"}</span>
              <span>{MATCH_ACTION_LABEL[ev.action] || ev.action}</span>
              <span>
                {ev.our_score}:{ev.opp_score}
              </span>
            </div>
          ))}
        </div>
      </div>
      <SideCol
        items={MATCH_STAT_SIDE_RIGHT}
        side="right"
        disabled={disabled}
        onStat={onStat}
        extraTop={statsBtn}
      />
    </div>
  );
}
