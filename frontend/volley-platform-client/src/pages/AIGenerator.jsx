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
import CoachAssistantChat from "../components/ai/CoachAssistantChat";
import { Button, PageHero } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import {
  buildSelectableSkills,
  getDrillCanonicalSkills,
  matchSkillQuery,
  resolveToSelectableSkill,
} from "../utils/skillCanonical";
import { AGE_BAND_TO_YEARS, FORM_AGE_YEAR_OPTIONS } from "../utils/ageBands";
import { normalizeError } from "../utils/normalizeError";

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
const AGE_OPTIONS = FORM_AGE_YEAR_OPTIONS;
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

function mapProgramFocusToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  // Игнорирай методически етикети, които не са умения (темпо, тапер, контрол…)
  if (
    low.includes("темпо") ||
    low.includes("тапер") ||
    low.includes("контрол") ||
    low.includes("акцент") ||
    low.includes("специалн") ||
    low.includes("подготов") ||
    low.includes("интеграц")
  ) {
    return null;
  }
  if (low.includes("посрещ") || low.includes("прием") || low.includes("reception")) return "Посрещане";
  if (low.includes("разпредел") || low.includes("setter") || low.includes("сетър") || low.includes("подав"))
    return "Разпределение";
  if (low.includes("сервис") || low.includes("начален") || low.includes("serve")) return "Сервис";
  if (low.includes("атак") || low.includes("напад") || low.includes("attack")) return "Атака";
  if (low.includes("блок") || low.includes("block")) return "Блок";
  if (low.includes("защит") || low.includes("defense") || low.includes("диг")) return "Защита";
  if (low.includes("преход") || low.includes("контра")) return "Преход";
  if (low.includes("коорд") || low.includes("отскок") || low.includes("физи") || low.includes("сил"))
    return "Координация";
  if (low.includes("игра") || low.includes("rally")) return "Игра";
  const canon = ["Посрещане", "Разпределение", "Сервис", "Атака", "Блок", "Защита", "Преход", "Координация", "Игра"];
  if (canon.includes(raw)) return raw;
  return null;
}

function mapProgramFocusList(tokens) {
  const mapped = [];
  for (const t of tokens || []) {
    const m = mapProgramFocusToken(t);
    if (m && !mapped.includes(m)) mapped.push(m);
  }
  return mapped;
}

const PERIOD_OK = new Set(["prep", "inseason", "taper", "offseason"]);
const INTENSITY_OK = new Set(["low", "medium", "high"]);

function sanitizeGenerateBody(raw) {
  const body = { ...(raw || {}) };
  // UI-only fields — не са в GenerateRequest / GenerateAndSaveRequest schema
  delete body.orientation;
  delete body.variability;
  delete body.ageRange;

  if (body.periodPhase != null && !PERIOD_OK.has(String(body.periodPhase))) {
    const low = String(body.periodPhase).toLowerCase();
    if (low.includes("подготов")) body.periodPhase = "prep";
    else if (low.includes("преход")) body.periodPhase = "offseason";
    else if (low.includes("пик") || low.includes("облекч") || low.includes("taper")) body.periodPhase = "taper";
    else body.periodPhase = "inseason";
  }
  if (body.intensityTarget != null && !INTENSITY_OK.has(String(body.intensityTarget))) {
    const low = String(body.intensityTarget).toLowerCase();
    if (low.includes("нис") || low.includes("лек") || low.includes("low")) body.intensityTarget = "low";
    else if (low.includes("вис") || low.includes("теж") || low.includes("high")) body.intensityTarget = "high";
    else body.intensityTarget = "medium";
  }

  if (body.level == null || String(body.level).trim() === "") body.level = "all";
  if (body.age == null || Number.isNaN(Number(body.age))) body.age = 15;

  // null cycle ids → omit (по-чисто за pydantic)
  for (const key of ["cycleId", "cycleWeek", "cycleDay"]) {
    if (body[key] == null) delete body[key];
  }
  if (!body.textbookSlug) delete body.textbookSlug;
  if (!body.sessionCode) delete body.sessionCode;
  if (!body.ageBand) delete body.ageBand;

  if (!Array.isArray(body.proposedExercises)) body.proposedExercises = [];
  body.proposedExercises = body.proposedExercises
    .filter((x) => x && typeof x === "object" && (x.title || x.name))
    .map((x) => ({
      title: String(x.title || x.name || "").slice(0, 120),
      blockType: String(x.blockType || "Изграждане"),
      minutes: Math.max(4, Math.min(20, Number(x.minutes) || 8)),
      instructions: String(x.instructions || "").slice(0, 600),
      skill: String(x.skill || "Координация").slice(0, 60),
      source: String(x.source || "assistant"),
    }));

  return body;
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isHeadCoachUser = String(user?.role || "").toLowerCase() === "club_head_coach";
  const planRef = useRef(null);
  const [activeTab, setActiveTab] = useState("assistant");
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
    sessionCode: "",
  });
  const [bvfMethodHint, setBvfMethodHint] = useState(null);
  const [programLink, setProgramLink] = useState({ teamId: null, sessionDate: "", dayTheme: "", dayFocus: [] });
  const [assistPlatCtx, setAssistPlatCtx] = useState(null);
  const [generateIntent, setGenerateIntent] = useState(null);
  const plannerPrefillRef = useRef(false);
  // Фокусът, подаден от програмния ден ("Моята програмна седмица"). Когато е
  // наличен, той е водещ — препоръката на конспекта не бива да го пренаписва.
  const programDayFocusRef = useRef([]);
  const assignmentId = searchParams.get("assignmentId") || "";

  const sessionReview = useMemo(
    () => result?.sessionReview || bvfMethodHint?.sessionReview || null,
    [result?.sessionReview, bvfMethodHint?.sessionReview]
  );

  const cloneBlocks = (blocks) =>
    (blocks || []).map((b) => ({
      blockType: b.blockType,
      targetMinutes: Number(b.targetMinutes || 0),
      methodHint: b.methodHint || "",
      phaseGoal: b.phaseGoal || "",
      timelineSegments: Array.isArray(b.timelineSegments) ? b.timelineSegments : [],
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
    const sessionCode = (searchParams.get("sessionCode") || "").trim();
    if (!ageBand && !cycleIdRaw && !textbookSlug && !sessionCode) return;

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
      sessionCode,
    });
    plannerPrefillRef.current = Boolean(cycleIdRaw || textbookSlug || sessionCode);
    // Полето "Възрастов диапазон" приема само диапазони (12-14, 14-16, ...),
    // затова при конкретна група (U16) задаваме конкретната възраст, за да се
    // покаже стойността, вместо да остане празно "По конкретна възраст".
    setForm((prev) => ({ ...prev, ageRange: "", age: ageYears }));

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
            ...(sessionCode ? { session_code: sessionCode } : {}),
          },
        });
        if (!alive) return;
        setBvfMethodHint(ctx);
        const resolvedSlug = ctx?.textbook?.slug || textbookSlug;
        if (resolvedSlug && resolvedSlug !== textbookSlug) {
          setCycleParams((prev) => ({ ...prev, textbookSlug: resolvedSlug }));
        }
        const rec = ctx?.recommended;
        // NB: не зависим от plannerPrefillRef тук — ефектът за уменията може да
        // го е нулирал, докато чакаме контекста (race). Този ефект тече само при
        // навигация от конспект, затова наличието на rec е достатъчно условие.
        if (rec) {
          // Ако идваме от програмен ден с конкретен фокус, той е водещ — не
          // позволяваме препоръката на конспекта да го пренапише. Периодът и
          // интензитетът от конспекта остават (те не са в конфликт).
          const keepProgramFocus = programDayFocusRef.current.length > 0;
          setForm((prev) => ({
            ...prev,
            ...(ctx?.age_band && ctx.age_band !== band
              ? { ageRange: "", age: AGE_BAND_TO_YEARS[ctx.age_band] ?? prev.age }
              : {}),
            ...(keepProgramFocus
              ? {}
              : {
                  mainFocus: rec.mainFocus || prev.mainFocus,
                  secondaryFocus: rec.secondaryFocus || prev.secondaryFocus,
                }),
            periodPhase: rec.periodPhase || prev.periodPhase,
            intensityTarget: rec.intensityTarget || prev.intensityTarget,
          }));
        }
        if (ctx?.age_band && ctx.age_band !== band) {
          setCycleParams((prev) => ({ ...prev, ageBand: ctx.age_band }));
        }
      } catch {
        if (alive) setBvfMethodHint(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [searchParams]);

  useEffect(() => {
    const teamIdRaw = (searchParams.get("team_id") || "").trim();
    const date = (searchParams.get("date") || "").trim();
    const title = (searchParams.get("title") || "").trim();
    const focus = (searchParams.get("focus") || "").trim();
    if (!teamIdRaw && !date && !title && !focus) return;
    const teamId = teamIdRaw ? Number(teamIdRaw) : null;
    const focusTokens = mapProgramFocusList(
      focus
        ? focus.split(",").map((s) => s.trim()).filter(Boolean)
        : []
    );
    // Фокусът на програмния ден е водещ за генератора (само канонични умения).
    programDayFocusRef.current = focusTokens;
    if (teamIdRaw || date) {
      setProgramLink({
        teamId: Number.isFinite(teamId) ? teamId : null,
        sessionDate: date,
        dayTheme: title,
        dayFocus: focusTokens,
      });
    }
    if (title || focusTokens.length) {
      setForm((prev) => ({
        ...prev,
        ...(title && !prev.trainingTitle ? { trainingTitle: title } : {}),
        ...(focusTokens.length ? { mainFocus: focusTokens[0] } : {}),
        ...(focusTokens.length > 1 ? { secondaryFocus: focusTokens[1] } : {}),
      }));
    }
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
    // Идване от програмен ден: пазим точно фокусите на деня, без да ги
    // "коригираме" към най-близкото умение от базата.
    const programFocus = programDayFocusRef.current;
    if (programFocus.length) {
      setForm((prev) => {
        const next = {};
        if (prev.mainFocus !== programFocus[0]) next.mainFocus = programFocus[0];
        if (programFocus[1] && prev.secondaryFocus !== programFocus[1]) {
          next.secondaryFocus = programFocus[1];
        }
        return Object.keys(next).length ? { ...prev, ...next } : prev;
      });
      plannerPrefillRef.current = false;
      return;
    }
    setForm((prev) => {
      const selectable = options.skills;
      const resolve = (raw) => resolveToSelectableSkill(raw, selectable) || raw;
      let main = resolve(prev.mainFocus) || selectable[0];
      let sec =
        resolve(prev.secondaryFocus) ||
        selectable.find((s) => s !== main) ||
        selectable[0];
      if (main === sec && selectable.length > 1) {
        sec = selectable.find((s) => s !== main) ?? sec;
      }
      if (main === prev.mainFocus && sec === prev.secondaryFocus) return prev;
      return { ...prev, mainFocus: main, secondaryFocus: sec };
    });
    if (plannerPrefillRef.current && options.skills.length) {
      plannerPrefillRef.current = false;
    }
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
      sessionCode: cycleParams.sessionCode || undefined,
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

  const onGenerate = async (overrides = null) => {
    setLoading(true);
    setErr("");
    setSavedTraining(null);
    try {
      const patch =
        overrides &&
        typeof overrides === "object" &&
        typeof overrides.preventDefault !== "function" &&
        !overrides.nativeEvent
          ? overrides
          : {};
      if (patch.mainFocus || patch.ageBand || patch.sessionDate) {
        setGenerateIntent({
          mainFocus: patch.mainFocus || form.mainFocus,
          secondaryFocus: patch.secondaryFocus || form.secondaryFocus,
          ageBand: patch.ageBand || cycleParams.ageBand,
          teamName: assistPlatCtx?.activeTeam?.name || null,
          sessionDate: patch.sessionDate || programLink.sessionDate || null,
          proposedCount: Array.isArray(patch.proposedExercises) ? patch.proposedExercises.length : 0,
          source: patch.fromChat ? "chat" : "settings",
        });
      }
      const effectiveSeed =
        (patch.variability || form.variability) === "varied"
          ? Math.floor(Date.now() % 1000000)
          : Number(patch.randomSeed ?? form.randomSeed);
      const data = await apiClient(API_PATHS.AI_TRAINING_GENERATE, {
        method: "POST",
        data: sanitizeGenerateBody({ ...payload, ...patch, randomSeed: effectiveSeed }),
      });
      setResult(data || null);
      const blocks = cloneBlocks(data?.session?.blocks || data?.blocks || []);
      setEditableBlocks(blocks);
      if (blocks.length) setTargetBlockType(blocks[0].blockType);
      setCardTargetByDrill({});
      goToPlan();
    } catch (e) {
      setErr(normalizeError(e, "Грешка при генериране."));
    } finally {
      setLoading(false);
    }
  };

  const resolveDayTarget = () => {
    // Приоритет: URL (отворен ден) > programLink > soft defaults от асистента
    const urlTeam = Number(searchParams.get("team_id") || "") || null;
    const urlDate = (searchParams.get("date") || "").trim() || null;
    const teamId = urlTeam || programLink.teamId || assistPlatCtx?.activeTeam?.id || null;
    const sessionDate =
      urlDate ||
      programLink.sessionDate ||
      assistPlatCtx?.generateDefaults?.sessionDate ||
      null;
    return { teamId, sessionDate, pinnedFromUrl: Boolean(urlDate || urlTeam) };
  };

  const onGenerateAndSave = async (overrides = null) => {
    setSaving(true);
    setErr("");
    const patch =
      overrides &&
      typeof overrides === "object" &&
      typeof overrides.preventDefault !== "function" &&
      !overrides.nativeEvent
        ? overrides
        : {};
    const { teamId, sessionDate } = resolveDayTarget();
    const dayTeamId = patch.teamId || teamId;
    const dayDate = patch.sessionDate || sessionDate;

    let customTitle = String(patch.trainingTitle || form.trainingTitle || "").trim();
    if (!customTitle) {
      customTitle = [
        patch.ageBand || cycleParams.ageBand || assistPlatCtx?.activeTeam?.ageBand,
        patch.mainFocus || form.mainFocus,
        dayDate || null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (!customTitle) {
      setErr("Моля, въведете име на тренировката преди запис.");
      setSaving(false);
      setActiveTab("save");
      return;
    }

    setGenerateIntent({
      mainFocus: patch.mainFocus || form.mainFocus,
      secondaryFocus: patch.secondaryFocus || form.secondaryFocus,
      ageBand: patch.ageBand || cycleParams.ageBand,
      teamName: assistPlatCtx?.activeTeam?.name || null,
      sessionDate: dayDate,
      proposedCount: Array.isArray(patch.proposedExercises) ? patch.proposedExercises.length : 0,
      source: patch.fromChat ? "chat" : "save",
      saveForDay: Boolean(dayTeamId && dayDate),
    });

    try {
      const effectiveSeed =
        (patch.variability || form.variability) === "varied"
          ? Math.floor(Date.now() % 1000000)
          : Number(patch.randomSeed ?? form.randomSeed);
      // От чат — нов план; не преизползвай стари editedBlocks
      const useEdited = !patch.fromChat && editableBlocks.length > 0;
      const data = await apiClient(API_PATHS.AI_TRAINING_GENERATE_AND_SAVE, {
        method: "POST",
        data: sanitizeGenerateBody({
          ...payload,
          ...patch,
          randomSeed: effectiveSeed,
          trainingTitle: customTitle,
          trainingStatus: "запазена",
          editedBlocks: useEdited ? editableBlocks : undefined,
          teamId: dayTeamId || undefined,
          sessionDate: dayDate || undefined,
        }),
      });
      setResult(data || null);
      const blocks = cloneBlocks(data?.session?.blocks || data?.blocks || []);
      setEditableBlocks(blocks);
      if (blocks.length) setTargetBlockType(blocks[0].blockType);
      setCardTargetByDrill({});
      setSavedTraining(data?.training || null);
      setForm((prev) => ({ ...prev, trainingTitle: customTitle }));
      setActiveTab("save");
      goToPlan();
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
      setErr(normalizeError(e, "Грешка при запис (generate-and-save)."));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "assistant", label: "Помощник" },
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
        title="AI помощник на треньора"
        subtitle={
          bvfMethodHint?.textbook?.title
            ? `Конспект: ${bvfMethodHint.textbook.title}${bvfMethodHint.textbook.session_code ? ` (${bvfMethodHint.textbook.session_code})` : ""} · ${cycleParams.ageBand || bvfMethodHint.age_band || "БФВ"}`
            : bvfMethodHint?.week?.theme
              ? `Методика БФВ · ${cycleParams.ageBand || bvfMethodHint.age_band} · седмица: ${bvfMethodHint.week.theme} — питай и генерирай тренировки.`
              : cycleParams.ageBand
                ? `Методика БФВ за ${cycleParams.ageBand} — отговори + генериране на тренировки.`
                : "Питай за мач, техника и програма — или генерирай тренировка по методика БФВ."
        }
        actions={
          <Button as={Link} to="/my-trainings" size="sm" variant="secondary">
            ← Моите тренировки
          </Button>
        }
      />

      <nav className="aiGenTabs" aria-label="Секции на помощника">
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

      {generateIntent || programLink.sessionDate || form.mainFocus || searchParams.get("date") ? (
        <div className="aiGenIntentBanner" role="status">
          <strong>Генерирам за:</strong>
          <span>
            {[
              generateIntent?.teamName || assistPlatCtx?.activeTeam?.name,
              generateIntent?.ageBand || cycleParams.ageBand || assistPlatCtx?.activeTeam?.ageBand,
              generateIntent?.mainFocus || form.mainFocus,
              generateIntent?.secondaryFocus || form.secondaryFocus
                ? `+ ${generateIntent?.secondaryFocus || form.secondaryFocus}`
                : null,
              (() => {
                const d =
                  generateIntent?.sessionDate ||
                  searchParams.get("date") ||
                  programLink.sessionDate;
                return d ? `дата ${d}` : null;
              })(),
              (generateIntent?.proposedCount || 0) > 0
                ? `${generateIntent.proposedCount} предложени упр.`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : null}

      {programLink.sessionDate || searchParams.get("date") ? (
        <div className="aiGenBvfBanner" role="note">
          <strong>Тема за деня (от програмната седмица)</strong>
          <span>
            {programLink.dayTheme ? (
              <>
                <b>{programLink.dayTheme}</b>
                <br />
              </>
            ) : null}
            {programLink.dayFocus?.length ? (
              <>
                Фокус: {programLink.dayFocus.join(", ")}
                <br />
              </>
            ) : null}
            След запис тренировката се закача към отбора за{" "}
            {searchParams.get("date") || programLink.sessionDate} и ще се появи в
            „Моята програмна седмица" с бутон „Продължи с тренировката".
          </span>
        </div>
      ) : null}

      {bvfMethodHint?.principles?.length || bvfMethodHint?.textbook ? (
        <div className="aiGenBvfBanner" role="note">
          <strong>Методически конспект (от учебника на БФВ)</strong>
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
            {cycleParams.textbookSlug ? (
              <>
                {" "}
                <Link to={`/textbook/${cycleParams.textbookSlug}`}>← Конспект в учебника</Link>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {err ? <div className="aiGenError">{String(err)}</div> : null}
      {savedTraining?.id ? (
        <div className="aiGenSuccess">
          Записано като тренировка #{savedTraining.id}: {savedTraining.title}
          {savedTraining.team_id && savedTraining.session_date
            ? ` · закачена към отбор #${savedTraining.team_id} за ${savedTraining.session_date}`
            : ""}
          {isHeadCoachUser && assignCoaches.length > 0 ? " • Възложена като задача." : ""}
          {" "}
          <Link to={`/trainings/${savedTraining.id}`}>Отвори тренировката →</Link>
          {savedTraining.team_id && savedTraining.session_date ? (
            <>
              {" · "}
              <Link
                to={`/teams/${savedTraining.team_id}/attendance?date=${encodeURIComponent(savedTraining.session_date)}`}
              >
                Към присъствието за деня →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "assistant" ? (
        <CoachAssistantChat
          ageBand={cycleParams.ageBand || assistPlatCtx?.activeTeam?.ageBand || undefined}
          context={{
            date:
              programLink.sessionDate ||
              searchParams.get("date") ||
              assistPlatCtx?.program?.today?.date ||
              undefined,
            programTheme:
              programLink.dayTheme ||
              assistPlatCtx?.program?.today?.theme ||
              assistPlatCtx?.program?.weekTheme ||
              undefined,
            teamId:
              Number(searchParams.get("team_id") || "") ||
              programLink.teamId ||
              assistPlatCtx?.activeTeam?.id ||
              undefined,
            teamName: assistPlatCtx?.activeTeam?.name || undefined,
            daysUntilMatch: assistPlatCtx?.calendar?.nextMatch?.daysUntilMatch,
          }}
          forDate={
            (searchParams.get("date") || "").trim() || programLink.sessionDate || ""
          }
          onPlatformContext={(ctx) => {
            setAssistPlatCtx(ctx || null);
            const active = ctx?.activeTeam;
            const defaults = ctx?.generateDefaults || {};
            const urlTeam = Number(searchParams.get("team_id") || "") || null;
            const urlDate = (searchParams.get("date") || "").trim() || "";
            const urlTitle = (searchParams.get("title") || "").trim() || "";
            const urlHasFocus = Boolean((searchParams.get("focus") || "").trim());
            if (active?.id || urlTeam || urlDate) {
              setProgramLink((prev) => ({
                ...prev,
                teamId: urlTeam || prev.teamId || (active?.id ? Number(active.id) : null),
                // URL date always wins — assistant must not clobber with Mon fallback
                sessionDate: urlDate || prev.sessionDate || defaults.sessionDate || "",
                dayTheme: urlTitle || prev.dayTheme || defaults.programTheme || "",
                dayFocus:
                  urlHasFocus && (prev.dayFocus || []).length
                    ? prev.dayFocus
                    : prev.dayFocus?.length
                      ? prev.dayFocus
                      : ctx?.program?.today?.focus || [],
              }));
            }
            if (defaults.ageBand) {
              setCycleParams((prev) => ({
                ...prev,
                ageBand: defaults.ageBand || prev.ageBand,
                textbookSlug: defaults.textbookSlug || prev.textbookSlug || "",
              }));
            }
            // Soft defaults only when URL didn't pin focus/title for the day
            if ((defaults.mainFocus || defaults.age) && !urlHasFocus) {
              setForm((prev) => ({
                ...prev,
                ...(defaults.mainFocus && !programDayFocusRef.current?.length
                  ? { mainFocus: defaults.mainFocus }
                  : {}),
                ...(defaults.secondaryFocus && !programDayFocusRef.current?.length
                  ? { secondaryFocus: defaults.secondaryFocus }
                  : {}),
                ...(defaults.periodPhase ? { periodPhase: defaults.periodPhase } : {}),
                ...(defaults.intensityTarget ? { intensityTarget: defaults.intensityTarget } : {}),
                ...(defaults.orientation ? { orientation: defaults.orientation } : {}),
                ...(defaults.age ? { age: Number(defaults.age) } : {}),
                ...(defaults.trainingTitle && !urlTitle
                  ? { trainingTitle: defaults.trainingTitle }
                  : {}),
              }));
            } else if (defaults.age || defaults.periodPhase) {
              setForm((prev) => ({
                ...prev,
                ...(defaults.periodPhase ? { periodPhase: defaults.periodPhase } : {}),
                ...(defaults.intensityTarget ? { intensityTarget: defaults.intensityTarget } : {}),
                ...(defaults.age ? { age: Number(defaults.age) } : {}),
              }));
            }
          }}
          onRequestGenerate={(req) => {
            const fromChat =
              req && typeof req === "object" && !Array.isArray(req) ? req.generateParams || {} : {};
            const hint = String(
              (typeof req === "string" ? req : req?.userMessage || req?.hintText) || ""
            ).toLowerCase();

            let mainFocus = fromChat.mainFocus || form.mainFocus || "Посрещане";
            let secondaryFocus = fromChat.secondaryFocus || form.secondaryFocus || "";
            let orientation = fromChat.orientation || form.orientation || "balanced";
            let periodPhase = fromChat.periodPhase || form.periodPhase;
            let intensityTarget = fromChat.intensityTarget || form.intensityTarget;

            if (!fromChat.mainFocus) {
              if (hint.includes("отскок") || hint.includes("скач") || hint.includes("сил")) {
                mainFocus = "Координация";
                orientation = "physical";
                secondaryFocus = secondaryFocus || "Атака";
              } else if (
                hint.includes("разпредел") ||
                hint.includes("сетър") ||
                hint.includes("setter") ||
                hint.includes("подава")
              ) {
                mainFocus = "Разпределение";
                orientation = "serve_receive";
                secondaryFocus = secondaryFocus || "Посрещане";
              } else if (hint.includes("зон") || hint.includes("посрещ") || hint.includes("прием")) {
                mainFocus = "Посрещане";
                orientation = "serve_receive";
              } else if (hint.includes("атак")) {
                mainFocus = "Атака";
                orientation = "attack_block";
              } else if (hint.includes("блок")) {
                mainFocus = "Блок";
                orientation = "attack_block";
              } else if (hint.includes("сервис") || hint.includes("начален")) {
                mainFocus = "Сервис";
                orientation = "serve_receive";
              }
            }
            if (!fromChat.periodPhase && (hint.includes("мач") || hint.includes("утре"))) {
              periodPhase = "taper";
              intensityTarget = "low";
            }

            const ageBand =
              fromChat.ageBand ||
              cycleParams.ageBand ||
              assistPlatCtx?.activeTeam?.ageBand ||
              undefined;
            const age =
              fromChat.age != null
                ? Number(fromChat.age)
                : ageBand && AGE_BAND_TO_YEARS[ageBand]
                  ? AGE_BAND_TO_YEARS[ageBand]
                  : Number(form.age);

            const domainsFor = (ori) => {
              if (ori === "serve_receive")
                return chooseByKeywords(options.domains, ["прием", "посрещ", "service", "serve"], 3);
              if (ori === "attack_block")
                return chooseByKeywords(options.domains, ["атака", "attack", "блок", "block"], 3);
              if (ori === "defense_transition")
                return chooseByKeywords(options.domains, ["защ", "defense", "dig", "transition"], 3);
              if (ori === "game_tactics")
                return chooseByKeywords(options.domains, ["тактик", "system", "rotation", "игра"], 3);
              if (ori === "physical")
                return chooseByKeywords(options.domains, ["физ", "conditioning", "speed", "jump", "сил"], 3);
              return options.domains.slice(0, Math.min(3, options.domains.length));
            };
            const phasesFor = (ori) => {
              if (ori === "serve_receive") return chooseByKeywords(options.phases, ["k1", "sideout", "receive"], 2);
              if (ori === "attack_block") return chooseByKeywords(options.phases, ["k2", "transition", "block"], 2);
              if (ori === "defense_transition")
                return chooseByKeywords(options.phases, ["k2", "transition", "counter"], 2);
              if (ori === "game_tactics") return chooseByKeywords(options.phases, ["k1", "k2", "rally", "game"], 3);
              if (ori === "physical") return chooseByKeywords(options.phases, ["transition", "rally"], 1);
              return options.phases.slice(0, Math.min(2, options.phases.length));
            };

            const formPatch = {
              mainFocus,
              secondaryFocus,
              orientation,
              periodPhase,
              intensityTarget,
              age,
              ...(fromChat.durationTotalMin
                ? { durationTotalMin: Number(fromChat.durationTotalMin) }
                : {}),
              ...(fromChat.trainingTitle ? { trainingTitle: String(fromChat.trainingTitle) } : {}),
            };

            setForm((prev) => ({ ...prev, ...formPatch }));
            setCycleParams((prev) => ({
              ...prev,
              ageBand: ageBand || prev.ageBand,
              cycleId: null,
              cycleWeek: null,
              cycleDay: null,
              // запази textbook от програмата ако няма override
              textbookSlug: fromChat.textbookSlug || prev.textbookSlug || "",
              sessionCode: "",
            }));
            if (fromChat.teamId || assistPlatCtx?.activeTeam?.id) {
              setProgramLink((prev) => ({
                ...prev,
                teamId: Number(fromChat.teamId || assistPlatCtx.activeTeam.id),
                sessionDate: fromChat.sessionDate || prev.sessionDate || "",
                dayTheme: fromChat.programTheme || prev.dayTheme || "",
              }));
            }

            const userOverride = Boolean(
              hint.includes("отскок") ||
                hint.includes("сил") ||
                hint.includes("физическ") ||
                hint.includes("разпредел") ||
                hint.includes("сетър") ||
                fromChat.assistantOverride
            );

            const dayTarget = resolveDayTarget();
            const patchTeamId =
              Number(fromChat.teamId || dayTarget.teamId || assistPlatCtx?.activeTeam?.id || 0) ||
              undefined;
            const patchDate =
              fromChat.sessionDate ||
              dayTarget.sessionDate ||
              assistPlatCtx?.generateDefaults?.sessionDate ||
              undefined;
            const proposed = Array.isArray(fromChat.proposedExercises)
              ? fromChat.proposedExercises
              : [];
            const patch = {
              ...formPatch,
              fromChat: true,
              focusSkills: [mainFocus, secondaryFocus].filter(Boolean),
              focusDomains: domainsFor(orientation),
              focusGamePhases: phasesFor(orientation),
              ageBand: ageBand || undefined,
              assistantOverride: true,
              cycleId: null,
              cycleWeek: null,
              cycleDay: null,
              textbookSlug: userOverride ? "" : fromChat.textbookSlug || cycleParams.textbookSlug || "",
              sessionCode: "",
              proposedExercises: proposed,
              teamId: patchTeamId,
              sessionDate: patchDate,
              trainingTitle:
                fromChat.trainingTitle ||
                [ageBand, mainFocus, patchDate].filter(Boolean).join(" · "),
            };

            setGenerateIntent({
              mainFocus,
              secondaryFocus,
              ageBand: ageBand || null,
              teamName: assistPlatCtx?.activeTeam?.name || null,
              sessionDate: patchDate || null,
              proposedCount: proposed.length,
              source: "chat",
              saveForDay: Boolean(patchTeamId && patchDate),
            });

            // Ако има отбор+дата → едно действие: генерирай и запиши за деня
            if (patchTeamId && patchDate) {
              onGenerateAndSave(patch);
            } else {
              onGenerate(patch);
            }
          }}
          canSaveForDay={Boolean(
            (searchParams.get("team_id") ||
              programLink.teamId ||
              assistPlatCtx?.activeTeam?.id) &&
              (searchParams.get("date") ||
                programLink.sessionDate ||
                assistPlatCtx?.generateDefaults?.sessionDate)
          )}
          saveForDayLabel={
            searchParams.get("date") ||
            programLink.sessionDate ||
            assistPlatCtx?.generateDefaults?.sessionDate ||
            ""
          }
        />
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
          sessionReview={sessionReview}
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
          toBgLabel={toBgLabel}
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
        {(activeTab === "settings" || activeTab === "plan") && !(programLink.teamId && programLink.sessionDate) ? (
          <button type="button" className="aiGenBtn aiGenBtn--primary" onClick={() => onGenerate()} disabled={loading || saving || metaLoading}>
            {loading ? "Генериране..." : "Генерирай преглед"}
          </button>
        ) : null}
        {(activeTab === "settings" || activeTab === "plan" || activeTab === "save" || activeTab === "assistant") && (
          <button
            type="button"
            className="aiGenBtn aiGenBtn--save"
            onClick={() => {
              const { teamId, sessionDate } = resolveDayTarget();
              if (!form.trainingTitle?.trim() && !(teamId && sessionDate)) {
                setActiveTab("save");
                setErr("Моля, въведете име на тренировката преди запис.");
                return;
              }
              onGenerateAndSave();
            }}
            disabled={loading || saving || metaLoading}
          >
            {saving
              ? "Запис..."
              : (() => {
                  const { teamId, sessionDate } = resolveDayTarget();
                  return teamId && sessionDate
                    ? `Направи и запиши за ${sessionDate}`
                    : "Запази тренировката";
                })()}
          </button>
        )}
      </div>

      {previewDrill ? <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} /> : null}
    </div>
  );
}
