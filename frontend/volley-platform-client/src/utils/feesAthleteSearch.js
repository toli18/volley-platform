/** Client-side filter for monthly fees athlete list (instant while typing). */
export function filterFeesAthletes(athletes, query) {
  const list = Array.isArray(athletes) ? athletes : [];
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return list;

  const tokens = raw.split(/\s+/).filter(Boolean);

  return list.filter((a) => {
    const teams = Array.isArray(a.team_names) ? a.team_names : [];
    const haystack = [
      a.athlete_name,
      a.parent_name,
      a.athlete_phone,
      a.parent_phone,
      a.birth_year != null ? String(a.birth_year) : "",
      a.notes,
      ...teams,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return tokens.every((t) => haystack.includes(t));
  });
}
