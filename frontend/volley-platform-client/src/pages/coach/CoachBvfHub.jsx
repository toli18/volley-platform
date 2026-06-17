import { COACH_BVF_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachBvfHub() {
  return (
    <CoachHubPage title="БФВ методика" subtitle="Учебник, годишна програма и AI помощник">
      <MenuGroup title="Обучение & ресурси">
        {COACH_BVF_HUB_LINKS.map((item) => (
          <MenuLink key={item.id} to={item.to} label={item.label} hint={item.hint} accent={item.accent} />
        ))}
      </MenuGroup>
    </CoachHubPage>
  );
}
