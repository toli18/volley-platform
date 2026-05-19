import { IconCalendar, IconEuro, IconHome } from "./parentPortalIcons";

const TABS = [
  { id: "home", label: "Начало", Icon: IconHome },
  { id: "schedule", label: "График", Icon: IconCalendar },
  { id: "fees", label: "Такси", Icon: IconEuro },
];

export default function ParentPortalBottomNav({ activeTab, onChange, scheduleDot }) {
  return (
    <nav className="parentPortalBottomNav" aria-label="Навигация в профила">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        const showDot = id === "schedule" && scheduleDot && !active;
        return (
          <button
            key={id}
            type="button"
            className={`parentPortalBottomNavBtn${active ? " is-active" : ""}`}
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
          >
            <span className="parentPortalBottomNavIconWrap">
              <Icon className="parentPortalBottomNavIcon" size={22} />
              {showDot ? <span className="parentPortalUnreadDot parentPortalUnreadDot--nav" aria-hidden /> : null}
            </span>
            <span className="parentPortalBottomNavLabel">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
