import { IconCalendar, IconHome } from "../teamRoom/teamRoomIcons";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };

export { IconHome, IconCalendar };

export function IconTeams({ className, size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M8 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20a4 4 0 0 1 8 0M12 20a4 4 0 0 1 8 0" />
    </svg>
  );
}

export function IconMenu({ className, size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}

export function IconBook({ className, size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm14 3h1a2 2 0 0 1 2 2v11a3 3 0 0 0-3-3h-1V7Z" />
    </svg>
  );
}

export function IconSparkles({ className, size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="m12 3 1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3ZM5 14l.8 2.4L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.6L5 14Zm14 0 .8 2.4L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.6L19 14Z" />
    </svg>
  );
}

export function IconChat({ className, size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

const COACH_TAB_ICONS = {
  home: IconHome,
  teams: IconTeams,
  calendar: IconCalendar,
  book: IconBook,
  menu: IconMenu,
  chat: IconChat,
};

export function coachTabIcon(name) {
  return COACH_TAB_ICONS[name] || IconMenu;
}
