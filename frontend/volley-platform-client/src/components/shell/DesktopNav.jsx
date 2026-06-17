import { Link, useLocation } from "react-router-dom";
import useNavItems from "../../navigation/useNavItems";
import { NavIcon } from "../../navigation/navIcons";
import NavFlyout, { NavFlyoutAdmin } from "./NavFlyout";

function pathMatches(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function DesktopNav({ forumUnreadCount = 0 }) {
  const { primaryNav, adminNavSections } = useNavItems();
  const location = useLocation();

  return (
    <nav className="desktopNav" aria-label="Основна навигация">
      {primaryNav.map((item) => {
        if (item.type === "group") {
          return (
            <NavFlyout
              key={item.id}
              id={`nav-flyout-${item.id}`}
              label={item.label}
              icon={item.icon}
              children={item.children}
            />
          );
        }
        const badge = item.badge === "forumUnread" ? forumUnreadCount : 0;
        return (
          <Link
            key={item.id}
            to={item.to}
            className={`appNavLink ${item.accent ? "appNavLink--accent" : ""} ${pathMatches(location.pathname, item.to) ? "appNavLink--active" : ""}`}
          >
            <NavIcon name={item.icon} size={16} className="appNavLink__icon" />
            <span>{item.label}</span>
            {badge > 0 ? <span className="appNavLink__badge">{badge > 99 ? "99+" : badge}</span> : null}
          </Link>
        );
      })}
      {adminNavSections.length > 0 ? <NavFlyoutAdmin label="Админ" sections={adminNavSections} /> : null}
    </nav>
  );
}
