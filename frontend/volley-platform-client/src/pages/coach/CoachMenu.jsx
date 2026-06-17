import useNavRoles from "../../navigation/useNavRoles";
import { COACH_MORE_MENU_SECTIONS, COACH_MORE_QUICK_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink, MenuQuickTile } from "../../components/coachMobile/CoachMenuParts";

export default function CoachMenu() {
  const { user, isHeadCoachUser } = useNavRoles();
  const displayName = user?.name || user?.email || "Треньор";
  const roleLabel = isHeadCoachUser ? "Главен треньор" : "Треньор";

  return (
    <CoachHubPage
      title={`Здравей, ${displayName}`}
      subtitle="Бърз достъп до съдържание, инструменти и настройки"
      roleLabel={roleLabel}
    >
      <div className="coachMobileMenuQuickGrid">
        {COACH_MORE_QUICK_LINKS.map((item) => (
          <MenuQuickTile key={item.id} to={item.to} label={item.label} icon={item.icon} accent={item.accent} />
        ))}
      </div>

      {COACH_MORE_MENU_SECTIONS.map((section) => (
        <MenuGroup key={section.title} title={section.title}>
          {section.links.map((item) => (
            <MenuLink
              key={item.id}
              to={item.to}
              label={item.label}
              hint={item.hint}
              accent={item.accent}
              icon={item.icon}
            />
          ))}
        </MenuGroup>
      ))}
    </CoachHubPage>
  );
}
