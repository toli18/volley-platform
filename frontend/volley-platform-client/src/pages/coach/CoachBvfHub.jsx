import useNavRoles from "../../navigation/useNavRoles";
import { COACH_BVF_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

function filterLink(item, { isHeadCoachUser }) {
  if (item.headCoachOnly && !isHeadCoachUser) return false;
  return true;
}

export default function CoachBvfHub() {
  const { isHeadCoachUser } = useNavRoles();
  const links = COACH_BVF_HUB_LINKS.filter((item) => filterLink(item, { isHeadCoachUser }));

  return (
    <CoachHubPage title="Обучение & Ресурси" subtitle="Учебник, годишна програма, администрация и AI">
      <MenuGroup>
        {links.map((item) => (
          <MenuLink key={item.id} to={item.to} label={item.label} hint={item.hint} accent={item.accent} icon={item.icon} />
        ))}
      </MenuGroup>
    </CoachHubPage>
  );
}
