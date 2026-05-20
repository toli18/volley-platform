import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

function MenuGroup({ title, children }) {
  return (
    <section className="coachMobileMenuGroup">
      <h2 className="coachMobileSectionTitle">{title}</h2>
      <ul className="coachMobileMenuList">{children}</ul>
    </section>
  );
}

function MenuLink({ to, label, hint }) {
  return (
    <li>
      <Link to={to} className="coachMobileMenuRow">
        <span>
          <span className="coachMobileMenuLabel">{label}</span>
          {hint ? <span className="coachMobileMuted coachMobileMenuHint">{hint}</span> : null}
        </span>
        <span className="coachMobileTeamChevron" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}

export default function CoachMenu() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const displayName = user?.name || user?.email || "Треньор";

  return (
    <div className="coachMobilePage">
      <section className="coachMobileProfileCard" aria-label="Треньор">
        <p className="coachMobileProfileGreeting">
          Здравей, <strong>{displayName}</strong>
        </p>
        <p className="coachMobileMuted">Меню и бърз достъп до инструментите</p>
      </section>
      <MenuGroup title="Работа">
        <MenuLink to="/coach/fees" label="Месечни такси" />
        <MenuLink to="/coach/trainings" label="Моите тренировки" hint="Списък и нова тренировка" />
        <MenuLink to="/coach-board" label="Тактическа дъска" />
      </MenuGroup>

      <MenuGroup title="Съдържание">
        <MenuLink to="/articles" label="Статии" />
        <MenuLink to="/articles/my" label="Моите статии" />
        <MenuLink to="/forum" label="Форум" />
        <MenuLink to="/drills" label="Упражнения" />
        <MenuLink to="/my-drills" label="Моите упражнения" />
      </MenuGroup>

      {isHeadCoach ? (
        <MenuGroup title="Клуб">
          <MenuLink to="/club-head" label="Club Head Dashboard" hint="Преглед на клуба" />
        </MenuGroup>
      ) : null}

      <MenuGroup title="Друго">
        <MenuLink to="/" label="Пълен dashboard (десктоп)" hint="Класическо начало" />
      </MenuGroup>
    </div>
  );
}
