import "./assessment.css";

/**
 * Лек тренд на Development Score през прозорците (без графична библиотека).
 * Всеки ред = прозорец: етикет (сезон · фаза), хоризонтална лента 0–100 и делта.
 */
function clampPct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) {
    return <span className="devDelta devDelta--flat">—</span>;
  }
  const n = Number(delta);
  const cls = n > 0 ? "devDelta--up" : n < 0 ? "devDelta--down" : "devDelta--flat";
  const sign = n > 0 ? "+" : "";
  return <span className={`devDelta ${cls}`}>{`${sign}${n.toFixed(1)}`}</span>;
}

export default function DevelopmentScoreChart({ scores = [], windowMap = {} }) {
  if (!scores.length) {
    return <p className="assessMuted">Все още няма изчислени резултати. Приключете диагностична сесия.</p>;
  }

  return (
    <div className="devChart">
      {scores.map((s) => {
        const win = windowMap[s.window_id];
        const label = win ? `${win.season} · ${win.phaseLabel}` : `Прозорец #${s.window_id}`;
        const score = s.development_score;
        const sub = [
          s.technical_subindex != null ? `Тех ${s.technical_subindex}` : null,
          s.physical_subindex != null ? `Физ ${s.physical_subindex}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="devRow" key={s.window_id}>
            <div className="devRowLabel">
              {label}
              {sub ? <span className="devRowSub">{sub}</span> : null}
            </div>
            <div className="devBarTrack">
              <div className="devBarFill" style={{ width: `${clampPct(score)}%` }} />
              <span className="devBarValue">{score != null ? Math.round(score) : "—"}</span>
            </div>
            <DeltaBadge delta={s.delta} />
          </div>
        );
      })}
    </div>
  );
}
