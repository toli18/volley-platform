import { Link } from "react-router-dom";

export function MenuGroup({ title, children }) {
  return (
    <section className="coachMobileMenuGroup">
      <h2 className="coachMobileSectionTitle">{title}</h2>
      <ul className="coachMobileMenuList">{children}</ul>
    </section>
  );
}

export function MenuLink({ to, label, hint, accent = false }) {
  return (
    <li>
      <Link to={to} className={`coachMobileMenuRow${accent ? " coachMobileMenuRow--accent" : ""}`}>
        <span>
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

export function CoachHubPage({ title, subtitle, children }) {
  return (
    <div className="coachMobilePage">
      {title ? (
        <section className="coachMobileProfileCard" aria-label={title}>
          <p className="coachMobileProfileGreeting">
            <strong>{title}</strong>
          </p>
          {subtitle ? <p className="coachMobileMuted">{subtitle}</p> : null}
        </section>
      ) : null}
      {children}
    </div>
  );
}
