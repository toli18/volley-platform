import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import DrillMediaPreviewModal, { getDrillPrimaryMedia } from "../components/DrillMediaPreviewModal";

const PERIODS = [
  { value: "prep", label: "Подготовителен период" },
  { value: "inseason", label: "Състезателен период" },
  { value: "taper", label: "Пикова форма" },
  { value: "offseason", label: "Преходен период" },
];

const INTENSITIES = [
  { value: "low", label: "Нисък" },
  { value: "medium", label: "Среден" },
  { value: "high", label: "Висок" },
];

const DURATION_OPTIONS = [60, 75, 90, 105, 120];
const PLAYERS_OPTIONS = [6, 8, 10, 12, 14, 16, 18];
const AGE_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 10);
const SEED_OPTIONS = [7, 42, 99, 2026];
const ORIENTATION_OPTIONS = [
  { value: "balanced", label: "Балансирана" },
  { value: "serve_receive", label: "Сервис / Посрещане" },
  { value: "attack_block", label: "Атака / Блок" },
  { value: "defense_transition", label: "Защита / Преход" },
  { value: "game_tactics", label: "Игрово-тактическа" },
  { value: "physical", label: "Физическа насоченост" },
];
const VARIABILITY_OPTIONS = [
  { value: "stable", label: "Стабилен (по-повтаряем)" },
  { value: "varied", label: "Вариативен (по-различни планове)" },
];

function parseList(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (!raw) return [];
  const s = String(raw);
  return s
    .replace(/\|/g, ",")
    .replace(/;/g, ",")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function includesToken(raw, keywords) {
  const text = String(raw || "").toLowerCase();
  return keywords.some((k) => text.includes(k));
}

function chooseByKeywords(options, keywords, fallbackCount = 2) {
  const matched = options.filter((x) => includesToken(x, keywords));
  if (matched.length) return matched;
  return options.slice(0, fallbackCount);
}

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
  "break point": "Брейк точка",
  break_point: "Брейк точка",
  indoor: "Зала",
  outdoor: "Открито",
};

function toBgLabel(raw) {
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

export default function AIGenerator() {
  const resultsRef = useRef(null);
  const [drills, setDrills] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [previewDrill, setPreviewDrill] = useState(null);
  const [finder, setFinder] = useState({
    search: "",
    level: "all",
    location: "all",
    playersBucket: "all",
    trainingPhase: "all",
    gameForm: "all",
    skills: [],
    sorting: "name_asc",
  });
  const [form, setForm] = useState({
    trainingTitle: "",
    ageRange: "",
    age: 15,
    level: "",
    mainFocus: "",
    secondaryFocus: "",
    periodPhase: "inseason",
    durationTotalMin: 90,
    playersCount: 12,
    intensityTarget: "medium",
    randomSeed: 42,
    orientation: "balanced",
    variability: "varied",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedTraining, setSavedTraining] = useState(null);
  const [editableBlocks, setEditableBlocks] = useState([]);
  const [targetBlockType, setTargetBlockType] = useState("Интеграция");
  const [cardTargetByDrill, setCardTargetByDrill] = useState({});

  const cloneBlocks = (blocks) =>
    (blocks || []).map((b) => ({
      blockType: b.blockType,
      targetMinutes: Number(b.targetMinutes || 0),
      drills: (b.drills || []).map((d) => ({
        drillId: Number(d.drillId),
        name: d.name,
        minutes: Number(d.minutes || 0),
        intensity_type: d.intensity_type || "medium",
        rpe: d.rpe ?? null,
        category: d.category || "",
        why: Array.isArray(d.why) ? d.why : d.why ? [String(d.why)] : [],
        score: Number(d.score || 0),
      })),
    }));

  const rebalanceBlockMinutes = (block) => {
    const drills = [...(block.drills || [])];
    if (!drills.length) return { ...block, drills };
    const target = Number(block.targetMinutes || 0);
    const base = Math.max(3, Math.floor(target / drills.length) || 0);
    const minutes = drills.map(() => base);
    let total = minutes.reduce((a, b) => a + b, 0);
    let idx = 0;
    while (total < target && idx < 500) {
      const pos = idx % minutes.length;
      minutes[pos] += 1;
      total += 1;
      idx += 1;
    }
    while (total > target && idx < 1000) {
      const pos = idx % minutes.length;
      if (minutes[pos] > 3) {
        minutes[pos] -= 1;
        total -= 1;
      }
      idx += 1;
    }
    return {
      ...block,
      drills: drills.map((d, i) => ({ ...d, minutes: minutes[i] })),
    };
  };

  const planBlocks = useMemo(() => {
    if (editableBlocks.length) return editableBlocks;
    return result?.session?.blocks || result?.blocks || [];
  }, [editableBlocks, result]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setMetaLoading(true);
      try {
        let data = [];
        try {
          data = await apiClient(API_PATHS.DRILLS_LIST);
        } catch {
          data = await apiClient(API_PATHS.DRILLS_LIST_ALIAS);
        }
        if (!alive) return;
        setDrills(Array.isArray(data) ? data : []);
      } catch {
        if (!alive) return;
        setDrills([]);
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "bg"));
    const levels = uniq(drills.map((d) => String(d.level || "").trim()));
    const domains = uniq(drills.flatMap((d) => parseList(d.skill_domains)));
    const phases = uniq(drills.flatMap((d) => parseList(d.game_phases)));
    const skills = uniq([
      ...drills.map((d) => String(d.skill_focus || "").trim()),
      ...drills.flatMap((d) => parseList(d.technical_focus)),
      ...drills.flatMap((d) => parseList(d.tactical_focus)),
    ]);
    return { levels, domains, phases, skills };
  }, [drills]);

  const finderOptions = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "bg"));
    const inferLocation = (d) => {
      const text = `${d?.setup || ""} ${d?.description || ""}`.toLowerCase();
      if (text.includes("outdoor") || text.includes("навън") || text.includes("открит")) return "Outdoor";
      return "Indoor";
    };
    const parsePlayers = (raw) => {
      const nums = parseList(raw)
        .join(" ")
        .match(/\d+/g);
      if (!nums || !nums.length) return null;
      const arr = nums.map((x) => Number(x)).filter(Number.isFinite);
      if (!arr.length) return null;
      return Math.max(...arr);
    };
    const playerBucket = (d) => {
      const n = parsePlayers(d?.players);
      if (!n) return "all";
      if (n <= 8) return "<=8";
      if (n <= 12) return "9-12";
      return "13+";
    };
    const skillCounts = {};
    drills.forEach((d) => {
      const skillSet = new Set([
        ...parseList(d?.skill_domains),
        ...parseList(d?.skill_focus),
        ...parseList(d?.technical_focus),
      ]);
      skillSet.forEach((s) => {
        if (!s) return;
        skillCounts[s] = (skillCounts[s] || 0) + 1;
      });
    });
    return {
      levels: ["all", ...options.levels],
      locations: ["all", ...uniq(drills.map(inferLocation))],
      phases: ["all", ...uniq(drills.flatMap((d) => parseList(d?.game_phases)))],
      gameForms: ["all", ...uniq(drills.map((d) => String(d?.type_of_drill || d?.category || "").trim()))],
      skills: Object.entries(skillCounts)
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "bg"))
        .map(([name, count]) => ({ name, count })),
      inferLocation,
      playerBucket,
    };
  }, [drills, options.levels]);

  const filteredFinderDrills = useMemo(() => {
    let list = [...drills];
    const q = finder.search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        `${d?.title || d?.name || ""} ${d?.description || ""}`.toLowerCase().includes(q)
      );
    }
    if (finder.level !== "all") {
      list = list.filter((d) => String(d?.level || "").trim() === finder.level);
    }
    if (finder.location !== "all") {
      list = list.filter((d) => finderOptions.inferLocation(d) === finder.location);
    }
    if (finder.playersBucket !== "all") {
      list = list.filter((d) => finderOptions.playerBucket(d) === finder.playersBucket);
    }
    if (finder.trainingPhase !== "all") {
      list = list.filter((d) => parseList(d?.game_phases).includes(finder.trainingPhase));
    }
    if (finder.gameForm !== "all") {
      list = list.filter((d) => String(d?.type_of_drill || d?.category || "").trim() === finder.gameForm);
    }
    if (finder.skills.length) {
      list = list.filter((d) => {
        const skills = new Set([...parseList(d?.skill_domains), ...parseList(d?.skill_focus), ...parseList(d?.technical_focus)]);
        return finder.skills.some((s) => skills.has(s));
      });
    }

    if (finder.sorting === "name_asc") {
      list.sort((a, b) => String(a?.title || a?.name || "").localeCompare(String(b?.title || b?.name || ""), "bg"));
    } else if (finder.sorting === "name_desc") {
      list.sort((a, b) => String(b?.title || b?.name || "").localeCompare(String(a?.title || a?.name || ""), "bg"));
    } else if (finder.sorting === "level") {
      list.sort((a, b) => String(a?.level || "").localeCompare(String(b?.level || ""), "bg"));
    } else {
      list.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));
    }
    return list;
  }, [drills, finder, finderOptions]);

  const activeFinderTags = useMemo(() => {
    const tags = [];
    if (finder.level !== "all") tags.push({ key: "level", label: `Ниво: ${finder.level}` });
    if (finder.location !== "all") tags.push({ key: "location", label: `Локация: ${toBgLabel(finder.location)}` });
    if (finder.playersBucket !== "all") tags.push({ key: "playersBucket", label: `Играчи: ${finder.playersBucket}` });
    if (finder.trainingPhase !== "all") tags.push({ key: "trainingPhase", label: `Фаза: ${toBgLabel(finder.trainingPhase)}` });
    if (finder.gameForm !== "all") tags.push({ key: "gameForm", label: `Форма: ${toBgLabel(finder.gameForm)}` });
    finder.skills.forEach((s) => tags.push({ key: `skill:${s}`, label: `Умение: ${toBgLabel(s)}` }));
    return tags;
  }, [finder]);

  useEffect(() => {
    if (!form.level && options.levels.length) {
      setForm((prev) => ({ ...prev, level: options.levels[0] }));
    }
    if (!form.mainFocus && options.skills.length) {
      setForm((prev) => ({
        ...prev,
        mainFocus: options.skills[0],
        secondaryFocus: options.skills[1] || options.skills[0],
      }));
    }
  }, [form.level, form.mainFocus, options.levels, options.skills]);

  const payload = useMemo(
    () => ({
      age: form.ageRange || Number(form.age),
      level: String(form.level || "").trim(),
      mainFocus: form.mainFocus,
      secondaryFocus: form.secondaryFocus,
      periodPhase: form.periodPhase,
      durationTotalMin: Number(form.durationTotalMin),
      playersCount: Number(form.playersCount),
      equipmentAvailable: [],
      focusSkills: [form.mainFocus, form.secondaryFocus].filter(Boolean),
      focusDomains:
        form.orientation === "serve_receive"
          ? chooseByKeywords(options.domains, ["прием", "посрещ", "service", "serve"], 3)
          : form.orientation === "attack_block"
            ? chooseByKeywords(options.domains, ["атака", "attack", "блок", "block"], 3)
            : form.orientation === "defense_transition"
              ? chooseByKeywords(options.domains, ["защ", "defense", "dig", "transition"], 3)
              : form.orientation === "game_tactics"
                ? chooseByKeywords(options.domains, ["тактик", "system", "rotation", "игра"], 3)
                : form.orientation === "physical"
                  ? chooseByKeywords(options.domains, ["физ", "conditioning", "speed", "jump", "сил"], 3)
                  : options.domains.slice(0, Math.min(3, options.domains.length)),
      focusGamePhases:
        form.orientation === "serve_receive"
          ? chooseByKeywords(options.phases, ["k1", "sideout", "receive"], 2)
          : form.orientation === "attack_block"
            ? chooseByKeywords(options.phases, ["k2", "transition", "block"], 2)
            : form.orientation === "defense_transition"
              ? chooseByKeywords(options.phases, ["k2", "transition", "counter"], 2)
              : form.orientation === "game_tactics"
                ? chooseByKeywords(options.phases, ["k1", "k2", "rally", "game"], 3)
                : form.orientation === "physical"
                  ? chooseByKeywords(options.phases, ["transition", "rally"], 1)
                  : options.phases.slice(0, Math.min(2, options.phases.length)),
      intensityTarget: form.intensityTarget,
      constraints: {
        excludeDrillIds: [],
        mustIncludeDomains: [],
        maxHighIntensityInRow: 2,
        avoidRepeatSameCategory: true,
      },
      randomSeed: form.randomSeed === "" ? null : Number(form.randomSeed),
    }),
    [form, options.domains, options.phases]
  );

  const resetFinder = () => {
    setFinder({
      search: "",
      level: "all",
      location: "all",
      playersBucket: "all",
      trainingPhase: "all",
      gameForm: "all",
      skills: [],
      sorting: "name_asc",
    });
  };

  const applyFinderToAI = () => {
    setForm((p) => ({
      ...p,
      level: finder.level === "all" ? p.level : finder.level,
      mainFocus: finder.skills.length ? finder.skills[0] : p.mainFocus,
      secondaryFocus: finder.skills.length > 1 ? finder.skills[1] : p.secondaryFocus,
    }));
  };

  const minTwoPerBlockOk = useMemo(() => {
    if (!planBlocks.length) return true;
    return planBlocks.every((b) => (b.drills || []).length >= 2);
  }, [planBlocks]);

  const removeDrillFromBlock = (blockType, drillId) => {
    setEditableBlocks((prev) =>
      prev.map((b) => {
        if (b.blockType !== blockType) return b;
        return rebalanceBlockMinutes({
          ...b,
          drills: (b.drills || []).filter((d) => Number(d.drillId) !== Number(drillId)),
        });
      })
    );
  };

  const moveDrillInsideBlock = (blockType, index, direction) => {
    setEditableBlocks((prev) =>
      prev.map((b) => {
        if (b.blockType !== blockType) return b;
        const drills = [...(b.drills || [])];
        const next = direction === "up" ? index - 1 : index + 1;
        if (next < 0 || next >= drills.length) return b;
        [drills[index], drills[next]] = [drills[next], drills[index]];
        return { ...b, drills };
      })
    );
  };

  const moveDrillToBlock = (fromBlockType, toBlockType, drillId) => {
    if (!toBlockType || fromBlockType === toBlockType) return;
    setEditableBlocks((prev) => {
      let moving = null;
      const removed = prev.map((b) => {
        if (b.blockType !== fromBlockType) return b;
        const nextDrills = [];
        for (const d of b.drills || []) {
          if (!moving && Number(d.drillId) === Number(drillId)) {
            moving = d;
          } else {
            nextDrills.push(d);
          }
        }
        return rebalanceBlockMinutes({ ...b, drills: nextDrills });
      });
      if (!moving) return prev;
      return removed.map((b) => {
        if (b.blockType !== toBlockType) return b;
        return rebalanceBlockMinutes({ ...b, drills: [...(b.drills || []), moving] });
      });
    });
  };

  const addFilteredDrillToBlock = (drill, blockType) => {
    if (!blockType) return;
    const drillId = Number(drill?.id || 0);
    if (!drillId) return;
    setEditableBlocks((prev) =>
      prev.map((b) => {
        if (b.blockType !== blockType) return b;
        if ((b.drills || []).some((d) => Number(d.drillId) === drillId)) return b;
        const added = {
          drillId,
          name: drill?.title || drill?.name || `Упражнение #${drillId}`,
          minutes: 0,
          intensity_type: String(drill?.intensity_type || "medium"),
          rpe: drill?.rpe ?? null,
          category: String(drill?.category || ""),
          why: ["Добавено ръчно от треньора след генериране."],
          score: 0,
        };
        return rebalanceBlockMinutes({ ...b, drills: [...(b.drills || []), added] });
      })
    );
  };

  const onGenerate = async () => {
    setLoading(true);
    setErr("");
    setSavedTraining(null);
    try {
      const effectiveSeed =
        form.variability === "varied"
          ? Math.floor(Date.now() % 1000000)
          : Number(form.randomSeed);
      const data = await apiClient(API_PATHS.AI_TRAINING_GENERATE, {
        method: "POST",
        data: { ...payload, randomSeed: effectiveSeed },
      });
      setResult(data || null);
      const blocks = cloneBlocks(data?.session?.blocks || data?.blocks || []);
      setEditableBlocks(blocks);
      if (blocks.length) setTargetBlockType(blocks[0].blockType);
      setCardTargetByDrill({});
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Грешка при генериране.");
    } finally {
      setLoading(false);
    }
  };

  const onGenerateAndSave = async () => {
    setSaving(true);
    setErr("");
    const customTitle = form.trainingTitle?.trim();
    if (!customTitle) {
      setErr("Моля, въведете име на тренировката преди запис.");
      setSaving(false);
      return;
    }
    try {
      const effectiveSeed =
        form.variability === "varied"
          ? Math.floor(Date.now() % 1000000)
          : Number(form.randomSeed);
      const data = await apiClient(API_PATHS.AI_TRAINING_GENERATE_AND_SAVE, {
        method: "POST",
        data: {
          ...payload,
          randomSeed: effectiveSeed,
          trainingTitle: customTitle,
          trainingStatus: "чернова",
          editedBlocks: editableBlocks.length ? editableBlocks : undefined,
        },
      });
      setResult(data || null);
      const blocks = cloneBlocks(data?.session?.blocks || data?.blocks || []);
      setEditableBlocks(blocks);
      if (blocks.length) setTargetBlockType(blocks[0].blockType);
      setCardTargetByDrill({});
      setSavedTraining(data?.training || null);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Грешка при generate-and-save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>AI генератор на тренировки</h2>
      <div style={{ marginBottom: 10, fontSize: 13, color: "#415472" }}>
        Използва само одобрените упражнения в платформата и ги разпределя по логика в 4 части.
      </div>
      <div style={{ border: "1px solid #dce5f2", borderRadius: 14, padding: 12, background: "#f8fafc", marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Параметри, които влияят на AI генератора</div>
        <div style={{ fontSize: 12, color: "#415472", marginBottom: 8 }}>
          Основни полета: възраст/ниво, фокус, период, време, брой играчи, интензитет, насоченост и вариативност.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <label>
          <div>Име на тренировка (при запис)</div>
          <input
            value={form.trainingTitle}
            placeholder="Напр. U18 - Сервис и посрещане"
            onChange={(e) => setForm((p) => ({ ...p, trainingTitle: e.target.value }))}
            style={{
              border:
                err && !form.trainingTitle?.trim()
                  ? "1px solid #dc2626"
                  : undefined,
            }}
          />
        </label>
        <label>
          <div>Възрастов диапазон</div>
          <select value={form.ageRange} onChange={(e) => setForm((p) => ({ ...p, ageRange: e.target.value }))}>
            <option value="">По конкретна възраст</option>
            <option value="12-14">12-14</option>
            <option value="14-16">14-16</option>
            <option value="16-18">16-18</option>
            <option value="18-22">18-22</option>
          </select>
        </label>
        <label>
          <div>Възраст (ако няма диапазон)</div>
          <select value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: Number(e.target.value) }))}>
            {AGE_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Ниво</div>
          <select value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}>
            {options.levels.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Основен фокус</div>
          <select value={form.mainFocus} onChange={(e) => setForm((p) => ({ ...p, mainFocus: e.target.value }))}>
            {options.skills.map((x) => (
              <option key={x} value={x}>{toBgLabel(x)}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Вторичен фокус</div>
          <select value={form.secondaryFocus} onChange={(e) => setForm((p) => ({ ...p, secondaryFocus: e.target.value }))}>
            {options.skills.map((x) => (
              <option key={x} value={x}>{toBgLabel(x)}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Период</div>
          <select value={form.periodPhase} onChange={(e) => setForm((p) => ({ ...p, periodPhase: e.target.value }))}>
            {PERIODS.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Обща продължителност (мин)</div>
          <select value={form.durationTotalMin} onChange={(e) => setForm((p) => ({ ...p, durationTotalMin: Number(e.target.value) }))}>
            {DURATION_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Брой играчи</div>
          <select value={form.playersCount} onChange={(e) => setForm((p) => ({ ...p, playersCount: Number(e.target.value) }))}>
            {PLAYERS_OPTIONS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Интензитет</div>
          <select value={form.intensityTarget} onChange={(e) => setForm((p) => ({ ...p, intensityTarget: e.target.value }))}>
            {INTENSITIES.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Насоченост</div>
          <select value={form.orientation} onChange={(e) => setForm((p) => ({ ...p, orientation: e.target.value }))}>
            {ORIENTATION_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        <label>
          <div>Вариативност</div>
          <select value={form.variability} onChange={(e) => setForm((p) => ({ ...p, variability: e.target.value }))}>
            {VARIABILITY_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        {form.variability === "stable" && (
          <label>
            <div>Фиксиран seed</div>
            <select value={form.randomSeed} onChange={(e) => setForm((p) => ({ ...p, randomSeed: Number(e.target.value) }))}>
              {SEED_OPTIONS.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        </div>
      </div>
      <div style={{ border: "1px solid #dce5f2", borderRadius: 14, padding: 12, background: "#f8fafc", marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Филтри за преглед на упражнения (не влияят директно на AI)</div>
        <div style={{ fontSize: 12, color: "#415472", marginBottom: 8 }}>
          Тези филтри са за бърз преглед на базата. Може да прехвърлиш ниво и избрани умения към AI.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <label>
            <div>Търсене по име</div>
            <input
              value={finder.search}
              placeholder="Въведи ключови думи"
              onChange={(e) => setFinder((p) => ({ ...p, search: e.target.value }))}
            />
          </label>
          <label>
            <div>Ниво</div>
            <select value={finder.level} onChange={(e) => setFinder((p) => ({ ...p, level: e.target.value }))}>
              {finderOptions.levels.map((x) => (
                <option key={x} value={x}>{x === "all" ? "Всички" : x}</option>
              ))}
            </select>
          </label>
          <label>
            <div>Локация</div>
            <select value={finder.location} onChange={(e) => setFinder((p) => ({ ...p, location: e.target.value }))}>
              {finderOptions.locations.map((x) => (
                <option key={x} value={x}>{x === "all" ? "Всички" : toBgLabel(x)}</option>
              ))}
            </select>
          </label>
          <label>
            <div>Брой играчи</div>
            <select value={finder.playersBucket} onChange={(e) => setFinder((p) => ({ ...p, playersBucket: e.target.value }))}>
              <option value="all">Всички</option>
              <option value="<=8">&lt;=8</option>
              <option value="9-12">9-12</option>
              <option value="13+">13+</option>
            </select>
          </label>
          <label>
            <div>Фаза на тренировка</div>
            <select value={finder.trainingPhase} onChange={(e) => setFinder((p) => ({ ...p, trainingPhase: e.target.value }))}>
              {finderOptions.phases.map((x) => (
                <option key={x} value={x}>{x === "all" ? "Всички" : toBgLabel(x)}</option>
              ))}
            </select>
          </label>
          <label>
            <div>Игрови форми</div>
            <select value={finder.gameForm} onChange={(e) => setFinder((p) => ({ ...p, gameForm: e.target.value }))}>
              {finderOptions.gameForms.map((x) => (
                <option key={x} value={x}>{x === "all" ? "Всички" : toBgLabel(x)}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 8, border: "1px solid #dce5f2", borderRadius: 10, padding: 8, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Умения</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, maxHeight: 170, overflow: "auto" }}>
            {finderOptions.skills.map((s) => (
              <label key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={finder.skills.includes(s.name)}
                  onChange={() => setFinder((p) => ({ ...p, skills: toggleInArray(p.skills, s.name) }))}
                />
                <span>{toBgLabel(s.name)} ({s.count})</span>
              </label>
            ))}
          </div>
        </div>
        {activeFinderTags.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activeFinderTags.map((t) => (
              <span key={t.key} style={{ background: "#111827", color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
                {t.label}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={resetFinder}>Изчисти филтри</button>
          <button onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}>Към резултатите</button>
          <button onClick={applyFinderToAI}>Прехвърли ниво и умения към AI</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={onGenerate}
          disabled={loading || saving || metaLoading}
          style={{ fontSize: 16, fontWeight: 800, padding: "12px 20px", background: "#0f4ea8", color: "#fff", border: "none", borderRadius: 10 }}
        >
          {loading ? "Генериране..." : "Генерирай"}
        </button>
        <button
          onClick={onGenerateAndSave}
          disabled={loading || saving || metaLoading}
          style={{ fontSize: 16, fontWeight: 800, padding: "12px 20px", background: "#0a7a2f", color: "#fff", border: "none", borderRadius: 10 }}
        >
          {saving ? "Запис..." : "Запази"}
        </button>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{String(err)}</div>}
      {savedTraining?.id && (
        <div style={{ marginTop: 8, color: "#0a6b1f", fontWeight: 700 }}>
          Записано като тренировка #{savedTraining.id}: {savedTraining.title}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div style={{ border: "1px dashed #9cb4d8", borderRadius: 10, padding: 8, background: "#f6f9ff" }}>
            <b>Ръчна редакция след генериране:</b> може да местиш, премахваш и добавяш упражнения от картите по-долу.
          </div>
          {result?.фокус?.основен && (
            <div>
              <b>Фокус:</b> основен <b>{result.фокус.основен}</b>, вторичен <b>{result.фокус.вторичен || "—"}</b>
            </div>
          )}
          <div>
            <b>Общо минути:</b> {(result?.session?.totalMinutes ?? result.totalMinutes)} | <b>Време ОК:</b> {String(result?.session?.checks?.minutesOk ?? result?.checks?.minutesOk)} |{" "}
            <b>Покритие на основния фокус:</b> {String(result?.session?.checks?.primaryFocusRatio ?? "—")}
          </div>
          {!minTwoPerBlockOk && (
            <div style={{ color: "#8a5300", background: "#fff4d9", border: "1px solid #ffd27d", borderRadius: 10, padding: 8 }}>
              Внимание: в някоя част има под 2 упражнения. Използвай друга насоченост/вариативност и генерирай отново.
            </div>
          )}
          {planBlocks.map((b) => (
            <div key={b.blockType} style={{ border: "1px solid #dce5f2", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ fontWeight: 900 }}>{b.blockType} ({b.targetMinutes} мин)</div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {b.drills?.map((d, idx) => (
                  <div key={`${b.blockType}-${d.drillId}`} style={{ background: "#f8fbff", border: "1px solid #ebf1f7", borderRadius: 10, padding: 8 }}>
                    <div style={{ fontWeight: 800 }}>
                      #{d.drillId} {d.name} — {d.minutes} мин
                    </div>
                    <div style={{ fontSize: 13, color: "#415472" }}>
                      интензитет: {d.intensity_type} | оценка: {d.score}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <button onClick={() => moveDrillInsideBlock(b.blockType, idx, "up")} disabled={idx === 0}>Нагоре</button>
                      <button onClick={() => moveDrillInsideBlock(b.blockType, idx, "down")} disabled={idx === (b.drills?.length || 0) - 1}>Надолу</button>
                      <button onClick={() => removeDrillFromBlock(b.blockType, d.drillId)} style={{ color: "#9f1239" }}>Премахни</button>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Премести в:</span>
                        <select
                          defaultValue={b.blockType}
                          onChange={(e) => moveDrillToBlock(b.blockType, e.target.value, d.drillId)}
                        >
                          {planBlocks.map((target) => (
                            <option key={target.blockType} value={target.blockType}>{target.blockType}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {(d.why || []).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={resultsRef} style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Резултати от филтъра</h3>
          <label>
            <span style={{ marginRight: 6 }}>Сортиране</span>
            <select value={finder.sorting} onChange={(e) => setFinder((p) => ({ ...p, sorting: e.target.value }))}>
              <option value="name_asc">Име А-Я</option>
              <option value="name_desc">Име Я-А</option>
              <option value="level">Ниво</option>
              <option value="newest">Най-нови</option>
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
          {filteredFinderDrills.slice(0, 60).map((d) => {
            const media = getDrillPrimaryMedia(d);
            return (
              <div key={d.id} style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #dce5f2", background: "#fff" }}>
                <button onClick={() => setPreviewDrill(d)} style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", background: "#0b1c34" }}>
                  {media?.type === "image" ? (
                    <img src={media.src} alt={d.title || d.name} style={{ width: "100%", height: 180, objectFit: "cover", opacity: 0.82 }} />
                  ) : (
                    <div style={{ width: "100%", height: 180, display: "grid", placeItems: "center", color: "#fff" }}>ПРЕГЛЕД</div>
                  )}
                </button>
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309" }}>
                    {d.level || "Всички нива"}{d.category ? `, ${d.category}` : ""}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{d.title || d.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => setPreviewDrill(d)}>Преглед</button>
                    {planBlocks.length > 0 && (
                      <>
                        <select
                          value={cardTargetByDrill[d.id] || targetBlockType}
                          onChange={(e) =>
                            setCardTargetByDrill((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                        >
                          {planBlocks.map((b) => (
                            <option key={b.blockType} value={b.blockType}>
                              {b.blockType}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => addFilteredDrillToBlock(d, cardTargetByDrill[d.id] || targetBlockType)}>
                          Добави в
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {previewDrill && <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} />}
    </div>
  );
}

