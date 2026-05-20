import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

const PERIODS = [
  { value: "prep", label: "РџРѕРґРіРѕС‚РѕРІРёС‚РµР»РµРЅ РїРµСЂРёРѕРґ" },
  { value: "inseason", label: "РЎСЉСЃС‚РµР·Р°С‚РµР»РµРЅ РїРµСЂРёРѕРґ" },
  { value: "taper", label: "РџРёРєРѕРІР° С„РѕСЂРјР°" },
  { value: "offseason", label: "РџСЂРµС…РѕРґРµРЅ РїРµСЂРёРѕРґ" },
];

const INTENSITIES = [
  { value: "low", label: "РќРёСЃСЉРє" },
  { value: "medium", label: "РЎСЂРµРґРµРЅ" },
  { value: "high", label: "Р’РёСЃРѕРє" },
];

const DURATION_OPTIONS = [60, 75, 90, 105, 120];
const PLAYERS_OPTIONS = [6, 8, 10, 12, 14, 16, 18];
const AGE_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 10);
const SEED_OPTIONS = [7, 42, 99, 2026];
const ORIENTATION_OPTIONS = [
  { value: "balanced", label: "Р‘Р°Р»Р°РЅСЃРёСЂР°РЅР°" },
  { value: "serve_receive", label: "РЎРµСЂРІРёСЃ / РџРѕСЃСЂРµС‰Р°РЅРµ" },
  { value: "attack_block", label: "РђС‚Р°РєР° / Р‘Р»РѕРє" },
  { value: "defense_transition", label: "Р—Р°С‰РёС‚Р° / РџСЂРµС…РѕРґ" },
  { value: "game_tactics", label: "РРіСЂРѕРІРѕ-С‚Р°РєС‚РёС‡РµСЃРєР°" },
  { value: "physical", label: "Р¤РёР·РёС‡РµСЃРєР° РЅР°СЃРѕС‡РµРЅРѕСЃС‚" },
];
const VARIABILITY_OPTIONS = [
  { value: "stable", label: "РЎС‚Р°Р±РёР»РµРЅ (РїРѕ-РїРѕРІС‚Р°СЂСЏРµРј)" },
  { value: "varied", label: "Р’Р°СЂРёР°С‚РёРІРµРЅ (РїРѕ-СЂР°Р·Р»РёС‡РЅРё РїР»Р°РЅРѕРІРµ)" },
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
  attack: "РђС‚Р°РєР°",
  defense: "Р—Р°С‰РёС‚Р°",
  defence: "Р—Р°С‰РёС‚Р°",
  receive: "РџРѕСЃСЂРµС‰Р°РЅРµ",
  reception: "РџРѕСЃСЂРµС‰Р°РЅРµ",
  "serve receive": "РџРѕСЃСЂРµС‰Р°РЅРµ",
  serve: "РЎРµСЂРІРёСЃ",
  service: "РЎРµСЂРІРёСЃ",
  block: "Р‘Р»РѕРє",
  setting: "Р Р°Р·РїСЂРµРґРµР»РµРЅРёРµ",
  set: "Р Р°Р·РїСЂРµРґРµР»РµРЅРёРµ",
  pass: "Р Р°Р·РїСЂРµРґРµР»РµРЅРёРµ",
  passing: "Р Р°Р·РїСЂРµРґРµР»РµРЅРёРµ",
  transition: "РџСЂРµС…РѕРґ",
  counter: "РљРѕРЅС‚СЂР°Р°С‚Р°РєР°",
  rally: "Р Р°Р·РёРіСЂР°РІР°РЅРµ",
  game: "РРіСЂР°",
  "break point": "Р‘СЂРµР№Рє С‚РѕС‡РєР°",
  break_point: "Р‘СЂРµР№Рє С‚РѕС‡РєР°",
  indoor: "Р—Р°Р»Р°",
  outdoor: "РћС‚РєСЂРёС‚Рѕ",
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
  const { user } = useAuth();
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
  const [targetBlockType, setTargetBlockType] = useState("РРЅС‚РµРіСЂР°С†РёСЏ");
  const [cardTargetByDrill, setCardTargetByDrill] = useState({});
  const [assignCoaches, setAssignCoaches] = useState([]);
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [clubCoaches, setClubCoaches] = useState([]);

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
      if (text.includes("outdoor") || text.includes("РЅР°РІСЉРЅ") || text.includes("РѕС‚РєСЂРёС‚")) return "Outdoor";
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
    if (finder.level !== "all") tags.push({ key: "level", label: `РќРёРІРѕ: ${finder.level}` });
    if (finder.location !== "all") tags.push({ key: "location", label: `Р›РѕРєР°С†РёСЏ: ${toBgLabel(finder.location)}` });
    if (finder.playersBucket !== "all") tags.push({ key: "playersBucket", label: `РРіСЂР°С‡Рё: ${finder.playersBucket}` });
    if (finder.trainingPhase !== "all") tags.push({ key: "trainingPhase", label: `Р¤Р°Р·Р°: ${toBgLabel(finder.trainingPhase)}` });
    if (finder.gameForm !== "all") tags.push({ key: "gameForm", label: `Р¤РѕСЂРјР°: ${toBgLabel(finder.gameForm)}` });
    finder.skills.forEach((s) => tags.push({ key: `skill:${s}`, label: `РЈРјРµРЅРёРµ: ${toBgLabel(s)}` }));
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
          ? chooseByKeywords(options.domains, ["РїСЂРёРµРј", "РїРѕСЃСЂРµС‰", "service", "serve"], 3)
          : form.orientation === "attack_block"
            ? chooseByKeywords(options.domains, ["Р°С‚Р°РєР°", "attack", "Р±Р»РѕРє", "block"], 3)
            : form.orientation === "defense_transition"
              ? chooseByKeywords(options.domains, ["Р·Р°С‰", "defense", "dig", "transition"], 3)
              : form.orientation === "game_tactics"
                ? chooseByKeywords(options.domains, ["С‚Р°РєС‚РёРє", "system", "rotation", "РёРіСЂР°"], 3)
                : form.orientation === "physical"
                  ? chooseByKeywords(options.domains, ["С„РёР·", "conditioning", "speed", "jump", "СЃРёР»"], 3)
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
          name: drill?.title || drill?.name || `РЈРїСЂР°Р¶РЅРµРЅРёРµ #${drillId}`,
          minutes: 0,
          intensity_type: String(drill?.intensity_type || "medium"),
          rpe: drill?.rpe ?? null,
          category: String(drill?.category || ""),
          why: ["Р”РѕР±Р°РІРµРЅРѕ СЂСЉС‡РЅРѕ РѕС‚ С‚СЂРµРЅСЊРѕСЂР° СЃР»РµРґ РіРµРЅРµСЂРёСЂР°РЅРµ."],
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
      setErr(e?.response?.data?.detail || e?.message || "Р“СЂРµС€РєР° РїСЂРё РіРµРЅРµСЂРёСЂР°РЅРµ.");
    } finally {
      setLoading(false);
    }
  };

  const onGenerateAndSave = async () => {
    setSaving(true);
    setErr("");
    const customTitle = form.trainingTitle?.trim();
    if (!customTitle) {
      setErr("РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РёРјРµ РЅР° С‚СЂРµРЅРёСЂРѕРІРєР°С‚Р° РїСЂРµРґРё Р·Р°РїРёСЃ.");
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
          trainingStatus: "С‡РµСЂРЅРѕРІР°",
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
      setErr(e?.response?.data?.detail || e?.message || "Р“СЂРµС€РєР° РїСЂРё generate-and-save.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "settings", label: "РќР°СЃС‚СЂРѕР№РєРё" },
    { id: "library", label: "Р‘Р°Р·Р° СѓРїСЂР°Р¶РЅРµРЅРёСЏ" },
    { id: "plan", label: "РџР»Р°РЅ", badge: planBlocks.length || null },
    { id: "save", label: "Р—Р°РїРёСЃ" },
  ];

  const openDrillPreview = (drillOrId) => {
    if (!drillOrId) return;
    if (typeof drillOrId === "object") {
      setPreviewDrill(drillOrId);
      return;
    }
    const full = drillById[Number(drillOrId)];
    if (full) setPreviewDrill(full);
    else setPreviewDrill({ id: drillOrId, title: `РЈРїСЂР°Р¶РЅРµРЅРёРµ #${drillOrId}` });
  };

  return (
    <div className="aiGenPage">
      <PageHero
        title="AI РіРµРЅРµСЂР°С‚РѕСЂ РЅР° С‚СЂРµРЅРёСЂРѕРІРєРё"
        subtitle="РР·РїРѕР»Р·РІР° РѕРґРѕР±СЂРµРЅРёС‚Рµ СѓРїСЂР°Р¶РЅРµРЅРёСЏ Рё РіРё СЂР°Р·РїСЂРµРґРµР»СЏ РІ 4 С‡Р°СЃС‚Рё РЅР° С‚СЂРµРЅРёСЂРѕРІРєР°С‚Р°."
        actions={
          <Button as={Link} to="/my-trainings" size="sm" variant="secondary">
            в†ђ РњРѕРёС‚Рµ С‚СЂРµРЅРёСЂРѕРІРєРё
          </Button>
        }
      />

      <nav className="aiGenTabs" aria-label="РЎРµРєС†РёРё РЅР° РіРµРЅРµСЂР°С‚РѕСЂР°">
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

      {err ? <div className="aiGenError">{String(err)}</div> : null}
      {savedTraining?.id ? (
        <div className="aiGenSuccess">
          Р—Р°РїРёСЃР°РЅРѕ РєР°С‚Рѕ С‚СЂРµРЅРёСЂРѕРІРєР° #{savedTraining.id}: {savedTraining.title}
          {isHeadCoachUser && assignCoaches.length > 0 ? " вЂў Р’СЉР·Р»РѕР¶РµРЅР° РєР°С‚Рѕ Р·Р°РґР°С‡Р°." : ""}
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

      <div className="aiGenStickyBar" role="toolbar" aria-label="Р”РµР№СЃС‚РІРёСЏ">
        {(activeTab === "settings" || activeTab === "plan") && (
          <button type="button" className="aiGenBtn aiGenBtn--primary" onClick={onGenerate} disabled={loading || saving || metaLoading}>
            {loading ? "Р“РµРЅРµСЂРёСЂР°РЅРµ..." : "Р“РµРЅРµСЂРёСЂР°Р№"}
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
          {saving ? "Р—Р°РїРёСЃ..." : "Р—Р°РїР°Р·Рё"}
        </button>
      </div>

      {previewDrill ? <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} /> : null}
    </div>
  );
}
