/** Нормализация на training.plan — legacy [id] или enriched [{ drillId, minutes }]. */

export function resolveDrillId(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    for (const key of ["drillId", "drill_id", "id"]) {
      const v = raw[key];
      if (v == null) continue;
      const resolved = resolveDrillId(v);
      if (resolved) return resolved;
    }
  }
  return null;
}

export function normalizePlanItem(raw, defaultMinutes = 10) {
  if (raw == null) return null;
  const did = resolveDrillId(raw);
  if (!did) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const mins = Math.max(3, Number(raw.minutes) || defaultMinutes);
    return { drillId: did, minutes: mins, coachNote: String(raw.coachNote || raw.coach_note || "") };
  }
  return { drillId: did, minutes: Math.max(3, defaultMinutes), coachNote: "" };
}

export function normalizePlan(plan, defaultMinutes = 10) {
  if (!plan || typeof plan !== "object") return {};
  const out = {};
  for (const [key, arr] of Object.entries(plan)) {
    if (!Array.isArray(arr)) continue;
    const cleaned = arr.map((x) => normalizePlanItem(x, defaultMinutes)).filter(Boolean);
    if (cleaned.length) out[key] = cleaned;
  }
  return out;
}

export function planSectionIds(plan, sectionKey) {
  return (normalizePlan(plan)[sectionKey] || []).map((x) => x.drillId);
}

export function distributeMinutesForSection(items, sectionMinutes) {
  if (!items.length) return items;
  const target = Math.max(items.length * 5, Number(sectionMinutes) || items.length * 10);
  const base = Math.max(5, Math.floor(target / items.length));
  return items.map((item, i) => ({
    ...item,
    minutes: item.minutes && item.minutes !== 10 ? item.minutes : base + (i < target % items.length ? 1 : 0),
  }));
}
