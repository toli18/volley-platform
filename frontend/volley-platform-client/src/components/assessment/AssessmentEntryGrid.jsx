import { Link } from "react-router-dom";
import { netJump, NET_JUMP_APPROACH_CODE, NET_JUMP_REACH_CODE } from "../../utils/netJump";
import "./assessment.css";

/**
 * Mobile-first грид за въвеждане на сурови резултати: редове = състезатели,
 * колони = тестове от батерията. Контролиран компонент — стойностите и
 * промените се управляват от родителя (CoachAssessmentSession).
 *
 * `athleteHref(athleteId)` (по избор): ако е подадено, името на състезателя
 * става връзка (напр. към Картата за развитие след finalize).
 *
 * Ако батерията съдържа едновременно „Отскок след засилване" и „Разтег",
 * автоматично се добавя изчислена колона „Чист отскок" (само за четене).
 */
export default function AssessmentEntryGrid({
  tests = [],
  athletes = [],
  values = {},
  onChange,
  disabled = false,
  athleteHref = null,
}) {
  if (!athletes.length) {
    return <p className="assessMuted">Няма състезатели в този отбор.</p>;
  }
  if (!tests.length) {
    return <p className="assessMuted">Тестовата батерия не е заредена.</p>;
  }

  const codes = new Set(tests.map((t) => t.code));
  const showNetJump = codes.has(NET_JUMP_APPROACH_CODE) && codes.has(NET_JUMP_REACH_CODE);

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
            {showNetJump ? (
              <th className="assessTestCol assessDerivedCol" title="Отскок след засилване минус разтег">
                <span className="assessTestName">Чист отскок</span>
                <span className="assessTestUnit">см</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => {
            const row = values?.[a.athlete_id];
            const net = showNetJump
              ? netJump(row?.[NET_JUMP_APPROACH_CODE], row?.[NET_JUMP_REACH_CODE])
              : null;
            return (
              <tr key={a.athlete_id}>
                <th className="assessStickyCol assessAthleteName">
                  {athleteHref ? (
                    <Link to={athleteHref(a.athlete_id)} className="devBack">
                      {a.athlete_name}
                    </Link>
                  ) : (
                    a.athlete_name
                  )}
                </th>
                {tests.map((t) => (
                  <td key={t.code}>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      className="assessInput"
                      aria-label={`${a.athlete_name} — ${t.name}`}
                      value={row?.[t.code] ?? ""}
                      disabled={disabled}
                      onChange={(e) => onChange?.(a.athlete_id, t.code, e.target.value)}
                    />
                  </td>
                ))}
                {showNetJump ? (
                  <td className="assessDerivedCell" aria-label={`${a.athlete_name} — Чист отскок`}>
                    {net != null ? net : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
