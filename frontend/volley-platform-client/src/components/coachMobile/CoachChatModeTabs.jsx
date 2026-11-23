import { NavLink } from "react-router-dom";

/** Превключвател Състезатели / Родители в мобилния раздел Чат. */
export default function CoachChatModeTabs() {
  return (
    <nav className="coachMobileSubNav coachChatModeTabs" role="tablist" aria-label="Тип чат">
      <NavLink
        to="/coach/chat"
        end
        role="tab"
        className={({ isActive }) => `coachMobileSubNavBtn${isActive ? " is-active" : ""}`}
      >
        Състезатели
      </NavLink>
      <NavLink
        to="/coach/chat/parents"
        role="tab"
        className={({ isActive }) => `coachMobileSubNavBtn${isActive ? " is-active" : ""}`}
      >
        Родители
      </NavLink>
    </nav>
  );
}