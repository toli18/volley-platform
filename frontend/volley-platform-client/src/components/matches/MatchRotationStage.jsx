import MatchCourt from "./MatchCourt";

export default function MatchRotationStage({
  rotation = 1,
  system = "5-1",
  opponentName = "",
  slots = [],
  libero = null,
  onRotate,
  onBack,
  onEditLineup,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
}) {
  const title = opponentName ? `vs ${opponentName}` : "Ротация";
  const subtitle = `РОТАЦИЯ ${rotation} · ${system}`;

  return (
    <div className="matchRotStage">
      <div className="matchRotStageTop">
        <div className="matchRotStageTopLeft">
          <span className="matchRotStageMode">РОТАЦИЯ {rotation}</span>
        </div>
        <div className="matchRotStageTopRight">
          <span className="matchRotStageSystem">{system}</span>
        </div>
      </div>

      <MatchCourt
        variant="pro"
        slots={slots}
        libero={libero}
        showServe
        title={title}
        subtitle={subtitle}
      />

      <div className="matchRotStageBar">
        <button type="button" className="matchRotBarBtn matchRotBarBtn--ghost" onClick={onBack} disabled={!canPrev}>
          ↺ Назад
        </button>
        <div className="matchRotStageBarMid">
          <button type="button" className="matchRotIconBtn" onClick={onPrev} disabled={!canPrev} aria-label="Предишна ротация">
            ‹
          </button>
          <span className="matchRotStageBarLabel">R{rotation}</span>
          <button type="button" className="matchRotIconBtn" onClick={onNext} disabled={!canNext} aria-label="Следваща ротация">
            ›
          </button>
        </div>
        <button type="button" className="matchRotBarBtn matchRotBarBtn--accent" onClick={onRotate}>
          Rotate ↻
        </button>
      </div>

      {onEditLineup ? (
        <button type="button" className="matchRotEditLink" onClick={onEditLineup}>
          Редактирай шестицата
        </button>
      ) : null}
    </div>
  );
}
