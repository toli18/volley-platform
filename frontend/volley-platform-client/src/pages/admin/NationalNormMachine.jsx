// src/pages/admin/NationalNormMachine.jsx
import { useEffect, useMemo, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, AdminSection, Button, Card, EmptyState } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";
import "../../components/assessment/assessment.css";

const GENDER_LABELS = { male: "Момчета", female: "Момичета" };
const AGE_BANDS = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"];

const CONFIDENCE = {
  high: { label: "Високо", cls: "uiBadge--success" },
  medium: { label: "Средно", cls: "uiBadge--info" },
  low: { label: "Ниско", cls: "uiBadge--warning" },
  indicative: { label: "Индикативно", cls: "uiBadge--danger" },
};

const fmtNum = (v, digits = 1) =>
  v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(digits);

export default function NationalNormMachine() {
  const toast = useToast();
  const [data, setData] = useState({ cells: [], min_display_sample: 5, min_trust_sample: 20 });
  const [battery, setBattery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [gender, setGender] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [testCode, setTestCode] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY).catch(() => ({ data: [] }));
        if (alive) setBattery(Array.isArray(res.data) ? res.data : []);
      } catch {
        /* батерията е по избор за филтъра */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const params = {};
      if (gender) params.gender = gender;
      if (ageBand) params.age_band = ageBand;
      if (testCode) params.test_code = testCode;
      const res = await axiosInstance.get(API_PATHS.ASSESSMENT_NATIONAL_NORMS, { params });
      setData(res.data || { cells: [] });
    } catch (err) {
      setError(normalizeError(err, "Неуспешно зареждане на машината за норми."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, ageBand, testCode]);

  const cellKey = (c) => `${c.test_code}|${c.age_band}|${c.gender}`;

  const replaceCell = (updated) => {
    setData((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (cellKey(c) === cellKey(updated) ? { ...c, ...updated } : c)),
    }));
  };

  const approve = async (c) => {
    setBusyKey(cellKey(c));
    try {
      const res = await axiosInstance.post(API_PATHS.ASSESSMENT_NATIONAL_NORMS_APPROVE, {
        test_code: c.test_code,
        age_band: c.age_band,
        gender: c.gender,
      });
      replaceCell(res.data);
      toast.success("Нормата е одобрена като официална основа.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно одобрение."));
    } finally {
      setBusyKey("");
    }
  };

  const revoke = async (c) => {
    setBusyKey(cellKey(c));
    try {
      const res = await axiosInstance.post(API_PATHS.ASSESSMENT_NATIONAL_NORMS_REVOKE, {
        test_code: c.test_code,
        age_band: c.age_band,
        gender: c.gender,
      });
      replaceCell(res.data);
      toast.success("Одобрението е оттеглено.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно оттегляне."));
    } finally {
      setBusyKey("");
    }
  };

  const recompute = async () => {
    setBusyKey("__recompute__");
    try {
      const params = {};
      if (gender) params.gender = gender;
      if (ageBand) params.age_band = ageBand;
      if (testCode) params.test_code = testCode;
      const res = await axiosInstance.post(API_PATHS.ASSESSMENT_NATIONAL_NORMS_RECOMPUTE, null, { params });
      setData(res.data || { cells: [] });
      toast.success("Нормите са преизчислени.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно преизчисляване."));
    } finally {
      setBusyKey("");
    }
  };

  const cells = data.cells || [];
  const minTrust = data.min_trust_sample ?? 20;

  const scoreableTests = useMemo(
    () =>
      battery.filter(
        (t) => t.category !== "anthropometry" && t.direction !== "context"
      ),
    [battery]
  );

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Машина за национални норми"
        subtitle="Живата българска летва по възраст и пол — до стандарт 2022. Одобрената норма става официална основа за оценката."
        actions={
          <Button variant="secondary" onClick={recompute} disabled={busyKey === "__recompute__"}>
            {busyKey === "__recompute__" ? "Преизчислява…" : "Преизчисли"}
          </Button>
        }
      />

      <AdminSection title="Филтри">
        <div className="assessToolbar">
          <label className="assessField">
            <span>Пол</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Всички</option>
              <option value="female">Момичета</option>
              <option value="male">Момчета</option>
            </select>
          </label>
          <label className="assessField">
            <span>Възраст</span>
            <select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
              <option value="">Всички</option>
              {AGE_BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="assessField">
            <span>Тест</span>
            <select value={testCode} onChange={(e) => setTestCode(e.target.value)}>
              <option value="">Всички</option>
              {scoreableTests.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </AdminSection>

      {loading ? (
        <p className="assessMuted">Зареждане…</p>
      ) : error ? (
        <EmptyState title="Грешка" description={error} />
      ) : !cells.length ? (
        <EmptyState
          title="Още няма достатъчно данни"
          description={`Клетка светва от ${data.min_display_sample} деца (индикативно). Натрупайте резултати по възраст и пол.`}
        />
      ) : (
        <Card className="uiCard--padded">
          <div className="assessGridWrap">
            <table className="assessGrid normMachineTable">
              <thead>
                <tr>
                  <th className="assessStickyCol">Тест</th>
                  <th>Възр./Пол</th>
                  <th>Деца</th>
                  <th>Жива норма (средно ± откл.)</th>
                  <th>Разпределение (p20–p80)</th>
                  <th>Покритие</th>
                  <th>Увереност</th>
                  <th>Спрямо 2022</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => {
                  const key = cellKey(c);
                  const conf = CONFIDENCE[c.confidence] || null;
                  const participation =
                    c.eligible_athletes > 0 ? Math.round((c.n / c.eligible_athletes) * 100) : null;
                  return (
                    <tr key={key}>
                      <th className="assessStickyCol assessAthleteName" title={c.test_name}>
                        {c.test_name || c.test_code}
                        {c.unit ? <span className="rawUnit"> ({c.unit})</span> : null}
                      </th>
                      <td>
                        {c.age_band} · {GENDER_LABELS[c.gender] || c.gender}
                      </td>
                      <td>
                        <strong>{c.n}</strong>
                        {participation != null ? (
                          <span className="rawUnit"> ({participation}%)</span>
                        ) : null}
                      </td>
                      <td>
                        <strong>{fmtNum(c.mean)}</strong>
                        <span className="rawUnit"> ± {fmtNum(c.std)}</span>
                      </td>
                      <td className="rawUnit">
                        {fmtNum(c.p20)} · {fmtNum(c.p40)} · {fmtNum(c.p60)} · {fmtNum(c.p80)}
                      </td>
                      <td className="rawUnit">
                        {c.regions_count} рег. · {c.clubs_count} клуба
                      </td>
                      <td>
                        {conf ? <span className={`uiBadge ${conf.cls}`}>{conf.label}</span> : "—"}
                      </td>
                      <td>
                        {c.has_2022 && c.mean_score_2022 != null ? (
                          <span title="Къде ляга нашето средно по скалата на 2022">
                            {fmtNum(c.mean_score_2022)} · {c.mean_label_2022}
                          </span>
                        ) : (
                          <span className="rawUnit">няма 2022</span>
                        )}
                      </td>
                      <td>
                        {c.is_approved ? (
                          <span className="uiBadge uiBadge--success">Официална</span>
                        ) : c.trust_ready ? (
                          <span className="uiBadge uiBadge--info">Готова за одобрение</span>
                        ) : (
                          <span className="uiBadge uiBadge--warning">Индикативна</span>
                        )}
                      </td>
                      <td>
                        {c.is_approved ? (
                          <Button
                            variant="secondary"
                            disabled={busyKey === key}
                            onClick={() => revoke(c)}
                          >
                            Оттегли
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            disabled={busyKey === key || !c.trust_ready}
                            title={
                              c.trust_ready
                                ? "Одобри като официална основа"
                                : `Нужни са поне ${minTrust} деца`
                            }
                            onClick={() => approve(c)}
                          >
                            Одобри
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="assessMuted rawLegend">
            „Жива норма" е българската летва от реалните резултати (последна стойност на дете). Светва от{" "}
            {data.min_display_sample} деца (индикативно); става официална основа от {minTrust} деца, и то само
            след одобрение тук. „Спрямо 2022" показва къде ляга нашето средно по скалата на стандарта 2022 —
            двата стандарта остават един до друг.
          </p>
        </Card>
      )}
    </div>
  );
}
