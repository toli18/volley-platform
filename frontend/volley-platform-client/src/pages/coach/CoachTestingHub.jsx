import { COACH_TESTING_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachTestingHub() {
  return (
    <CoachHubPage
      title="Тестирания"
      subtitle="Диагностика, скаут таблица и тестова батерия на едно място"
    >
      <MenuGroup title="Инструменти">
        {COACH_TESTING_HUB_LINKS.map((item) => (
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
