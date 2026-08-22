import { useState } from "react";

import Button from "./Button";
import Modal from "./Modal";

/** Compact ⋮ menu — opens a bottom-style action sheet (mobile-friendly). */
export default function OverflowActionSheet({ label = "Още действия", actions = [], size = "sm" }) {
  const [open, setOpen] = useState(false);
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="secondary"
        aria-label={label}
        className="overflowActionTrigger"
        onClick={() => setOpen(true)}
      >
        ⋮
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Действия" size="compact">
        <div className="overflowActionSheetList">
          {visible.map((action) => (
            <Button
              key={action.key || action.label}
              type="button"
              variant={action.variant || "secondary"}
              block
              disabled={action.disabled}
              onClick={() => {
                action.onClick?.();
                setOpen(false);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="ghost" block onClick={() => setOpen(false)}>
          Затвори
        </Button>
      </Modal>
    </>
  );
}
