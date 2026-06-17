import { Link } from "react-router-dom";

import { NavIcon } from "../../navigation/navIcons";

export function MenuGroup({ title, children }) {
  return (
    <section className="coachMobileMenuGroup">
      <h2 className="coachMobileSectionTitle">{title}</h2>
      <ul className="coachMobileMenuList">{children}</ul>
    </section>
  );
}

export function MenuLink({ to, label, hint, accent = false, icon }) {
  return (
    <li>
      <Link to={to} className={`coachMobileMenuRow${accent ? " coachMobileMenuRow--accent" : ""}`}>
        {icon ? (
          <span className={`coachMobileMenuIconWrap${accent ? " coachMobileMenuIconWrap--accent" : ""}`}>
            <NavIcon name={icon} size={18} />
          </span>
        ) : null}
        <span className="coachMobileMenuRowBody">
          <span className="coachMobileMenuLabel">{label}</span>
          {hint ? <span className="coachMobileMuted coachMobileMenuHint">{hint}</span> : null}
        </span>
        <span className="coachMobileTeamChevron" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}

export function MenuQuickTile({ to, label, icon, accent = false }) {
  return (
    <Link to={to} className={`coachMobileMenuQuickTile${accent ? " coachMobileMenuQuickTile--accent" : ""}`}>
      <span className="coachMobileMenuQuickTileIcon">
        <NavIcon name={icon} size={20} />
      </span>
      <span className="coachMobileMenuQuickTileLabel">{label}</span>
    </Link>
  );
}

export function CoachHubPage({ title, subtitle, roleLabel, children }) {
  const initial = String(title || "?")
    .replace(/^Здравей,\s*/i, "")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="coachMobilePage">
      {title ? (
        <section className="coachMobileProfileCard coachMobileProfileCard--rich" aria-label={title}>
          <div className="coachMobileProfileHead">
            <span className="coachMobileProfileAvatar" aria-hidden>
              {initial}
            </span>
            <div>
              <p className="coachMobileProfileGreeting">
                <strong>{title}</strong>
              </p>
              {roleLabel ? <span className="coachMobileProfileRole">{roleLabel}</span> : null}
            </div>
          </div>
          {subtitle ? <p className="coachMobileMuted coachMobileProfileSub">{subtitle}</p> : null}
        </section>
      ) : null}
      {children}
    </div>
  );
}
