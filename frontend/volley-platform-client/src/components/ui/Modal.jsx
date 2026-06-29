import { useEffect, useId, useRef } from "react";
import "./ui.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Accessible dialog: role="dialog", Escape to close, focus trap, focus restore,
 * and body scroll lock while open. Visual styling reuses the existing
 * uiModal* classes so it matches the rest of the app.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - title: string (rendered as the dialog label)
 *  - size: "" | "compact" | "wide"
 *  - dismissable: boolean (default true) — when false, Escape/overlay won't close
 */
export default function Modal({ open, onClose, title, size = "", dismissable = true, children }) {
  const dialogRef = useRef(null);
  const lastActiveRef = useRef(null);
  const autoId = useId();
  const titleId = `${autoId}-title`;

  useEffect(() => {
    if (!open) return undefined;
    lastActiveRef.current = document.activeElement;
    const node = dialogRef.current;
    if (node) {
      const focusables = node.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) focusables[0].focus();
      else node.focus();
    }
    return () => {
      const prev = lastActiveRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const node = dialogRef.current;
        if (!node) return;
        const focusables = Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div className="uiModalOverlay" onClick={() => dismissable && onClose?.()}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cx("uiModal", size === "compact" && "uiModal--compact", size === "wide" && "uiModal--wide")}
      >
        {title ? (
          <h3 className="uiModalTitle" id={titleId}>
            {title}
          </h3>
        ) : null}
        {children}
      </section>
    </div>
  );
}
