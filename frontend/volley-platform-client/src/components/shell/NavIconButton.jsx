import "./appHeader.css";

export default function NavIconButton({
  label,
  icon: Icon,
  count = 0,
  active = false,
  onClick,
  className = "",
  badgeMax = 99,
}) {
  const showBadge = Number(count) > 0;
  const badgeLabel = Number(count) > badgeMax ? `${badgeMax}+` : String(count);

  return (
    <button
      type="button"
      className={`navIconBtn ${active ? "navIconBtn--active" : ""} ${className}`.trim()}
      aria-label={showBadge ? `${label} (${count})` : label}
      aria-expanded={active}
      onClick={onClick}
    >
      <Icon className="navIconBtn__icon" size={20} />
      {showBadge ? (
        <span className="navIconBtn__badge" aria-hidden>
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
}
