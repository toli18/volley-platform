/** Display helpers for assessment / scouting talent labels (UI only). */

const LEVEL_CLASS = {
  Незадоволително: "talentBadge--develop",
  "Начално ниво": "talentBadge--develop",
  "За развитие": "talentBadge--develop",
  Задоволително: "talentBadge--warn",
  "Много добро": "talentBadge--good",
  Отлично: "talentBadge--great",
};

/** Softer wording for the lowest talent band. */
export function displayTalentLabel(label) {
  if (label === "Незадоволително") return "Начално ниво";
  return label || "";
}

export function talentLevelClass(label) {
  if (!label) return "talentBadge--good";
  return LEVEL_CLASS[label] || LEVEL_CLASS[displayTalentLabel(label)] || "talentBadge--good";
}

const CATEGORY_LABEL = {
  anthropometry: "Антропометрия",
  physical: "Физически",
  technical: "Технически",
  tactical: "Тактически",
  psychological: "Психологически",
  speed: "Бързина",
};

const UNIT_LABEL = {
  points: "точки",
  point: "точки",
  pts: "точки",
  sec: "сек.",
  secs: "сек.",
  second: "сек.",
  seconds: "сек.",
  cm: "cm",
  kg: "kg",
  m: "m",
};

export function displayCategoryLabel(category) {
  const key = String(category || "").trim().toLowerCase();
  return CATEGORY_LABEL[key] || category || "";
}

export function displayUnitLabel(unit) {
  const key = String(unit || "").trim().toLowerCase();
  if (!key) return "";
  return UNIT_LABEL[key] || unit;
}

/**
 * Strip redundant adult gender / year noise from SEK card labels.
 * "Момичета под 14г. · Жени · 2026" → "Момичета под 14г. · 2026"
 */
export function compactSekCardLabel(raw) {
  const parts = String(raw || "")
    .split(/\s*[·|]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const yearRe = /^(19|20)\d{2}$/;
  const adultGenderRe = /^(жени|мъже|women|men)$/i;
  const youthRe = /момичета|момчета|девойк|юнош|под\s*\d|u\s*\d|мини|детск/i;

  const seen = new Set();
  const deduped = [];
  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  const hasYouth = deduped.some((p) => youthRe.test(p));
  const cleaned = hasYouth
    ? deduped.filter((p) => !adultGenderRe.test(p))
    : deduped;

  // Keep year if present (season context), unlike competition card titles.
  const out = cleaned.length ? cleaned : deduped;
  return out.filter((p, i, arr) => !(yearRe.test(p) && arr.length === 1)).join(" · ") || parts[0];
}

/** Approximate official net height (cm) by U-band + gender. */
export function netHeightCmForBand(ageBand, gender) {
  const band = String(ageBand || "").toUpperCase();
  const g = String(gender || "").toLowerCase();
  const female =
    g === "female" || g === "f" || g === "ж" || g.includes("female") || g.includes("girl");

  let age = null;
  const u = band.match(/U\s*(\d+)/i);
  if (u) age = Number(u[1]);
  else {
    const under = band.match(/ПОД\s*(\d+)/i) || String(ageBand || "").match(/под\s*(\d+)/i);
    if (under) age = Number(under[1]);
  }

  if (female) {
    if (age != null && age <= 12) return 210;
    if (age != null && age <= 14) return 215;
    if (age != null && age <= 16) return 224;
    return 224;
  }
  if (age != null && age <= 12) return 210;
  if (age != null && age <= 14) return 224;
  if (age != null && age <= 16) return 235;
  if (age != null && age <= 18) return 243;
  return 243;
}
