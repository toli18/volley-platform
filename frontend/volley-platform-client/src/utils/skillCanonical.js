/**
 * Canonical volleyball skills for AI generator UI (aligned with backend bulgarian_training_generator).
 */

export const SKILL_CANONICAL_CORE = [
  "Посрещане",
  "Разпределение",
  "Сервис",
  "Атака",
  "Блок",
  "Защита",
];

/** Shown in pickers only when at least this many drills map to the skill */
export const SKILL_EXTENDED_CANDIDATES = ["Преход", "Координация", "Игра"];
export const SKILL_EXTENDED_MIN_DRILLS = 3;

const SKILL_ALL_ORDER = [...SKILL_CANONICAL_CORE, ...SKILL_EXTENDED_CANDIDATES];

const SKILL_SYNONYMS = {
  Посрещане: [
    "посрещане",
    "приемане",
    "serve receive",
    "serve-receive",
    "reception",
    "receive",
    "посрещ",
    "прием",
  ],
  Разпределение: [
    "разпределение",
    "разпределяне",
    "пас",
    "подаване",
    "подач",
    "setting",
    "set",
    "passing",
    "pass",
  ],
  Сервис: ["сервис", "начален удар", "serve", "service", "подач сервис"],
  Атака: ["атака", "нападение", "attack", "удар"],
  Блок: ["блок", "block"],
  Защита: ["защита", "defense", "defence", "dig", "диг"],
  Преход: ["преход", "transition", "контра", "counter", "контраатака"],
  Координация: ["координация", "coordination", "ловкост", "баланс"],
  Игра: ["игра", "game", "rally", "игрова", "разиграване", "ситуация"],
};

const SKILL_BLACKLIST = new Set([
  "platform",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "test",
  "admin",
  "drill",
  "exercise",
  "volley",
  "volleyball",
  "няма",
  "няма данни",
  "-",
]);

/** Lone English tokens allowed as raw DB labels (mapped via synonyms otherwise) */
const ENGLISH_TOKEN_ALLOW = new Set([
  "serve",
  "receive",
  "attack",
  "block",
  "defense",
  "defence",
  "transition",
  "setting",
  "game",
  "dig",
  "pass",
]);

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function parseSkillList(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (!raw) return [];
  return String(raw)
    .replace(/\|/g, ",")
    .replace(/;/g, ",")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isBlacklistedToken(token) {
  const n = norm(token);
  if (!n || n.length < 2) return true;
  if (SKILL_BLACKLIST.has(n)) return true;
  if (/^[a-z][a-z0-9\s\-]*$/.test(n) && !ENGLISH_TOKEN_ALLOW.has(n) && !n.includes(" ")) {
    return true;
  }
  return false;
}

function synonymMatches(probe, synonym) {
  const p = norm(probe);
  const s = norm(synonym);
  if (!p || !s) return false;
  return p === s || p.includes(s) || s.includes(p);
}

/**
 * Map any raw label to a canonical skill id, or "" if noise / unknown.
 */
export function normalizeSkill(text) {
  const probe = norm(text);
  if (!probe || isBlacklistedToken(probe)) return "";

  for (const canonical of SKILL_ALL_ORDER) {
    if (synonymMatches(probe, canonical)) return canonical;
    for (const syn of SKILL_SYNONYMS[canonical] || []) {
      if (synonymMatches(probe, syn)) return canonical;
    }
  }
  return "";
}

export function normalizeSkillsFromText(raw) {
  const chunks = Array.isArray(raw) ? raw : parseSkillList(raw);
  const out = [];
  for (const chunk of chunks) {
    const direct = normalizeSkill(chunk);
    if (direct) {
      if (!out.includes(direct)) out.push(direct);
      continue;
    }
    for (const token of String(chunk).split(/\s+/)) {
      const mapped = normalizeSkill(token);
      if (mapped && !out.includes(mapped)) out.push(mapped);
    }
  }
  return out;
}

/** All canonical skills present on a drill (from focus / technical / tactical fields). */
export function getDrillCanonicalSkills(drill) {
  const raw = [
    ...parseSkillList(drill?.skill_focus),
    ...parseSkillList(drill?.technical_focus),
    ...parseSkillList(drill?.tactical_focus),
    ...parseSkillList(drill?.skill_domains),
  ];
  const set = new Set();
  for (const piece of raw) {
    const mapped = normalizeSkill(piece);
    if (mapped) set.add(mapped);
  }
  return set;
}

/**
 * Ordered list for focus pickers: 6 core + extended only if common enough in DB.
 */
export function buildSelectableSkills(drills, minExtended = SKILL_EXTENDED_MIN_DRILLS) {
  const counts = {};
  for (const d of drills || []) {
    for (const sk of getDrillCanonicalSkills(d)) {
      counts[sk] = (counts[sk] || 0) + 1;
    }
  }
  const out = [...SKILL_CANONICAL_CORE];
  for (const ext of SKILL_EXTENDED_CANDIDATES) {
    if ((counts[ext] || 0) >= minExtended) out.push(ext);
  }
  return out;
}

/** Search in picker: canonical label + synonyms */
export function matchSkillQuery(canonical, query) {
  const q = norm(query);
  if (!q) return true;
  if (norm(canonical).includes(q)) return true;
  for (const syn of SKILL_SYNONYMS[canonical] || []) {
    if (norm(syn).includes(q) || q.includes(norm(syn))) return true;
  }
  return false;
}

export function resolveToSelectableSkill(value, selectable) {
  if (!value || !selectable?.length) return "";
  const set = new Set(selectable);
  if (set.has(value)) return value;
  const mapped = normalizeSkill(value);
  if (mapped && set.has(mapped)) return mapped;
  for (const part of parseSkillList(value)) {
    const m = normalizeSkill(part);
    if (m && set.has(m)) return m;
  }
  return "";
}
