import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import useNavRoles from "../../navigation/useNavRoles";
import useNavbarFeed from "../../hooks/useNavbarFeed";
import { COACH_MORE_ACCOUNT_LINKS, COACH_MORE_QUICK_LINKS } from "../../navigation/navConfig";
import { CoachHubPage, MenuGroup, MenuLink, MenuQuickTile } from "../../components/coachMobile/CoachMenuParts";
import { Button } from "../../components/ui";

function filterAccountLink(item, { isHeadCoachUser }) {
  if (item.headCoachOnly && !isHeadCoachUser) return false;
  return true;
}

export default function CoachMenu() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, isHeadCoachUser } = useNavRoles();
  const { newTaskCount } = useNavbarFeed();
  const displayName = user?.name || user?.email || "Треньор";
  const roleLabel = isHeadCoachUser ? "Главен треньор" : "Треньор";
  const accountLinks = COACH_MORE_ACCOUNT_LINKS.filter((item) =>
    filterAccountLink(item, { isHeadCoachUser }),
  );

  const handleLogout = () => {
    if (!window.confirm("Сигурни ли сте, че искате да излезете?")) return;
    logout();
    navigate("/login");
  };

  return (
    <CoachHubPage
      title={`Здравей, ${displayName}`}
      subtitle="Инструменти, задачи и акаунт"
      roleLabel={roleLabel}
    >
      {accountLinks.length ? (
        <MenuGroup title="Акаунт">
          {accountLinks.map((item) => (
            <MenuLink
              key={item.id}
              to={item.to}
              label={item.label}
              hint={item.hint}
              icon={item.icon}
              badge={item.id === "tasks" && newTaskCount > 0 ? newTaskCount : null}
            />
          ))}
        </MenuGroup>
      ) : null}

      <section className="coachMobileMenuGroup">
        <h2 className="coachMobileSectionTitle">Инструменти</h2>
        <div className="coachMobileMenuQuickGrid coachMobileMenuQuickGrid--embedded">
          {COACH_MORE_QUICK_LINKS.map((item) => (
            <MenuQuickTile key={item.id} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </div>
      </section>

      <div className="coachMobileMenuLogoutWrap">
        <Button type="button" variant="danger" block onClick={handleLogout}>
          Изход
        </Button>
      </div>
    </CoachHubPage>
  );
}
