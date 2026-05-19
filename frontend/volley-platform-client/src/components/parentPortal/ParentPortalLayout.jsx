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
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img
            src="/bfvb-logo.png"
            alt="БФВ"
            className="parentPortalLogo"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <div className="parentPortalBrand">Volley Coach Platform</div>
            <div className="parentPortalBrandSub">Родителски профил</div>
          </div>
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
