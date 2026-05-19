const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };

export { IconHome, IconCalendar } from "../teamRoom/teamRoomIcons";

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
