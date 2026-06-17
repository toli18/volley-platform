import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NavIcon, NavIconChevronDown } from "../../navigation/navIcons";

function pathMatches(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function groupActive(pathname, children) {
  return children?.some((c) => pathMatches(pathname, c.to));
}

export default function NavFlyout({ id, label, icon, children, accent }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const location = useLocation();
  const active = groupActive(location.pathname, children);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`navFlyout ${open ? "navFlyout--open" : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className={`appNavLink appNavLink--flyout ${active ? "appNavLink--active" : ""} ${accent ? "appNavLink--accent" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <NavIcon name={icon} size={16} className="appNavLink__icon" />
        <span>{label}</span>
        <NavIconChevronDown className={`appNavLink__chevron ${open ? "appNavLink__chevron--open" : ""}`} />
      </button>
      {open ? (
        <div className="navFlyout__panel" id={panelId} role="menu" aria-labelledby={id}>
          {children.map((child) => (
            <Link
              key={child.id}
              to={child.to}
              role="menuitem"
              className={`navFlyout__item ${child.accent ? "navFlyout__item--accent" : ""} ${pathMatches(location.pathname, child.to) ? "navFlyout__item--active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <NavIcon name={child.icon} size={16} className="navFlyout__itemIcon" />
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NavFlyoutAdmin({ label, sections }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const location = useLocation();
  const active = sections.some((s) => s.items.some((i) => pathMatches(location.pathname, i.to)));

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`navFlyout ${open ? "navFlyout--open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`appNavLink appNavLink--flyout ${active ? "appNavLink--active" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <NavIcon name="shield" size={16} className="appNavLink__icon" />
        <span>{label}</span>
        <NavIconChevronDown className={`appNavLink__chevron ${open ? "appNavLink__chevron--open" : ""}`} />
      </button>
      {open ? (
        <div className="navFlyout__panel navFlyout__panel--admin" id={panelId} role="menu">
          {sections.map((section) => (
            <div key={section.id} className="navFlyout__section">
              <div className="navFlyout__sectionLabel">{section.label}</div>
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  role="menuitem"
                  className={`navFlyout__item ${pathMatches(location.pathname, item.to) ? "navFlyout__item--active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon name={item.icon} size={16} className="navFlyout__itemIcon" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
