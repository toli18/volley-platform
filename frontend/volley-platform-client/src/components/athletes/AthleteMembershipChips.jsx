/** Compact chips for training groups + SEK carded teams. */
export default function AthleteMembershipChips({
  teamNames = [],
  cardedTeams = [],
  dense = false,
  showEmpty = false,
}) {
  const teams = Array.isArray(teamNames) ? teamNames.filter(Boolean) : [];
  const carded = Array.isArray(cardedTeams)
    ? cardedTeams.map((c) => (typeof c === "string" ? c : c?.label)).filter(Boolean)
    : [];

  if (!teams.length && !carded.length && !showEmpty) return null;

  return (
    <div className={`athleteMembershipChips${dense ? " athleteMembershipChips--dense" : ""}`}>
      {teams.map((name) => (
        <span key={`g-${name}`} className="athleteMembershipChip athleteMembershipChip--group">
          Група: {name}
        </span>
      ))}
      {carded.map((label) => (
        <span key={`c-${label}`} className="athleteMembershipChip athleteMembershipChip--carded">
          СЕК: {label}
        </span>
      ))}
      {showEmpty && !teams.length ? (
        <span className="athleteMembershipChip athleteMembershipChip--muted">без група</span>
      ) : null}
      {showEmpty && !carded.length ? (
        <span className="athleteMembershipChip athleteMembershipChip--muted">без картотека</span>
      ) : null}
    </div>
  );
}
