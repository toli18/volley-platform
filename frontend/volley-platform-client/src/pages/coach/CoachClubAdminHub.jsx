import { COACH_CLUB_ADMIN_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachClubAdminHub() {
  return (
    <CoachHubPage
      title="Клуб"
      subtitle="Профил, документи, администрация БФВ, клубен преглед и картотека"
    >
      <MenuGroup title="Управление">
        {COACH_CLUB_ADMIN_HUB_LINKS.map((item) => (
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
    </CoachHubPage>
  );
}
