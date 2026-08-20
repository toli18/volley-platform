/** Helpers for competition create/edit form + carded-team autofill. */

export function cardIndexLabel(c) {
  if (!c) return "";
  if (c.label) return c.label;
  const age = c.age_group || (c.age != null ? `Под ${c.age}` : "Отбор");
  const sex = Number(c.sex) === 1 ? "Жени" : "Мъже";
  const year = c.year != null ? ` · ${c.year}` : "";
  return `${age} · ${sex}${year}`;
}

export function normalizeCardIndexes(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw?.items || raw?.slots || raw?.card_indexes || [];
  return list
    .map((c) => ({
      id: c.id,
      label: cardIndexLabel(c),
      age: c.age,
      age_group: c.age_group || null,
      sex: c.sex,
      year: c.year,
      assigned_coach_user_id: c.assigned_coach_user_id || null,
      assigned_coach_name: c.assigned_coach_name || null,
      bvf_card_index_id: c.bvf_card_index_id || null,
    }))
    .filter((c) => c.id != null);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

/** Pick best matching training group for a carded team (age / Uxx / sex hints). */
export function guessTeamIdForCardIndex(cardIndex, teams) {
  if (!cardIndex || !Array.isArray(teams) || !teams.length) return "";
  const ageNum = String(cardIndex.age ?? "").match(/\d+/)?.[0]
    || String(cardIndex.age_group || "").match(/\d+/)?.[0]
    || "";
  const female = Number(cardIndex.sex) === 1;
  const sexHints = female
    ? ["девой", "момич", "жен", "момичета", "дево"]
    : ["момч", "мъж", "мъже", "момчета", "юнош"];
  const ageHints = ageNum
    ? [`под${ageNum}`, `u${ageNum}`, ageNum, `под ${ageNum}`]
    : [];
  const ageGroupNorm = norm(cardIndex.age_group || "");

  let best = null;
  let bestScore = 0;
  for (const t of teams) {
    const name = String(t.name || "");
    const n = norm(name);
    if (!n) continue;
    let score = 0;
    if (ageGroupNorm && (n.includes(ageGroupNorm) || ageGroupNorm.includes(n))) score += 8;
    for (const h of ageHints) {
      if (h && n.includes(norm(h))) score += 5;
    }
    for (const h of sexHints) {
      if (n.includes(norm(h))) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best || bestScore < 5) return "";
  return String(best.id);
}

/** Apply carded-team selection onto competition form fields. */
export function applyCardIndexSelection(form, cardIndexId, cardIndexes, teams) {
  const id = String(cardIndexId || "");
  if (!id) {
    return { ...form, card_index_id: "" };
  }
  const ci = (cardIndexes || []).find((c) => String(c.id) === id);
  if (!ci) {
    return { ...form, card_index_id: id };
  }
  const next = { ...form, card_index_id: id };
  const coachId = ci.assigned_coach_user_id;
  if (coachId) next.coach_id = String(coachId);
  const teamId = guessTeamIdForCardIndex(ci, teams);
  if (teamId) next.team_id = teamId;
  return next;
}
