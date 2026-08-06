import { COACH_MY_CONTENT_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachMyContentHub() {
  return (
    <CoachHubPage title="Моето съдържание" subtitle="Лични упражнения и статии на едно място">
      <MenuGroup title="Моето">
        {COACH_MY_CONTENT_HUB_LINKS.map((item) => (
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
