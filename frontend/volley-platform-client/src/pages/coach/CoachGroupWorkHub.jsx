import { COACH_GROUP_WORK_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachGroupWorkHub() {
  return (
    <CoachHubPage
      title="Работа с групата"
      subtitle="Програмна седмица, присъствие и тестирания на едно място"
    >
      <MenuGroup title="Инструменти">
        {COACH_GROUP_WORK_HUB_LINKS.map((item) => (
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
