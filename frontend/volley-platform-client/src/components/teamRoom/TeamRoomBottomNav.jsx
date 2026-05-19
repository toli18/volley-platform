import { IconCalendar, IconChat, IconHome, IconUser } from "./teamRoomIcons";

const TABS = [
  { id: "home", label: "Начало", Icon: IconHome, badgeKey: "home" },
  { id: "schedule", label: "График", Icon: IconCalendar, badgeKey: null },
  { id: "messages", label: "Чатове", Icon: IconChat, badgeKey: "messages" },
  { id: "profile", label: "Профил", Icon: IconUser, badgeKey: null },
];

export default function TeamRoomBottomNav({ activeTab, onChange, badges = {}, avatarUrl }) {
  return (
    <nav className="teamRoomBottomNav" aria-label="Основна навигация">
      {TABS.map(({ id, label, Icon, badgeKey }) => {
        const active = activeTab === id;
        const showBadge = badgeKey && badges[badgeKey];
        const isProfile = id === "profile";
        return (
          <button
            key={id}
            type="button"
            className={`teamRoomBottomNavBtn${active ? " is-active" : ""}`}
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
          >
            <span className="teamRoomBottomNavIconWrap">
              {isProfile && avatarUrl ? (
                <img src={avatarUrl} alt="" className="teamRoomBottomNavAvatar" />
              ) : (
                <Icon className="teamRoomBottomNavIcon" size={22} />
              )}
              {showBadge ? <span className="teamRoomBadgeDot" aria-hidden /> : null}
            </span>
            <span className="teamRoomBottomNavLabel">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
