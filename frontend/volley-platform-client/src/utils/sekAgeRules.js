/** СЕК възрастови кохорти: своята група или една нагоре, без надолу и без прескачане. */

export const AGE_LADDER = [12, 13, 14, 16, 18, 20, 99];

const AGE_LABELS = {
  12: "Детски",
  13: "Мини",
  14: "Под 14",
  16: "Под 16",
  18: "Под 18",
  20: "Под 20",
  99: "Мъже / Жени",
};

export function ageGroupLabel(code) {
  return AGE_LABELS[Number(code)] || `До ${code}`;
}

export function resolveAgeCode(age, ageGroup) {
  const raw = String(ageGroup || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "");
  if (raw.includes("детск")) return 12;
  if (raw.includes("мини")) return 13;
  if (raw.includes("под14")) return 14;
  if (raw.includes("под16")) return 16;
  if (raw.includes("под18")) return 18;
  if (raw.includes("под20")) return 20;
  if (raw.includes("мъже") || raw.includes("жени") || raw.includes("висша")) return 99;
  const code = Number(age);
  if (AGE_LADDER.includes(code)) return code;
  return code || 12;
}

/** Естествена група. Сезон 2022/23: Детски=2012; сезон 2026 → Детски=2016. */
export function naturalAgeCode(birthYear, seasonYear) {
  const y = Number(seasonYear);
  const by = Number(birthYear);
  if (!Number.isFinite(y) || !Number.isFinite(by)) return null;
  if (by >= y - 10) return 12;
  if (by === y - 11) return 13;
  if (by === y - 12) return 14;
  if (by === y - 14 || by === y - 13) return 16;
  if (by === y - 16 || by === y - 15) return 18;
  if (by === y - 18 || by === y - 17) return 20;
  return 99;
}

export function allowedAgeCodes(birthYear, seasonYear) {
  const nat = naturalAgeCode(birthYear, seasonYear);
  if (nat == null) return new Set();
  const idx = AGE_LADDER.indexOf(nat);
  const allowed = new Set([nat]);
  if (idx >= 0 && idx + 1 < AGE_LADDER.length) allowed.add(AGE_LADDER[idx + 1]);
  return allowed;
}

export function athleteFitsAgeGroup(birthYear, seasonYear, age, ageGroup) {
  const by = Number(birthYear);
  if (!Number.isFinite(by)) return { ok: false, reason: "липсва година на раждане" };
  const code = resolveAgeCode(age, ageGroup);
  const allowed = allowedAgeCodes(by, seasonYear);
  if (!allowed.has(code)) {
    const nat = naturalAgeCode(by, seasonYear);
    return {
      ok: false,
      reason: `родени ${by} са за ${ageGroupLabel(nat)}, не за ${ageGroupLabel(code)}`,
    };
  }
  return { ok: true, reason: null };
}

export function ageRuleHint(seasonYear, age, ageGroup) {
  const y = Number(seasonYear);
  const code = resolveAgeCode(age, ageGroup);
  const years = [];
  for (let by = y - 50; by <= y; by += 1) {
    if (allowedAgeCodes(by, y).has(code)) years.push(by);
  }
  const label = ageGroupLabel(code);
  if (code >= 99) return `${label}: възрастни + Под 20 (една група нагоре).`;
  if (!years.length) return `${label}: няма допустими години на раждане.`;
  const lo = years[0];
  const hi = years[years.length - 1];
  const band = lo === hi ? `родени ${lo}` : `родени ${lo}–${hi}`;
  return `${label} сезон ${y}: ${band}. Родени 2014 не влизат в Детски (те са Под 14).`;
}
