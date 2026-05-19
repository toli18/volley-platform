export default function TeamRoomLayout({ children, bottomNav }) {
  return (
    <div className="teamRoomShell">
      <main className="teamRoomMain">{children}</main>
      {bottomNav}
    </div>
  );
}
