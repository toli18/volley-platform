import PlatformBrandBlock from "../shared/PlatformBrandBlock";

export default function TeamRoomLayout({ children, bottomNav, headerActions }) {
  return (
    <div className="teamRoomShell">
      <header className="portalShellHeader teamRoomPortalHeader">
        <div className="portalShellHeaderInner teamRoomPortalHeaderInner">
          <PlatformBrandBlock subtitle="Отборна стая" />
          {headerActions || null}
        </div>
      </header>
      <main className="teamRoomMain">{children}</main>
      {bottomNav}
    </div>
  );
}
