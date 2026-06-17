import useNavRoles from "../../navigation/useNavRoles";
import { COACH_CLUB_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

function filterLink(item, { isHeadCoachUser }) {
  if (item.headCoachOnly && !isHeadCoachUser) return false;
  return true;
}

export default function CoachClubHub() {
  const { isHeadCoachUser } = useNavRoles();
  const links = COACH_CLUB_HUB_LINKS.filter((item) => filterLink(item, { isHeadCoachUser }));

  return (
    <CoachHubPage title="Клуб & отбори" subtitle="Отбори, график, такси, тренировки и присъствие">
      <MenuGroup title="Работа">
        {links.map((item) => (
          <MenuLink key={item.id} to={item.to} label={item.label} hint={item.hint} accent={item.accent} icon={item.icon} />
        ))}
      </MenuGroup>
    </CoachHubPage>
  );
}
