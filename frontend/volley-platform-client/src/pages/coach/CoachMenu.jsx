import { useAuth } from "../../auth/AuthContext";
import { COACH_MORE_MENU_SECTIONS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachMenu() {
  const { user } = useAuth();
  const displayName = user?.name || user?.email || "Треньор";

  return (
    <CoachHubPage title={`Здравей, ${displayName}`} subtitle="Статии, форум, упражнения и още">
      {COACH_MORE_MENU_SECTIONS.map((section) => (
        <MenuGroup key={section.title} title={section.title}>
          {section.links.map((item) => (
            <MenuLink key={item.id} to={item.to} label={item.label} hint={item.hint} accent={item.accent} />
          ))}
        </MenuGroup>
      ))}
    </CoachHubPage>
  );
}
