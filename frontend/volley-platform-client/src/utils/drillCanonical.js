const CANONICAL = {
  category: [
    "Техническа подготовка",
    "Тактическа подготовка",
    "Физическа подготовка",
    "Загрявка",
    "Игра",
    "Комбинации",
    "Защита",
    "Блокада",
    "Сервис",
    "Посрещане",
    "Нападение",
    "Разпределяне",
    "Преход",
    "Друго",
  ],
  level: ["Начинаещи", "Средно ниво", "Напреднали", "Всички нива"],
  intensity_type: ["Ниска", "Средна", "Висока", "Смесена"],
  type_of_drill: ["Индивидуално", "По двойки", "Групово", "Отборно", "Игра 6:6", "Ситуативно", "Друго"],
  skill_domains: ["Техника", "Тактика", "Комуникация", "Психология", "Физика", "Координация"],
  game_phases: ["Сервис", "Посрещане", "Разпределяне", "Нападение", "Блокада", "Защита", "Преход"],
  tactical_focus: ["Система 5:1", "Система 4:2", "Покритие", "Зони", "Комбинации", "Тактика в сервис"],
  technical_focus: ["Пас", "Подач", "Посрещане", "Нападение", "Блок", "Защита", "Разпределяне"],
  position_focus: ["Разпределител", "Посрещач", "Диагонал", "Център", "Либеро", "Всички"],
  zone_focus: ["Зона 1", "Зона 2", "Зона 3", "Зона 4", "Зона 5", "Зона 6"],
};

const ALIASES = {
  category: {
    техника: "Техническа подготовка",
    technical: "Техническа подготовка",
    тактика: "Тактическа подготовка",
    tactical: "Тактическа подготовка",
    физическа: "Физическа подготовка",
    physical: "Физическа подготовка",
  },
  level: {
    beginner: "Начинаещи",
    intermediate: "Средно ниво",
    advanced: "Напреднали",
    all: "Всички нива",
  },
  intensity_type: {
    low: "Ниска",
    medium: "Средна",
    high: "Висока",
    mixed: "Смесена",
  },
  type_of_drill: {
    individual: "Индивидуално",
    pairs: "По двойки",
    group: "Групово",
    team: "Отборно",
    situational: "Ситуативно",
  },
};

const normalizeToken = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function canonicalizeSingle(field, value) {
  if (value === null || value === undefined || value === "") return null;
  const options = CANONICAL[field] || [];
  const key = normalizeToken(value);

  const exact = options.find((x) => normalizeToken(x) === key);
  if (exact) return exact;

  const alias = ALIASES[field]?.[key];
  if (alias && options.includes(alias)) return alias;

  return null;
}

export function canonicalizeList(field, list) {
  const options = CANONICAL[field] || [];
  const incoming = Array.isArray(list) ? list : [];
  const out = [];
  for (const item of incoming) {
    const exact = options.find((x) => normalizeToken(x) === normalizeToken(item));
    if (exact) out.push(exact);
  }
  return Array.from(new Set(out));
}

export function normalizeDrillPayload(raw) {
  const payload = { ...raw };
  payload.category = canonicalizeSingle("category", raw.category);
  payload.level = canonicalizeSingle("level", raw.level);
  payload.intensity_type = canonicalizeSingle("intensity_type", raw.intensity_type);
  payload.type_of_drill = canonicalizeSingle("type_of_drill", raw.type_of_drill);
  payload.skill_domains = canonicalizeList("skill_domains", raw.skill_domains);
  payload.game_phases = canonicalizeList("game_phases", raw.game_phases);
  payload.tactical_focus = canonicalizeList("tactical_focus", raw.tactical_focus);
  payload.technical_focus = canonicalizeList("technical_focus", raw.technical_focus);
  payload.position_focus = canonicalizeList("position_focus", raw.position_focus);
  payload.zone_focus = canonicalizeList("zone_focus", raw.zone_focus);
  return payload;
}

export function validateGeneratorMinimums(payload) {
  const missing = [];
  if (!payload?.category) missing.push("Категория");
  if (!payload?.level) missing.push("Ниво");
  if (!payload?.intensity_type) missing.push("Тип интензивност");
  if (!payload?.type_of_drill) missing.push("Тип упражнение");
  const hasTags = (payload?.skill_domains?.length || 0) > 0 || (payload?.game_phases?.length || 0) > 0;
  if (!hasTags) missing.push("Поне 1 таг от Домейни/Фази");
  return missing;
}


