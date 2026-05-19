import PlatformBrandBlock from "../shared/PlatformBrandBlock";

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

export default function ParentPortalLayout({ children, headerActions, fab, bottomNav }) {
  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader portalShellHeader">
        <div className="parentPortalHeaderInner portalShellHeaderInner">
          <PlatformBrandBlock subtitle="Родителски профил" />
          {headerActions ? <div className="parentPortalHeaderActions">{headerActions}</div> : null}
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
