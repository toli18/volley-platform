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

  return (
    <div className="coachMobilePage">
      <MenuGroup title="Работа">
        <MenuLink to="/monthly-fees" label="Месечни такси" />
        <MenuLink to="/my-trainings" label="Моите задачи" />
        <MenuLink to="/ai-generator" label="AI помощник" />
      </MenuGroup>

      <MenuGroup title="Съдържание">
        <MenuLink to="/articles" label="Статии" />
        <MenuLink to="/articles/my" label="Моите статии" />
        <MenuLink to="/forum" label="Форум" />
        <MenuLink to="/drills" label="Упражнения" />
        <MenuLink to="/my-drills" label="Моите упражнения" />
      </MenuGroup>

      <MenuGroup title="Инструменти">
        <MenuLink to="/coach-board" label="Тактическа дъска" />
        <MenuLink to="/generator" label="Генератор" />
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
