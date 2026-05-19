/** Unified SVG icons for parent portal (24px viewBox). */

function Svg({ children, className, size = 20 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function IconBell({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm7-6.6V11a7 7 0 0 0-5-6.7V3.4a2 2 0 1 0-4 0v1.3a7 7 0 0 0-5 6.7v4.4L4 17.4h16l-1-2Z"
      />
    </Svg>
  );
}

export function IconHome({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 3 3 10.2V20a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1v-9.8L12 3Z"
      />
    </Svg>
  );
}

export function IconCalendar({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm13 8H4v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V10Z"
      />
    </Svg>
  );
}

export function IconEuro({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 4.9 1.7l-1.2 1.4A6 6 0 0 0 12 6a6 6 0 0 0-4.2 10.2l1.4 1.2A8 8 0 0 1 12 20a8 8 0 0 1-4.9-1.7l1.2-1.4A6 6 0 0 0 12 18a6 6 0 0 0 4.2-10.2l-1.4-1.2A8 8 0 0 1 12 4Zm-1 4h2v2h-2V8Zm0 4h2v4h-2v-4Z"
      />
    </Svg>
  );
}

export function IconTeam({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a1 1 0 0 1-1-1 5 5 0 0 1 10 0 1 1 0 0 1-1 1H5Zm9 0a1 1 0 0 1-1-1 4 4 0 0 1 8 0 1 1 0 0 1-1 1h-6Z"
      />
    </Svg>
  );
}

export function IconRefresh({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6 1 1 0 1 1 2 0 8 8 0 1 0-8-8Zm-2 12a6 6 0 0 1 6-6 1 1 0 1 1-2 0 4 4 0 1 0-4 4H4l4 4v-3a8 8 0 0 0 2-1Z"
      />
    </Svg>
  );
}

export function IconTraining({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 2 4 6v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V6l-8-4Zm0 2.2 6 3v4.8c0 3.8-2.5 7.3-6 8.5-3.5-1.2-6-4.7-6-8.5V7.2l6-3Z"
      />
    </Svg>
  );
}

export function IconCompetition({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M7 3h10l1 3h3v2h-1.1l-1.4 9.2A3 3 0 0 1 16.6 20H7.4a3 3 0 0 1-3-2.8L3 8H2V6h3l2-3Zm1.2 2 .6 2h6.4l.6-2H8.2ZM6.2 10l1.2 7.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L19.8 10H6.2Z"
      />
    </Svg>
  );
}

export function IconClock({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-.75 3.5a1 1 0 0 1 1 1V12l2.5 2.5a1 1 0 0 1-1.4 1.4l-3-3A1 1 0 0 1 11.25 7.5Z"
      />
    </Svg>
  );
}

export function IconLocation({ className, size }) {
  return (
    <Svg className={className} size={size}>
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
      />
    </Svg>
  );
}

export function EventTypeChip({ variant, label }) {
  const isComp = variant === "competition";
  return (
    <span
      className={`parentPortalTypeChip${isComp ? " parentPortalTypeChip--competition" : " parentPortalTypeChip--training"}`}
    >
      {isComp ? <IconCompetition size={16} /> : <IconTraining size={16} />}
      <span>{label}</span>
    </span>
  );
}
