import { useEffect } from "react";
import useNavRoles from "../../navigation/useNavRoles";
import { COACH_CLUB_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";
import { useAuth } from "../../auth/AuthContext";

function filterLink(item, { isHeadCoachUser, showCardIndexesNav }) {
  if (item.headCoachOnly && !isHeadCoachUser) return false;
  if (item.assignedCardIndexOnly && !showCardIndexesNav) return false;
  return true;
}

export default function CoachClubHub() {
  const { isHeadCoachUser, user } = useNavRoles();
  const { refreshMe } = useAuth();
  const showCardIndexesNav = Boolean(user?.show_card_indexes_nav);
  const links = COACH_CLUB_HUB_LINKS.filter((item) =>
    filterLink(item, { isHeadCoachUser, showCardIndexesNav })
  );

  useEffect(() => {
    // След назначение от главния — обновяваме флага за „Картотечни отбори“.
    refreshMe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CoachHubPage title="Клуб & групи" subtitle="Групи, състезатели, такси, състезания и работа с групата">
      <MenuGroup title="Работа">
        {links.map((item) => (
          <MenuLink key={item.id} to={item.to} label={item.label} hint={item.hint} accent={item.accent} icon={item.icon} />
        ))}
      </MenuGroup>
    </CoachHubPage>
  );
}
