export default function ParentCoachContact({ coach, className = "" }) {
  const feeCoach = coach || {};
  if (!feeCoach.name && !feeCoach.email && !feeCoach.club_phone) {
    return null;
  }

  return (
    <div className={`parentPortalContactBox${className ? ` ${className}` : ""}`}>
      <div className="parentPortalContactLabel">Треньор</div>
      {feeCoach.name ? <div>{feeCoach.name}</div> : null}
      {feeCoach.email ? (
        <a href={`mailto:${feeCoach.email}`} className="parentPortalContactLink">
          {feeCoach.email}
        </a>
      ) : null}
      {feeCoach.club_name ? <div className="parentPortalHighlightMuted">{feeCoach.club_name}</div> : null}
      {feeCoach.club_phone ? (
        <a href={`tel:${feeCoach.club_phone}`} className="parentPortalContactLink">
          {feeCoach.club_phone}
        </a>
      ) : null}
    </div>
  );
}
