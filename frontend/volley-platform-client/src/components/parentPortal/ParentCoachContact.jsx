function hasCoachContact(coach) {
  const c = coach || {};
  return Boolean(c.name || c.email || c.phone || c.club_phone);
}

export function parentHasCoachContact(coach) {
  return hasCoachContact(coach);
}

export default function ParentCoachContact({ coach, className = "" }) {
  const feeCoach = coach || {};
  if (!hasCoachContact(feeCoach)) {
    return null;
  }

  return (
    <div className={`parentPortalContactBox${className ? ` ${className}` : ""}`}>
      <div className="parentPortalContactLabel">Треньор</div>
      {feeCoach.name ? <div className="parentPortalContactName">{feeCoach.name}</div> : null}
      {feeCoach.phone ? (
        <div className="parentPortalContactPhoneRow">
          <span className="parentPortalContactPhoneLabel">Телефон</span>
          <a href={`tel:${feeCoach.phone}`} className="parentPortalContactPhone">
            {feeCoach.phone}
          </a>
        </div>
      ) : null}
      {feeCoach.email ? (
        <a href={`mailto:${feeCoach.email}`} className="parentPortalContactLink">
          {feeCoach.email}
        </a>
      ) : null}
      {feeCoach.club_name ? <div className="parentPortalHighlightMuted">{feeCoach.club_name}</div> : null}
      {feeCoach.club_phone ? (
        <div className="parentPortalContactPhoneRow parentPortalContactPhoneRow--club">
          <span className="parentPortalContactPhoneLabel">Клуб</span>
          <a href={`tel:${feeCoach.club_phone}`} className="parentPortalContactLink">
            {feeCoach.club_phone}
          </a>
        </div>
      ) : null}
    </div>
  );
}
