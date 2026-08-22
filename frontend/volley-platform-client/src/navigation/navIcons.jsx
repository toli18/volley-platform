const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ className, size = 18, children }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  );
}

export function NavIconHome(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Svg>
  );
}

export function NavIconTeams(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M8 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20a4 4 0 0 1 8 0M12 20a4 4 0 0 1 8 0" />
    </Svg>
  );
}

export function NavIconBook(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm14 3h1a2 2 0 0 1 2 2v11a3 3 0 0 0-3-3h-1V7Z" />
    </Svg>
  );
}

export function NavIconSparkles(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m12 3 1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3ZM5 14l.8 2.4L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.6L5 14Zm14 0 .8 2.4L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.6L19 14Z" />
    </Svg>
  );
}

export function NavIconChat(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3V7a2 2 0 0 1 2-2Z" />
    </Svg>
  );
}

export function NavIconCalendar(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M7 3v2M17 3v2M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </Svg>
  );
}

export function NavIconDrill(props) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="8" />
      <path {...stroke} d="M12 8v8M8 12h8" />
    </Svg>
  );
}

export function NavIconArticle(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M6 4h9l3 3v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path {...stroke} d="M14 4v4h4M8 12h8M8 16h8" />
    </Svg>
  );
}

export function NavIconTraining(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 14h16M7 10h10M9 6h6M6 18h12" />
    </Svg>
  );
}

export function NavIconCheck(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m5 12 4 4L19 6" />
    </Svg>
  );
}

export function NavIconShield(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 3 19 6v6c0 4.5-3.2 7.4-7 9-3.8-1.6-7-4.5-7-9V6l7-3Z" />
    </Svg>
  );
}

export function NavIconFees(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 3v18M7 8h7a3 3 0 1 1 0 6H9" />
    </Svg>
  );
}

export function NavIconBell(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M15 17H9l-1-2H6a4 4 0 0 1 4-4V9a4 4 0 1 1 8 0v2a4 4 0 0 1 4 4h-2l-1 2Z" />
      <path {...stroke} d="M10 19a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function NavIconTasks(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M9 11l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
    </Svg>
  );
}

export function NavIconChevronDown(props) {
  return (
    <Svg {...props} size={props.size || 14}>
      <path {...stroke} d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function NavIconSettings(props) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      />
    </Svg>
  );
}

export function NavIconEuro(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M18 7.5A6.5 6.5 0 1 0 18 16.5" />
      <path {...stroke} d="M4 11h9M4 14h7" />
    </Svg>
  );
}

export function NavIconClipboardCheck(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect {...stroke} x="9" y="3" width="6" height="4" rx="1" />
      <path {...stroke} d="m9 13.5 2 2 4-4" />
    </Svg>
  );
}

export function NavIconChart(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 20h16" />
      <path {...stroke} d="M8 20v-6M12 20V8M16 20v-9" />
    </Svg>
  );
}

export function NavIconTable(props) {
  return (
    <Svg {...props}>
      <rect {...stroke} x="4" y="5" width="16" height="14" rx="1.5" />
      <path {...stroke} d="M4 10h16M4 14.5h16M9.5 5v14M14.5 5v14" />
    </Svg>
  );
}

export function NavIconStopwatch(props) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="14" r="7" />
      <path {...stroke} d="M12 14V10M10 2h4M18.6 6.4 20 5" />
    </Svg>
  );
}

export function NavIconTarget(props) {
  return (
    <Svg {...props}>
      <circle {...stroke} cx="12" cy="12" r="8" />
      <circle {...stroke} cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function NavIconLayers(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path {...stroke} d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </Svg>
  );
}

export function NavIconForum(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M3 5.5A1.5 1.5 0 0 1 4.5 4h9A1.5 1.5 0 0 1 15 5.5v5A1.5 1.5 0 0 1 13.5 12H7l-4 3V5.5Z" />
      <path {...stroke} d="M9 15v.5A1.5 1.5 0 0 0 10.5 17H17l4 3v-9.5A1.5 1.5 0 0 0 19.5 9H18" />
    </Svg>
  );
}

export function NavIconBoard(props) {
  return (
    <Svg {...props}>
      <rect {...stroke} x="3" y="4" width="18" height="13" rx="1.5" />
      <path {...stroke} d="M12 17v3M8 20h8" />
      <circle {...stroke} cx="8" cy="9" r="1.3" />
      <circle {...stroke} cx="15" cy="12" r="1.3" />
      <path {...stroke} d="m9.2 9.6 4.6 1.8" />
    </Svg>
  );
}

export function NavIconBuilding(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M5 20V9l7-5 7 5v11" />
      <path {...stroke} d="M9 20v-5h6v5M9 12h1M14 12h1M9 16h1M14 16h1" />
    </Svg>
  );
}

export function NavIconFolder(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
    </Svg>
  );
}

export function NavIconLink(props) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path {...stroke} d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </Svg>
  );
}

const ICON_MAP = {
  home: NavIconHome,
  teams: NavIconTeams,
  book: NavIconBook,
  sparkles: NavIconSparkles,
  chat: NavIconChat,
  calendar: NavIconCalendar,
  drill: NavIconDrill,
  article: NavIconArticle,
  training: NavIconTraining,
  check: NavIconCheck,
  shield: NavIconShield,
  fees: NavIconFees,
  tasks: NavIconTasks,
  bell: NavIconBell,
  settings: NavIconSettings,
  euro: NavIconEuro,
  clipboardCheck: NavIconClipboardCheck,
  chart: NavIconChart,
  table: NavIconTable,
  stopwatch: NavIconStopwatch,
  target: NavIconTarget,
  layers: NavIconLayers,
  forum: NavIconForum,
  board: NavIconBoard,
  building: NavIconBuilding,
  folder: NavIconFolder,
  link: NavIconLink,
};

export function NavIcon({ name, className, size }) {
  const Cmp = ICON_MAP[name] || NavIconHome;
  return <Cmp className={className} size={size} />;
}
