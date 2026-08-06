import useNavRoles from "../../navigation/useNavRoles";
import { COACH_LEARNING_HUB_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink } from "../../components/coachMobile/CoachMenuParts";

export default function CoachLearningHub() {
  const { isHeadCoachUser } = useNavRoles();
  const links = COACH_LEARNING_HUB_LINKS.filter(
    (item) => !(item.headCoachOnly && !isHeadCoachUser),
  );

  return (
    <CoachHubPage title="Обучение" subtitle="Учебник БФВ, годишна програма и упражнения">
      <MenuGroup title="Ресурси">
        {links.map((item) => (
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
