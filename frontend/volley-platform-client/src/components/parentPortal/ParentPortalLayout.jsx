import PlatformBrandBlock from "../shared/PlatformBrandBlock";
import ClubLogo from "../shared/ClubLogo";

export function ParentPortalTabPanel({ tabId, activeTab, children, className = "" }) {
  const active = activeTab === tabId;
  return (
    <section
      className={`parentPortalTabPanel${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      data-tab={tabId}
      hidden={!active}
      aria-hidden={!active}
    >
      {children}
    </section>
  );
}

export default function ParentPortalLayout({ children, headerActions, fab, bottomNav, clubLogoUrl, clubName }) {
  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader portalShellHeader">
        <div className="parentPortalHeaderInner portalShellHeaderInner">
          <PlatformBrandBlock subtitle="Родителски профил" />
          <div className="portalShellHeaderEnd">
            {clubLogoUrl ? <ClubLogo logoUrl={clubLogoUrl} name={clubName} className="portalHeaderClubLogo" /> : null}
            {headerActions ? <div className="parentPortalHeaderActions">{headerActions}</div> : null}
          </div>
        </div>
      </header>
      <main className="parentPortalMain">{children}</main>
      {fab}
      {bottomNav}
      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}
