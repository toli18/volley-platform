import PlatformBrandBlock from "../shared/PlatformBrandBlock";
import ClubLogo from "../shared/ClubLogo";

export default function TeamRoomLayout({ children, bottomNav, headerActions, clubLogoUrl, clubName }) {
  return (
    <div className="teamRoomShell">
      <header className="portalShellHeader teamRoomPortalHeader">
        <div className="portalShellHeaderInner teamRoomPortalHeaderInner">
          <PlatformBrandBlock subtitle="Отборна стая" />
          <div className="portalShellHeaderEnd">
            {clubLogoUrl ? <ClubLogo logoUrl={clubLogoUrl} name={clubName} className="portalHeaderClubLogo" /> : null}
            {headerActions || null}
          </div>
        </div>
      </header>
      <main className="teamRoomMain">{children}</main>
      {bottomNav}
    </div>
  );
}
