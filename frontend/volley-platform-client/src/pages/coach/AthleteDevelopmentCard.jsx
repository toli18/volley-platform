import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, EmptyState } from "../../components/ui";
import DevelopmentScoreChart from "../../components/assessment/DevelopmentScoreChart";
import AthleteRawResultsTable from "../../components/assessment/AthleteRawResultsTable";
import AthleteMotivationCard from "../../components/assessment/AthleteMotivationCard";
import AthleteAgeEquivalentCard from "../../components/assessment/AthleteAgeEquivalentCard";
import DeficitRecommendations from "../../components/assessment/DeficitRecommendations";
import { openDevelopmentReport } from "../../utils/developmentReport";
import "../../components/assessment/assessment.css";

const PHASE_LABELS = { baseline: "Входящо", mid: "Междинно", endline: "Изходящо" };

export default function AthleteDevelopmentCard() {
  const { athleteId } = useParams();
  const athleteIdNum = Number(athleteId);
  const [searchParams] = useSearchParams();
  const backTo = searchParams.get("from") || "/coach/assessment";

  const [athleteName, setAthleteName] = useState("");
  const [scores, setScores] = useState([]);
  const [windowMap, setWindowMap] = useState({});
  const [selectedWindowId, setSelectedWindowId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deficits, setDeficits] = useState([]);
  const [mainFocus, setMainFocus] = useState("");
  const [secondaryFocus, setSecondaryFocus] = useState("");
  const [generated, setGenerated] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recNotice, setRecNotice] = useState(null);

  const [consent, setConsent] = useState(null);
  const [consentSaving, setConsentSaving] = useState(false);

  useEffect(() => {
    if (!athleteIdNum) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [profileRes, devRes, windowsRes, consentRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteIdNum)).catch(() => ({ data: null })),
          axiosInstance.get(API_PATHS.ASSESSMENT_DEVELOPMENT(athleteIdNum)),
          axiosInstance.get(API_PATHS.ASSESSMENT_WINDOWS).catch(() => ({ data: [] })),
          axiosInstance.get(API_PATHS.ASSESSMENT_CONSENT(athleteIdNum)).catch(() => ({ data: null })),
        ]);
        if (!alive) return;

        setAthleteName(profileRes.data?.athlete_name || `Състезател #${athleteIdNum}`);
        setConsent(consentRes.data || null);

        const map = {};
        for (const w of Array.isArray(windowsRes.data) ? windowsRes.data : []) {
          map[w.id] = { season: w.season, phaseLabel: PHASE_LABELS[w.phase] || w.phase };
        }
        setWindowMap(map);

        const list = Array.isArray(devRes.data) ? devRes.data : [];
        setScores(list);
        if (list.length) {
          const latest = list.reduce((a, b) => (b.window_id > a.window_id ? b : a));
          setSelectedWindowId(String(latest.window_id));
        }
      } catch (err) {
        if (!alive) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Неуспешно зареждане на картата за развитие.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [athleteIdNum]);

  const windowChoices = useMemo(() => {
    const ids = [...new Set(scores.map((s) => s.window_id))];
    ids.sort((a, b) => b - a);
    return ids;
  }, [scores]);

  const applyRecommendation = (data) => {
    setDeficits(Array.isArray(data?.deficits) ? data.deficits : []);
    setMainFocus(data?.main_focus || "");
    setSecondaryFocus(data?.secondary_focus || "");
  };

  const analyze = async () => {
    if (!selectedWindowId) {
      setRecNotice({ type: "err", text: "Изберете прозорец." });
      return;
    }
    try {
      setRecLoading(true);
      setRecNotice(null);
      setGenerated(null);
      const res = await axiosInstance.post(
        `${API_PATHS.ASSESSMENT_RECOMMEND(athleteIdNum)}?window_id=${Number(selectedWindowId)}&generate=false`
      );
      applyRecommendation(res.data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRecNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешен анализ." });
    } finally {
      setRecLoading(false);
    }
  };

  const generate = async () => {
    if (!selectedWindowId) {
      setRecNotice({ type: "err", text: "Изберете прозорец." });
      return;
    }
    try {
      setGenerating(true);
      setRecNotice(null);
      const res = await axiosInstance.post(
        `${API_PATHS.ASSESSMENT_RECOMMEND(athleteIdNum)}?window_id=${Number(selectedWindowId)}&generate=true`
      );
      applyRecommendation(res.data);
      setGenerated(res.data?.generated || null);
      setRecNotice({ type: "ok", text: "Тренировката е генерирана по диагнозата." });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRecNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешно генериране." });
    } finally {
      setGenerating(false);
    }
  };

  const toggleConsent = async () => {
    if (consentSaving) return;
    const next = !(consent?.is_granted);
    try {
      setConsentSaving(true);
      const res = await axiosInstance.put(API_PATHS.ASSESSMENT_CONSENT(athleteIdNum), { granted: next });
      setConsent(res.data || null);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRecNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешна промяна на съгласието." });
    } finally {
      setConsentSaving(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setRecNotice(null);
      let nextDeficits = deficits;
      let nextMain = mainFocus;
      let nextSecondary = secondaryFocus;

      if (!nextDeficits.length && selectedWindowId) {
        const res = await axiosInstance.post(
          `${API_PATHS.ASSESSMENT_RECOMMEND(athleteIdNum)}?window_id=${Number(selectedWindowId)}&generate=false`
        );
        nextDeficits = Array.isArray(res.data?.deficits) ? res.data.deficits : [];
        nextMain = res.data?.main_focus || "";
        nextSecondary = res.data?.secondary_focus || "";
        applyRecommendation(res.data);
      }

      const [motRes, rawRes] = await Promise.all([
        axiosInstance.get(API_PATHS.ASSESSMENT_MOTIVATION(athleteIdNum)).catch(() => ({ data: null })),
        axiosInstance.get(API_PATHS.ASSESSMENT_RESULTS(athleteIdNum)).catch(() => ({ data: [] })),
      ]);

      openDevelopmentReport({
        athleteName,
        scores,
        windowMap,
        deficits: nextDeficits,
        mainFocus: nextMain,
        secondaryFocus: nextSecondary,
        motivation: motRes.data || null,
        rawWindows: Array.isArray(rawRes.data) ? rawRes.data : [],
      });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRecNotice({ type: "err", text: typeof detail === "string" ? detail : "Неуспешно генериране на PDF." });
    }
  };

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;

  return (
    <div className="coachMobilePage">
      <div className="devHead">
        <Link to={backTo} className="devBack">
          ← Назад
        </Link>
        <h2 className="coachMobileSectionTitle" style={{ margin: 0 }}>
          Карта за развитие — {athleteName}
        </h2>
      </div>

      <h3 className="devSectionTitle">Development Score през прозорците</h3>
      <DevelopmentScoreChart scores={scores} windowMap={windowMap} />

      <h3 className="devSectionTitle">Реални стойности по прозорец</h3>
      <AthleteRawResultsTable athleteId={athleteIdNum} />

      <h3 className="devSectionTitle">За детето — моят напредък</h3>
      <AthleteMotivationCard athleteId={athleteIdNum} />

      <h3 className="devSectionTitle">Възрастов еквивалент</h3>
      <AthleteAgeEquivalentCard athleteId={athleteIdNum} />

      <h3 className="devSectionTitle">Диагноза → предписание</h3>

      {windowChoices.length === 0 ? (
        <p className="assessMuted">
          Няма финализирани прозорци за този състезател. Приключете диагностична сесия, за да получите препоръки.
        </p>
      ) : (
        <>
          <div className="assessToolbar">
            <label className="assessField">
              <span>Прозорец за анализ</span>
              <select value={selectedWindowId} onChange={(e) => setSelectedWindowId(e.target.value)}>
                {windowChoices.map((id) => {
                  const win = windowMap[id];
                  return (
                    <option key={id} value={id}>
                      {win ? `${win.season} · ${win.phaseLabel}` : `Прозорец #${id}`}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {recNotice ? (
            <div className={`assessNotice assessNotice--${recNotice.type === "ok" ? "ok" : "err"}`}>
              {recNotice.text}
            </div>
          ) : null}

          <DeficitRecommendations
            deficits={deficits}
            mainFocus={mainFocus}
            secondaryFocus={secondaryFocus}
            onAnalyze={analyze}
            onGenerate={generate}
            loading={recLoading}
            generating={generating}
            generated={generated}
          />

          <div className="assessActions">
            <Button
              type="button"
              variant={consent?.is_granted ? "primary" : "secondary"}
              onClick={toggleConsent}
              disabled={consentSaving}
              title="Родителят вижда Картата за развитие в портала само при дадено съгласие"
            >
              {consentSaving
                ? "Запазване..."
                : consent?.is_granted
                  ? "✓ Споделено с родител (оттегли)"
                  : "Сподели с родител"}
            </Button>
            <Button type="button" variant="secondary" onClick={downloadPdf}>
              Изтегли PDF
            </Button>
          </div>
          {consent?.is_granted ? (
            <p className="assessMuted">
              Родителят има достъп до Картата за развитие в родителския портал.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
