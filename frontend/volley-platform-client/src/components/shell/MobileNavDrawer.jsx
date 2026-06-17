import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import useNavItems from "../../navigation/useNavItems";
import { NavIcon } from "../../navigation/navIcons";
import NotificationPanel from "./NotificationPanel";

function AccordionSection({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`navMobileAccordion ${open ? "navMobileAccordion--open" : ""}`}>
      <button type="button" className="navMobileAccordion__trigger" onClick={() => setOpen((v) => !v)}>
        <span className="navMobileAccordion__label">
          <NavIcon name={icon} size={18} className="navMobileAccordion__icon" />
          {title}
        </span>
        <span className="navMobileAccordion__chev" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? <div className="navMobileAccordion__body">{children}</div> : null}
    </div>
  );
}

export default function MobileNavDrawer({
  open,
  onClose,
  user,
  userLabel,
  roleLabel,
  isCoachUser,
  isHeadCoachUser,
  newTaskCount,
  combinedUnreadCount,
  onLogout,
  feedProps,
}) {
  const { primaryNav, adminNavSections } = useNavItems();
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);

  if (!open) return null;

  return createPortal(
    <div className="navMobileRoot" role="dialog" aria-modal="true" aria-label="Меню">
      <button type="button" className="navMobileBackdrop" aria-label="Затвори" onClick={onClose} />
      <div className="navMobileSheet">
        <div className="navMobileSheetHeader">
          <span className="navMobileSheetTitle">Навигация</span>
          <button type="button" className="navMobileClose" onClick={onClose}>
            Затвори
          </button>
        </div>

        {user ? (
          <div className="navMobileAccount">
            <div className="navMobileUser">
              <div className="navMobileUserEmail" title={userLabel}>
                {userLabel}
              </div>
              <div className="navMobileUserRole">{roleLabel}</div>
            </div>
            <div className="navMobileAccountActions">
              {isCoachUser ? (
                <Link to="/my-trainings" className="navMobilePill" onClick={onClose}>
                  Задачи ({newTaskCount})
                </Link>
              ) : null}
              <button
                type="button"
                className="navMobilePill"
                aria-expanded={mobileNotifOpen}
                onClick={() => setMobileNotifOpen((v) => !v)}
              >
                Известия ({combinedUnreadCount})
              </button>
              <button type="button" className="navMobilePill navMobilePill--danger" onClick={onLogout}>
                Изход
              </button>
            </div>
            {mobileNotifOpen ? (
              <div className="navMobileNotifPanel">
                <NotificationPanel
                  {...feedProps}
                  isHeadCoachUser={isHeadCoachUser}
                  onClose={() => {
                    setMobileNotifOpen(false);
                    onClose();
                  }}
                />
                <Link to="/forum" className="appNavLink appNavLink--sheet navMobileForumLink" onClick={onClose}>
                  Към форума
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="navMobileAccount">
            <Link to="/login" className="navMobilePill" onClick={onClose}>
              Вход
            </Link>
          </div>
        )}

        <div className="navMobileLinks">
          {primaryNav.map((item) => {
            if (item.type === "group") {
              return (
                <AccordionSection key={item.id} title={item.label} icon={item.icon} defaultOpen={item.id === "learning"}>
                  {item.children.map((child) => (
                    <Link
                      key={child.id}
                      className={`appNavLink appNavLink--sheet appNavLink--sheetChild ${child.accent ? "appNavLink--accent" : ""}`}
                      to={child.to}
                      onClick={onClose}
                    >
                      <NavIcon name={child.icon} size={16} className="appNavLink__icon" />
                      {child.label}
                    </Link>
                  ))}
                </AccordionSection>
              );
            }
            return (
              <Link
                key={item.id}
                className={`appNavLink appNavLink--sheet ${item.accent ? "appNavLink--accent" : ""}`}
                to={item.to}
                onClick={onClose}
              >
                <NavIcon name={item.icon} size={16} className="appNavLink__icon" />
                {item.label}
              </Link>
            );
          })}

          {adminNavSections.length > 0 ? (
            <AccordionSection title="Админ" icon="shield">
              {adminNavSections.map((section) => (
                <div key={section.id} className="navMobileAdminSection">
                  <div className="navMobileSectionLabel">{section.label}</div>
                  {section.items.map((item) => (
                    <Link
                      key={item.id}
                      className="appNavLink appNavLink--sheet appNavLink--sheetChild"
                      to={item.to}
                      onClick={onClose}
                    >
                      <NavIcon name={item.icon} size={16} className="appNavLink__icon" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}
            </AccordionSection>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
