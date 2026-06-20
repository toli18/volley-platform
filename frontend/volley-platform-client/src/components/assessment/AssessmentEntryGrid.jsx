import "./assessment.css";

/**
 * Mobile-first грид за въвеждане на сурови резултати: редове = състезатели,
 * колони = тестове от батерията. Контролиран компонент — стойностите и
 * промените се управляват от родителя (CoachAssessmentSession).
 */
export default function AssessmentEntryGrid({
  tests = [],
  athletes = [],
  values = {},
  onChange,
  disabled = false,
}) {
  if (!athletes.length) {
    return <p className="assessMuted">Няма състезатели в този отбор.</p>;
  }
  if (!tests.length) {
    return <p className="assessMuted">Тестовата батерия не е заредена.</p>;
  }

  return (
    <div className="assessGridWrap">
      <table className="assessGrid">
        <thead>
          <tr>
            <th className="assessStickyCol">Състезател</th>
            {tests.map((t) => (
              <th key={t.code} className="assessTestCol" title={t.name}>
                <span className="assessTestName">{t.name}</span>
                <span className="assessTestUnit">{t.unit}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => (
            <tr key={a.athlete_id}>
              <th className="assessStickyCol assessAthleteName">{a.athlete_name}</th>
              {tests.map((t) => (
                <td key={t.code}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="assessInput"
                    aria-label={`${a.athlete_name} — ${t.name}`}
                    value={values?.[a.athlete_id]?.[t.code] ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChange?.(a.athlete_id, t.code, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
