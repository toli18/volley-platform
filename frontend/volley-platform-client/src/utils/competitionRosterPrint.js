// Данни за преглед/печат на тимов лист (без pop-up — in-app преглед).

import { competitionKindLabel } from "./competitionKinds";

export function rosterStatusLabel(status, locked) {
  if (locked || status === "locked") return "Заключен състав";
  if (status === "confirmed") return "Потвърден състав";
  return "Чернова / чака потвърждение";
}

/**
 * @param {object} event
 * @param {object} roster
 * @param {number[]} [overrideIds] текущ избор в drawer (още незаписан)
 */
export function buildRosterPrintModel(event, roster, overrideIds = null) {
  const ids = new Set(
    (overrideIds != null ? overrideIds : roster?.athlete_ids || []).map(Number),
  );
  const selected = (roster?.candidates || [])
    .filter((c) => ids.has(Number(c.id)) || (overrideIds == null && c.selected))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));

  const covered = new Set(selected.map((c) => Number(c.id)));
  for (const id of ids) {
    if (!covered.has(id)) selected.push({ id, name: `Състезател #${id}` });
  }

  return {
    event,
    athletes: selected,
    kind: competitionKindLabel(event),
    status: rosterStatusLabel(roster?.status, roster?.locked),
    maxAthletes: roster?.max_athletes || 14,
    count: selected.length,
  };
}
