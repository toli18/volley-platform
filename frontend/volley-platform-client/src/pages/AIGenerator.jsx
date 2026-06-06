import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import DrillMediaPreviewModal from "../components/DrillMediaPreviewModal";
import {
  AIGeneratorLibraryPanel,
  AIGeneratorPlanPanel,
  AIGeneratorSavePanel,
  AIGeneratorSettingsPanel,
} from "../components/ai/AIGeneratorPanels";
import { Button, PageHero } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import {
  buildSelectableSkills,
  getDrillCanonicalSkills,
  matchSkillQuery,
  resolveToSelectableSkill,
} from "../utils/skillCanonical";

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

const AGE_BAND_TO_YEARS = { mini: 11, U13: 13, U14: 14, U15: 15, U16: 16, U17: 17, U18: 18 };

export default function AIGenerator() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isHeadCoachUser = String(user?.role || "").toLowerCase() === "club_head_coach";
  const planRef = useRef(null);
  const [activeTab, setActiveTab] = useState("settings");
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
  const [assignCoaches, setAssignCoaches] = useState([]);
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [clubCoaches, setClubCoaches] = useState([]);
  const [cycleParams, setCycleParams] = useState({
    ageBand: "",
    cycleId: null,
    cycleWeek: null,
    cycleDay: null,
    textbookSlug: "",
  });
  const [bvfMethodHint, setBvfMethodHint] = useState(null);
  const assignmentId = searchParams.get("assignmentId") || "";

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
      textDrills: (b.textDrills || []).map((td) => ({
        title: td.title,
        instructions: td.instructions,
        minutes: Number(td.minutes || 0),
        skill: td.skill,
        source: td.source,
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

  const drillById = useMemo(() => {
    const map = {};
    drills.forEach((d) => {
      if (d?.id != null) map[Number(d.id)] = d;
    });
    return map;
  }, [drills]);

  const goToPlan = () => {
    setActiveTab("plan");
    requestAnimationFrame(() => {
      planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const toggleAssignCoach = (id) => {
    const key = String(id);
    setAssignCoaches((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

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

  useEffect(() => {
    const ageBand = (searchParams.get("ageBand") || "").trim();
    const cycleIdRaw = (searchParams.get("cycleId") || "").trim();
    const cycleWeekRaw = (searchParams.get("cycleWeek") || "").trim();
    const cycleDayRaw = (searchParams.get("cycleDay") || "").trim();
    const textbookSlug = (searchParams.get("textbookSlug") || "").trim();
    if (!ageBand && !cycleIdRaw && !textbookSlug) return;

    const band = ageBand || "U14";
    const cycleId = cycleIdRaw ? Number(cycleIdRaw) : null;
    const cycleWeek = cycleWeekRaw ? Number(cycleWeekRaw) : null;
    const cycleDay = cycleDayRaw ? Number(cycleDayRaw) : null;
    const ageYears = AGE_BAND_TO_YEARS[band] ?? 14;

    setCycleParams({
      ageBand: band,
      cycleId: Number.isFinite(cycleId) ? cycleId : null,
      cycleWeek,
      cycleDay: Number.isFinite(cycleDay) ? cycleDay : null,
      textbookSlug,
    });
    setForm((prev) => ({ ...prev, ageRange: band, age: ageYears }));

    let alive = true;
    (async () => {
      try {
        const ctx = await apiClient(API_PATHS.NATIONAL_METHOD_CONTEXT, {
          params: {
            age_band: band,
            ...(cycleId ? { cycle_id: cycleId } : {}),
            ...(cycleWeek ? { cycle_week: cycleWeek } : {}),
            ...(cycleDay ? { cycle_day: cycleDay } : {}),
            ...(textbookSlug ? { textbook_slug: textbookSlug } : {}),
          },
        });
        if (!alive) return;
        setBvfMethodHint(ctx);
      } catch {
        if (alive) setBvfMethodHint(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!isHeadCoachUser) {
      setClubCoaches([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);
        const overview = await apiClient(API_PATHS.CLUB_OVERVIEW, {
          params: { month_key: month, from_date: today, to_date: today },
        });
        if (!alive) return;
        const coaches = Array.isArray(overview?.coaches) ? overview.coaches.filter((c) => c.role === "coach") : [];
        setClubCoaches(coaches);
      } catch {
        if (!alive) return;
        setClubCoaches([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isHeadCoachUser]);

  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "bg"));
    const levels = uniq(drills.map((d) => String(d.level || "").trim()));
    const domains = uniq(drills.flatMap((d) => parseList(d.skill_domains)));
    const phases = uniq(drills.flatMap((d) => parseList(d.game_phases)));
    const skills = buildSelectableSkills(drills);
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
      getDrillCanonicalSkills(d).forEach((s) => {
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
  }, [form.level, options.levels]);

  useEffect(() => {
    if (!options.skills.length) return;
    setForm((prev) => {
      const selectable = options.skills;
      let main = resolveToSelectableSkill(prev.mainFocus, selectable) || selectable[0];
      let sec =
        resolveToSelectableSkill(prev.secondaryFocus, selectable) ||
        selectable.find((s) => s !== main) ||
        selectable[0];
      if (main === sec && selectable.length > 1) {
        sec = selectable.find((s) => s !== main) ?? sec;
      }
      if (main === prev.mainFocus && sec === prev.secondaryFocus) return prev;
      return { ...prev, mainFocus: main, secondaryFocus: sec };
    });
  }, [options.skills]);

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
      ageBand: cycleParams.ageBand || undefined,
      cycleId: cycleParams.cycleId || undefined,
      cycleWeek: cycleParams.cycleWeek ?? undefined,
      cycleDay: cycleParams.cycleDay ?? undefined,
      textbookSlug: cycleParams.textbookSlug || undefined,
    }),
    [form, options.domains, options.phases, cycleParams]
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
      mainFocus: finder.skills.length
        ? resolveToSelectableSkill(finder.skills[0], options.skills) || finder.skills[0]
        : p.mainFocus,
      secondaryFocus: finder.skills.length > 1
        ? resolveToSelectableSkill(finder.skills[1], options.skills) || finder.skills[1]
        : p.secondaryFocus,
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
      goToPlan();
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
      setActiveTab("save");
      if (isHeadCoachUser && (assignCoaches || []).length > 0 && data?.training?.id) {
        await apiClient(API_PATHS.CLUB_TRAINING_ASSIGNMENTS_CREATE, {
          method: "POST",
          data: {
            training_id: Number(data.training.id),
            assignee_ids: assignCoaches.map((x) => Number(x)),
            due_date: assignDueDate || null,
            note: assignNote || null,
          },
        });
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Грешка при запис (generate-and-save).");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "settings", label: "Настройки" },
    { id: "library", label: "База упражнения" },
    { id: "plan", label: "План", badge: planBlocks.length || null },
    { id: "save", label: "Запис" },
  ];

  const openDrillPreview = (drillOrId) => {
    if (!drillOrId) return;
    if (typeof drillOrId === "object") {
      setPreviewDrill(drillOrId);
      return;
    }
    const full = drillById[Number(drillOrId)];
    if (full) setPreviewDrill(full);
    else setPreviewDrill({ id: drillOrId, title: `Упражнение #${drillOrId}` });
  };

  return (
    <div className="aiGenPage">
      <PageHero
        title="AI генератор на тренировки"
        subtitle={
          bvfMethodHint?.week?.theme
            ? `Методика БФВ · ${cycleParams.ageBand || bvfMethodHint.age_band} · седмица: ${bvfMethodHint.week.theme} — план + упражнения от базата.`
            : cycleParams.ageBand
              ? `Методика БФВ за ${cycleParams.ageBand} — структуриран план и предложения от одобрената база.`
              : "Структуриран текстов план по методика БФВ + упражнения от одобрената база (не статии за четене)."
        }
        actions={
          <Button as={Link} to="/my-trainings" size="sm" variant="secondary">
            ← Моите тренировки
          </Button>
        }
      />

      <nav className="aiGenTabs" aria-label="Секции на генератора">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`aiGenTab${activeTab === t.id ? " aiGenTab--active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.badge ? <span className="aiGenTabBadge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {assignmentId ? (
        <div className="aiGenBvfBanner" role="note">
          <strong>Задача от главния треньор</strong>
          <span>Генерирайте план по зададените цикъл и седмица, после запазете тренировката.</span>
        </div>
      ) : null}

      {bvfMethodHint?.principles?.length || bvfMethodHint?.textbook ? (
        <div className="aiGenBvfBanner" role="note">
          <strong>Контекст от националната методика</strong>
          <span>
            {bvfMethodHint.textbook?.title
              ? `Учебник: ${bvfMethodHint.textbook.title}${bvfMethodHint.textbook.session_code ? ` (${bvfMethodHint.textbook.session_code})` : ""}`
              : bvfMethodHint.day?.label
                ? `Седмица ${cycleParams.cycleWeek || bvfMethodHint.week?.week} · ${bvfMethodHint.day.label}: ${bvfMethodHint.day.theme || ""}`
                : bvfMethodHint.week?.theme
                  ? `Седмица ${cycleParams.cycleWeek || bvfMethodHint.week.week}: ${bvfMethodHint.week.theme}`
                  : `Възраст ${bvfMethodHint.age_band}`}
            {" · "}
            AI използва учебника и методиката при генериране.
          </span>
        </div>
      ) : null}

      {err ? <div className="aiGenError">{String(err)}</div> : null}
      {savedTraining?.id ? (
        <div className="aiGenSuccess">
          Записано като тренировка #{savedTraining.id}: {savedTraining.title}
          {isHeadCoachUser && assignCoaches.length > 0 ? " • Възложена като задача." : ""}
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <AIGeneratorSettingsPanel
          form={form}
          setForm={setForm}
          options={options}
          PERIODS={PERIODS}
          INTENSITIES={INTENSITIES}
          DURATION_OPTIONS={DURATION_OPTIONS}
          PLAYERS_OPTIONS={PLAYERS_OPTIONS}
          AGE_OPTIONS={AGE_OPTIONS}
          SEED_OPTIONS={SEED_OPTIONS}
          ORIENTATION_OPTIONS={ORIENTATION_OPTIONS}
          VARIABILITY_OPTIONS={VARIABILITY_OPTIONS}
          toBgLabel={toBgLabel}
          matchSkillQuery={matchSkillQuery}
        />
      ) : null}

      {activeTab === "library" ? (
        <AIGeneratorLibraryPanel
          finder={finder}
          setFinder={setFinder}
          finderOptions={finderOptions}
          activeFinderTags={activeFinderTags}
          filteredFinderDrills={filteredFinderDrills}
          planBlocks={planBlocks}
          cardTargetByDrill={cardTargetByDrill}
          setCardTargetByDrill={setCardTargetByDrill}
          targetBlockType={targetBlockType}
          toggleInArray={toggleInArray}
          toBgLabel={toBgLabel}
          resetFinder={resetFinder}
          applyFinderToAI={() => {
            applyFinderToAI();
            setActiveTab("settings");
          }}
          setActiveTab={setActiveTab}
          onPreview={openDrillPreview}
          addFilteredDrillToBlock={(d, block) => {
            addFilteredDrillToBlock(d, block);
            setActiveTab("plan");
          }}
        />
      ) : null}

      {activeTab === "plan" ? (
        <AIGeneratorPlanPanel
          planRef={planRef}
          result={result}
          trainingPlanText={result?.trainingPlanText}
          planBlocks={planBlocks}
          minTwoPerBlockOk={minTwoPerBlockOk}
          openDrillPreview={openDrillPreview}
          moveDrillInsideBlock={moveDrillInsideBlock}
          removeDrillFromBlock={removeDrillFromBlock}
          moveDrillToBlock={moveDrillToBlock}
          onGenerate={onGenerate}
          loading={loading}
          metaLoading={metaLoading}
        />
      ) : null}

      {activeTab === "save" ? (
        <AIGeneratorSavePanel
          form={form}
          setForm={setForm}
          err={err}
          isHeadCoachUser={isHeadCoachUser}
          clubCoaches={clubCoaches}
          assignCoaches={assignCoaches}
          toggleAssignCoach={toggleAssignCoach}
          assignDueDate={assignDueDate}
          setAssignDueDate={setAssignDueDate}
          assignNote={assignNote}
          setAssignNote={setAssignNote}
          savedTraining={savedTraining}
          planBlocks={planBlocks}
          setActiveTab={setActiveTab}
        />
      ) : null}

      <div className="aiGenStickyBar" role="toolbar" aria-label="Действия">
        {(activeTab === "settings" || activeTab === "plan") && (
          <button type="button" className="aiGenBtn aiGenBtn--primary" onClick={onGenerate} disabled={loading || saving || metaLoading}>
            {loading ? "Генериране..." : "Генерирай"}
          </button>
        )}
        <button
          type="button"
          className="aiGenBtn aiGenBtn--save"
          onClick={() => {
            if (!form.trainingTitle?.trim()) setActiveTab("save");
            onGenerateAndSave();
          }}
          disabled={loading || saving || metaLoading}
        >
          {saving ? "Запис..." : "Запази"}
        </button>
      </div>

      {previewDrill ? <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} /> : null}
    </div>
  );
}
