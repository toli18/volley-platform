import { useEffect, useRef } from "react";
import useNavRoles from "../../navigation/useNavRoles";

export default function ProfileMenu({ open, onToggle, onClose, onLogout }) {
  const { user } = useNavRoles();
  const rootRef = useRef(null);
  const userLabel = user?.email || user?.username || "Потребител";
  const roleLabel = user?.role ? String(user.role) : "guest";
  const initials = userLabel.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return (
    <div className="profileMenu" ref={rootRef}>
      <button
        type="button"
        className={`profileMenu__trigger ${open ? "profileMenu__trigger--open" : ""}`}
        aria-label="Профил"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        <span className="profileMenu__avatar" aria-hidden>
          {initials}
        </span>
      </button>
      {open ? (
        <div className="profileMenu__dropdown" role="menu">
          <div className="profileMenu__meta">
            <div className="profileMenu__email" title={userLabel}>
              {userLabel}
            </div>
            <div className="profileMenu__role">{roleLabel}</div>
          </div>
          <button type="button" className="profileMenu__logout" role="menuitem" onClick={onLogout}>
            Изход
          </button>
        </div>
      ) : null}
    </div>
  );
}
