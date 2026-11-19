import "./assessment.css";
import {
  NATIONAL_2022_DISCLAIMER,
  national2022ChipTitle,
  national2022RefLabel,
} from "../../utils/nationalNormLabels";
import { displayTalentLabel, displayUnitLabel, talentLevelClass } from "../../utils/talentDisplay";

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function peerClass(p) {
  if (p >= 80) return "talentBadge--great";
  if (p >= 60) return "talentBadge--good";
  if (p >= 40) return "talentBadge--warn";
  return "talentBadge--develop";
}

/**
 * Презентационен мотивационен изглед — приема вече зареден обект `data`
 * (MotivationOut). Ползва се и в треньорската карта, и в портала на детето/родителя.
 * Позитивен, прост, индикативен — НЕ променя официалните оценки.
 */
export default function MotivationView({ data }) {
  if (!data || !(data.tests || []).length) {
    return <p className="assessMuted">Все още няма достатъчно резултати за мотивационен изглед.</p>;
  }

  const tests = data.tests || [];
  const refLabel = national2022RefLabel(data.gender);
  const refTitle = national2022ChipTitle(data.gender);
  const talentIndexLabel = displayTalentLabel(data.talent_index_label);

  return (
    <div className="motivWrap">
      <div className="motivSummary">
        <span className="motivStat">
          <strong>{data.improved_count}</strong> подобрени теста
        </span>
        <span className="motivStat">
          <strong>{data.personal_best_count}</strong> нови лични рекорда
        </span>
        {data.talent_index != null ? (
          <span className={`talentBadge ${talentLevelClass(data.talent_index_label)}`} title={refTitle}>
            {refLabel}: {fmt(data.talent_index)} · {talentIndexLabel}
          </span>
        ) : null}
      </div>

      <div className="motivGrid">
        {tests.map((t) => {
          const improvedClass =
            t.improved === true ? "motivDelta--up" : t.improved === false ? "motivDelta--down" : "";
          const unit = displayUnitLabel(t.unit) || t.unit || "";
          const talentLabel = displayTalentLabel(t.talent_label);
          const peerPct = t.peer_percentile != null ? Number(t.peer_percentile) : null;
          const showPeer = peerPct != null && peerPct > 0;
          return (
            <div key={t.test_code} className="motivTest">
              <div className="motivTestName">{t.test_name}</div>

              <div className="motivValueRow">
                <span className="motivValue">{fmt(t.latest)}</span>
                <span className="motivUnit">{unit}</span>
              </div>

              {t.is_new_record ? (
                <div className="motivRecord">Нов личен рекорд!</div>
              ) : t.is_personal_best ? (
                <div className="motivRecord motivRecord--soft">Личен рекорд</div>
              ) : null}

              {t.improved === true && t.delta != null ? (
                <div className={`motivDelta ${improvedClass}`}>
                  ▲ Подобри се с {fmt(Math.abs(t.delta))} {unit} (от {fmt(t.prev)})
                </div>
              ) : t.improved === false && t.delta != null ? (
                <div className={`motivDelta ${improvedClass}`}>
                  Спрямо миналия път: {fmt(t.prev)} → {fmt(t.latest)} {unit}
                </div>
              ) : (
                <div className="motivDelta motivDelta--first">Първо измерване</div>
              )}

              {t.next_goal ? (
                <div className="motivGoal">
                  Следваща цел: <strong>{displayTalentLabel(t.next_goal.next_level) || t.next_goal.next_level}</strong>{" "}
                  - остават {fmt(t.next_goal.gap)} {unit} (до {fmt(t.next_goal.target_raw)})
                </div>
              ) : null}

              <div className="motivBadges">
                {t.talent_score != null ? (
                  <span
                    className={`talentBadge talentBadgeSm ${talentLevelClass(t.talent_label)}`}
                    title={refTitle}
                  >
                    {refLabel}: {fmt(t.talent_score)} · {talentLabel}
                  </span>
                ) : null}
                {showPeer ? (
                  <span
                    className={`talentBadge talentBadgeSm ${peerClass(peerPct)}`}
                    title={`По-добър от ${fmt(peerPct)}% от връстниците (извадка: ${t.peer_sample})`}
                  >
                    По-добър от {fmt(peerPct)}% връстници{t.peer_indicative ? " *" : ""}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="assessMuted rawLegend">{NATIONAL_2022_DISCLAIMER}</p>
    </div>
  );
}
