import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { EmptyState, Button } from "../../components/ui";
import "../../components/assessment/assessment.css";

// Цветово ниво по словесната оценка 2022.
const LEVEL_CLASS = {
  Незадоволително: "talentBadge--bad",
  Задоволително: "talentBadge--warn",
  "Много добро": "talentBadge--good",
  Отлично: "talentBadge--great",
};

// Възрастови групи за филтъра.
const AGE_BANDS = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19"];

const MODES = [
  { value: "both", label: "Двете сравнения" },
  { value: "2022", label: "Само стандарт 2022" },
  { value: "peers", label: "Само връстници" },
  { value: "talent", label: "Талант (спрямо по-големите)" },
];

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Цвят на връстниковия процентил по същата скала като нивата.
function peerClass(p) {
  if (p >= 80) return "talentBadge--great";
  if (p >= 60) return "talentBadge--good";
  if (p >= 40) return "talentBadge--warn";
  return "talentBadge--bad";
}

export default function CoachScoutingTable() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const [teams, setTeams] = useState([]);
  const [battery, setBattery] = useState([]);

  const [gender, setGender] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [teamId, setTeamId] = useState("");
  const [testCode, setTestCode] = useState("");
  const [mode, setMode] = useState("both");

  const [data, setData] = useState({ tests: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Сортиране: по кой тест (код) или по име ("__name__"), и посока.
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  // Отбори + батерия (за филтрите).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [teamsRes, batteryRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAMS_LIST).catch(() => ({ data: [] })),
          axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY).catch(() => ({ data: [] })),
        ]);
        if (!alive) return;
        let teamList = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        if (!isHeadCoach) teamList = teamList.filter((t) => Number(t?.coach_id) === currentUserId);
        teamList = teamList.filter((t) => t.is_active !== false);
        setTeams(teamList);
        setBattery(Array.isArray(batteryRes.data) ? batteryRes.data : []);
      } catch {
        /* филтрите са по избор — таблицата работи и без тях */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isHeadCoach, currentUserId]);

  // Таблицата според филтрите.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const params = {};
        if (gender) params.gender = gender;
        if (ageBand) params.age_band = ageBand;
        if (teamId) params.team_id = Number(teamId);
        if (testCode) params.test_code = testCode;
        const res = await axiosInstance.get(API_PATHS.ASSESSMENT_SCOUTING, { params });
        if (alive) setData(res.data || { tests: [], rows: [] });
      } catch (err) {
        if (alive) {
          const detail = err?.response?.data?.detail;
          setError(typeof detail === "string" ? detail : "Неуспешно зареждане на таблицата.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gender, ageBand, teamId, testCode]);

  const tests = data.tests || [];
  const rows = data.rows || [];

  const cellByCode = useMemo(() => {
    return rows.map((r) => {
      const map = {};
      for (const c of r.cells || []) map[c.test_code] = c;
      return { row: r, map };
    });
  }, [rows]);

  const show2022 = mode === "both" || mode === "2022";
  const showPeers = mode === "both" || mode === "peers";
  const showTalent = mode === "talent";

  // По коя оценка сортираме (следва избрания режим; в „двете" водещ е 2022).
  const cellSortValue = (cell) => {
    if (!cell) return null;
    if (mode === "peers") return cell.peer_percentile;
    if (mode === "2022") return cell.score_2022;
    if (mode === "talent") return cell.talent_score;
    return cell.score_2022 != null ? cell.score_2022 : cell.peer_percentile;
  };

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setSortDir(key === "__name__" ? "asc" : "desc");
    }
  };

  const sortIndicator = (key) => (sortBy === key ? (sortDir === "desc" ? " ▼" : " ▲") : "");

  const sortedRows = useMemo(() => {
    const arr = [...cellByCode];
    if (!sortBy) return arr;
    arr.sort((a, b) => {
      if (sortBy === "__name__") {
        const c = String(a.row.athlete_name).localeCompare(String(b.row.athlete_name), "bg");
        return sortDir === "asc" ? c : -c;
      }
      const va = cellSortValue(a.map[sortBy]);
      const vb = cellSortValue(b.map[sortBy]);
      // Празните клетки винаги най-отдолу, независимо от посоката.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = va - vb;
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [cellByCode, sortBy, sortDir, mode]);

  // Кратко описание на активните филтри (за заглавие при печат и име на файла).
  const filterSummary = () => {
    const g = gender === "female" ? "Момичета" : gender === "male" ? "Момчета" : "Всички";
    const a = ageBand || "всички възрасти";
    const m = MODES.find((x) => x.value === mode)?.label || "";
    return `Пол: ${g} · Възраст: ${a} · Сравнение: ${m}`;
  };

  const exportCsv = () => {
    const sep = ";"; // český/EU Excel разделител — по-надеждно за кирилица
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ["Състезател", "Възраст", "Пол"];
    for (const t of tests) {
      header.push(`${t.name}${t.unit ? ` (${t.unit})` : ""}`);
      if (show2022) header.push(`${t.name} · 2022`);
      if (showPeers) header.push(`${t.name} · % връстници`);
      if (showTalent) header.push(`${t.name} · талант`);
    }

    const lines = [header.map(esc).join(sep)];
    for (const { row, map } of sortedRows) {
      const genderLabel = row.gender === "female" ? "Момиче" : row.gender === "male" ? "Момче" : "";
      const cols = [row.athlete_name, row.age_band || "", genderLabel];
      for (const t of tests) {
        const c = map[t.code];
        const hasVal = c && c.raw_value !== null && c.raw_value !== undefined;
        cols.push(hasVal ? fmt(c.raw_value) : "");
        if (show2022) {
          cols.push(hasVal && c.score_2022 != null ? `${fmt(c.score_2022)} · ${c.score_2022_label}` : "");
        }
        if (showPeers) {
          cols.push(
            hasVal && c.peer_percentile != null ? `${fmt(c.peer_percentile)}%${c.peer_indicative ? " *" : ""}` : "",
          );
        }
        if (showTalent) {
          cols.push(hasVal && c.talent_score != null ? `${fmt(c.talent_score)} · ${c.talent_label}` : "");
        }
      }
      lines.push(cols.map(esc).join(sep));
    }

    // BOM, за да чете Excel кирилицата правилно.
    const csv = `\uFEFF${lines.join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const parts = ["skaut", gender || "vsichki", ageBand || "vsichki", new Date().toISOString().slice(0, 10)];
    a.download = `${parts.join("_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="coachMobilePage">
      <div className="devHead">
        <h2 className="coachMobileSectionTitle" style={{ margin: 0 }}>
          Скаут таблица
        </h2>
        <Link to="/coach/assessment" className="devBack scoutNoPrint">
          ← Диагностика
        </Link>
      </div>

      <div className="assessToolbar scoutNoPrint">
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
          <span>Отбор</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Всички</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {[t.name, t.age_group].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        <label className="assessField">
          <span>Тест</span>
          <select value={testCode} onChange={(e) => setTestCode(e.target.value)}>
            <option value="">Всички</option>
            {battery
              .filter((t) => t.category !== "anthropometry" && t.direction !== "context")
              .map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label className="assessField">
          <span>Сравнение</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="assessMuted">Зареждане на таблицата...</p>
      ) : error ? (
        <p className="assessMuted">{error}</p>
      ) : !rows.length ? (
        <EmptyState
          title="Няма деца"
          description="Няма състезатели по тези филтри или още нямат въведени резултати."
        />
      ) : (
        <>
          <div className="scoutActions scoutNoPrint">
            <Button variant="secondary" onClick={exportCsv}>
              Експорт CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Печат / PDF
            </Button>
          </div>

          <div className="scoutPrintArea">
            <div className="scoutPrintTitle scoutPrintOnly">
              <strong>Скаут таблица</strong>
              <span>{filterSummary()}</span>
            </div>
            <div className="assessGridWrap">
            <table className="assessGrid rawValuesTable">
              <thead>
                <tr>
                  <th
                    className="assessStickyCol scoutSortable"
                    onClick={() => toggleSort("__name__")}
                    title="Сортирай по име"
                  >
                    Състезател{sortIndicator("__name__")}
                  </th>
                  {tests.map((t) => (
                    <th
                      key={t.code}
                      className="assessTestCol scoutSortable"
                      onClick={() => toggleSort(t.code)}
                      title="Сортирай по този тест (най-добрите най-отгоре)"
                    >
                      <span className="assessTestName">
                        {t.name}
                        {sortIndicator(t.code)}
                      </span>
                      <span className="assessTestUnit">{t.unit}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ row, map }) => (
                  <tr key={row.athlete_id}>
                    <th className="assessStickyCol assessAthleteName" title={row.athlete_name}>
                      {row.athlete_name}
                      <span className="rawUnit">
                        {" "}
                        ({[row.age_band, row.gender === "female" ? "Ж" : row.gender === "male" ? "М" : ""]
                          .filter(Boolean)
                          .join(" · ")})
                      </span>
                    </th>
                    {tests.map((t) => {
                      const c = map[t.code];
                      if (!c || c.raw_value === null || c.raw_value === undefined) {
                        return (
                          <td key={t.code} className="rawCell">
                            <span className="rawUnit">—</span>
                          </td>
                        );
                      }
                      return (
                        <td key={t.code} className="rawCell scoutCell">
                          <span className="rawRaw">{fmt(c.raw_value)}</span>
                          {show2022 && c.score_2022 != null ? (
                            <span
                              className={`talentBadge talentBadgeSm ${
                                LEVEL_CLASS[c.score_2022_label] || "talentBadge--good"
                              }`}
                              title="Спрямо националния стандарт 2022 за неговата възраст"
                            >
                              {fmt(c.score_2022)} · {c.score_2022_label}
                            </span>
                          ) : null}
                          {showPeers && c.peer_percentile != null ? (
                            <span
                              className={`talentBadge talentBadgeSm ${peerClass(c.peer_percentile)}`}
                              title={`По-добър от ${fmt(c.peer_percentile)}% от връстниците (извадка: ${c.peer_sample})`}
                            >
                              {fmt(c.peer_percentile)}% връст.{c.peer_indicative ? "*" : ""}
                            </span>
                          ) : null}
                          {showTalent && c.talent_score != null ? (
                            <span
                              className={`talentBadge talentBadgeSm ${
                                LEVEL_CLASS[c.talent_label] || "talentBadge--good"
                              }`}
                              title="Спрямо летвата на по-големите (национален стандарт 2022)"
                            >
                              {fmt(c.talent_score)} · {c.talent_label}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="assessMuted rawLegend">
              Голямото число е реалната стойност. Цветната значка „· дума" е спрямо националния стандарт
              2022 (за неговата възраст). „% връст." е процентил спрямо всички деца на същата възраст и пол
              в системата; „*" = малка извадка (индикативно). Режим „Талант" сравнява по-малките деца
              (U9–U12) с летвата на по-големите от 2022 (момичета U13, момчета U13) — индикативно. Кликни
              върху заглавие на тест, за да подредиш най-добрите най-отгоре (повторен клик обръща реда).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
