const BG_TOKEN_MAP = {
  attack: "Атака",
  defense: "Защита",
  defence: "Защита",
  receive: "Посрещане",
  reception: "Посрещане",
  "serve receive": "Посрещане",
  serve: "Сервис",
  service: "Сервис",
  block: "Блок",
  setting: "Разпределение",
  set: "Разпределение",
  pass: "Разпределение",
  passing: "Разпределение",
  transition: "Преход",
  counter: "Контраатака",
  rally: "Разиграване",
  game: "Игра",
};

export function defaultToBgLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) return text;
  const parts = text
    .replace(/_/g, " ")
    .split(/[,/|;]/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const translated = parts.map((part) => {
    const key = part.toLowerCase();
    return BG_TOKEN_MAP[key] || part;
  });
  return translated.join(", ");
}

export function SessionReviewCard({ sessionReview, toBgLabel = defaultToBgLabel }) {
  if (!sessionReview) return null;
  const rec = sessionReview.recommended || {};
  const week = sessionReview.week || {};
  const day = sessionReview.day || {};
  const tb = sessionReview.textbook || {};
  const timeline = sessionReview.timeline || [];
  const blockGuide = sessionReview.blockGuide || [];

  return (
    <div className="aiGenSessionReview" role="region" aria-label="Контекст на тренировката">
      <div className="aiGenSessionReviewHead">
        <h3 className="aiGenSessionReviewTitle">Контекст от годишната програма</h3>
        {sessionReview.mesoLabel ? <span className="aiGenSessionReviewMeso">{sessionReview.mesoLabel}</span> : null}
      </div>
      <div className="aiGenSessionReviewGrid">
        <div className="aiGenSessionReviewItem">
          <span className="aiGenSessionReviewLabel">Основен фокус</span>
          <strong>{toBgLabel(rec.mainFocus) || "—"}</strong>
        </div>
        <div className="aiGenSessionReviewItem">
          <span className="aiGenSessionReviewLabel">Вторичен фокус</span>
          <strong>{toBgLabel(rec.secondaryFocus) || "—"}</strong>
        </div>
        <div className="aiGenSessionReviewItem">
          <span className="aiGenSessionReviewLabel">Период</span>
          <strong>{rec.periodLabel || "—"}</strong>
        </div>
        <div className="aiGenSessionReviewItem">
          <span className="aiGenSessionReviewLabel">Натоварване / интензитет</span>
          <strong>
            {rec.load || week.load || "—"}
            {rec.intensityLabel ? ` → ${rec.intensityLabel}` : ""}
          </strong>
        </div>
      </div>
      {day.label || day.theme || week.theme ? (
        <p className="aiGenSessionReviewDay">
          {day.label ? `${day.label}` : week.week ? `Седмица ${week.week}` : ""}
          {day.theme || week.theme ? ` · ${day.theme || week.theme}` : ""}
          {day.session_goal ? ` — ${day.session_goal}` : ""}
        </p>
      ) : null}
      {tb.session_code || tb.title ? (
        <p className="aiGenSessionReviewTextbook">
          <strong>Конспект:</strong> {tb.session_code ? `${tb.session_code} · ` : ""}
          {tb.title || ""}
        </p>
      ) : null}
      {timeline.length ? (
        <div className="aiGenTimeline">
          <span className="aiGenSessionReviewLabel">Timeline от конспекта</span>
          <ol className="aiGenTimelineList">
            {timeline.map((seg, i) => (
              <li key={`${seg.time}-${i}`} className="aiGenTimelineItem">
                <span className="aiGenTimelineTime">{seg.time}</span>
                <span className="aiGenTimelineLabel">{seg.label}</span>
                {seg.mapsToBlock ? <span className="aiGenTimelineBlock">→ {seg.mapsToBlock}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {blockGuide.length ? (
        <div className="aiGenBlockGuide">
          <span className="aiGenSessionReviewLabel">Структура на блоковете</span>
          <div className="aiGenBlockGuideGrid">
            {blockGuide.map((g) => (
              <div key={g.blockType} className="aiGenBlockGuideCard">
                <div className="aiGenBlockGuideHead">
                  <strong>{g.blockType}</strong>
                  <span>{g.targetMinutes} мин</span>
                </div>
                {g.goal ? <p className="aiGenBlockGuideGoal">{g.goal}</p> : null}
                {(g.segments || []).length ? (
                  <ul className="aiGenBlockGuideSegs">
                    {g.segments.map((s, si) => (
                      <li key={si}>
                        {s.time} {s.label}
                      </li>
                    ))}
                  </ul>
                ) : g.timelineHint ? (
                  <p className="aiGenBlockGuideHint">{g.timelineHint}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BlockMethodContext({ block, blockGuide }) {
  const guide = (blockGuide || []).find((g) => g.blockType === block.blockType);
  const hint = block.methodHint || guide?.timelineHint;
  const goal = block.phaseGoal || guide?.goal;
  const segments = (block.timelineSegments || []).length ? block.timelineSegments : guide?.segments || [];

  if (!hint && !goal && !segments.length) return null;

  return (
    <div className="aiGenBlockContext">
      {goal ? <p className="aiGenBlockGoal">{goal}</p> : null}
      {segments.length ? (
        <ul className="aiGenBlockTimeline">
          {segments.map((s, i) => (
            <li key={i}>
              <span className="aiGenTimelineTime">{s.time}</span> {s.label}
            </li>
          ))}
        </ul>
      ) : hint ? (
        <p className="aiGenBlockHint">{hint}</p>
      ) : null}
    </div>
  );
}
