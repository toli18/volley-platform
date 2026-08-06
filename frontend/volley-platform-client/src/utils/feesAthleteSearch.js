/** Client-side filter for monthly fees athlete list (instant while typing). */
export function filterFeesAthletes(athletes, query) {
  const list = Array.isArray(athletes) ? athletes : [];
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return list;

  const tokens = raw.split(/\s+/).filter(Boolean);

  return list.filter((a) => {
    const teams = Array.isArray(a.team_names) ? a.team_names : [];
    const carded = Array.isArray(a.carded_teams)
      ? a.carded_teams.map((c) => (typeof c === "string" ? c : c?.label)).filter(Boolean)
      : [];
    const haystack = [
      a.athlete_name,
      a.parent_name,
      a.athlete_phone,
      a.parent_phone,
      a.birth_year != null ? String(a.birth_year) : "",
      a.notes,
      a.bvf_player_number != null ? String(a.bvf_player_number) : "",
      ...teams,
      ...carded,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return tokens.every((t) => haystack.includes(t));
  });
}
