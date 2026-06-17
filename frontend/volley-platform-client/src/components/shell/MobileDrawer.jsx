import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function MobileDrawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="mobileDrawerRoot" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="mobileDrawerBackdrop" aria-label="Затвори" onClick={onClose} />
      <div className="mobileDrawerSheet">
        <div className="mobileDrawerHead">
          <strong>{title}</strong>
          <button type="button" className="mobileDrawerClose" onClick={onClose}>
            Затвори
          </button>
        </div>
        <div className="mobileDrawerBody">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
