import "./assessment.css";
import { Button } from "../ui";

/**
 * Дефицити (от диагностиката) + CTA за генериране на тренировка по диагнозата.
 * Показва генерирания план (текст), ако вече е поискан.
 */
export default function DeficitRecommendations({
  deficits = [],
  mainFocus,
  secondaryFocus,
  onAnalyze,
  onGenerate,
  loading = false,
  generating = false,
  generated = null,
}) {
  return (
    <div className="deficitWrap">
      <div className="deficitFocus">
        {mainFocus ? <span className="deficitChip deficitChip--bad">Фокус: {mainFocus}</span> : null}
        {secondaryFocus ? <span className="deficitChip">Вторичен: {secondaryFocus}</span> : null}
      </div>

      {deficits.length ? (
        <div className="deficitFocus">
          {deficits.map((d) => (
            <span
              key={d.domain}
              className={`deficitChip ${d.is_deficit ? "deficitChip--bad" : "deficitChip--ok"}`}
              title={d.is_deficit ? "Под прага — дефицит" : "Над прага"}
            >
              {d.domain}: {Math.round(d.normalized)}
            </span>
          ))}
        </div>
      ) : (
        <p className="assessMuted">Натиснете „Анализирай“, за да видите дефицитите за този прозорец.</p>
      )}

      <div className="assessActions">
        <Button type="button" variant="secondary" onClick={onAnalyze} disabled={loading || generating}>
          {loading ? "Анализиране..." : "Анализирай"}
        </Button>
        <Button type="button" onClick={onGenerate} disabled={loading || generating}>
          {generating ? "Генериране..." : "Генерирай тренировка по диагнозата"}
        </Button>
      </div>

      {generated?.trainingPlanText ? (
        <pre className="deficitPlanText">{generated.trainingPlanText}</pre>
      ) : null}
    </div>
  );
}
