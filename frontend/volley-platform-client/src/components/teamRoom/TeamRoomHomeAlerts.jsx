export default function TeamRoomHomeAlerts({ notifications, onOpen }) {
  if (!notifications?.length) return null;

  return (
    <ul className="teamRoomHomeAlerts" aria-label="Известия от треньора">
      {notifications.map((item) => (
        <li key={item.marker_key}>
          <button type="button" className="teamRoomHomeAlertBtn" onClick={() => onOpen(item)}>
            <span className="teamRoomHomeAlertIcon" aria-hidden>
              !
            </span>
            <span className="teamRoomHomeAlertText">
              <span className="teamRoomHomeAlertTitle">{item.title}</span>
              <span className="teamRoomHomeAlertBody">{item.body}</span>
            </span>
            <span className="teamRoomHomeAlertChevron" aria-hidden>
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
