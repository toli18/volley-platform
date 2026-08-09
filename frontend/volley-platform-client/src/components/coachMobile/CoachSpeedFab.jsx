import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../ui";

/**
 * Mobile speed-dial FAB (+).
 * actions: [{ id, label, to?, onClick?, primary? }]
 */
export default function CoachSpeedFab({ actions = [], label = "Добави" }) {
  const [open, setOpen] = useState(false);
  const items = (actions || []).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <>
      {open ? (
        <button
          type="button"
          className="coachSpeedFabBackdrop"
          aria-label="Затвори меню"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open ? (
        <div className="coachSpeedFabMenu" role="menu">
          {items.map((action) => {
            const btn = (
              <Button
                size="sm"
                variant={action.primary ? "primary" : "secondary"}
                block
                onClick={
                  action.to
                    ? undefined
                    : () => {
                        setOpen(false);
                        action.onClick?.();
                      }
                }
              >
                {action.label}
              </Button>
            );
            if (action.to) {
              return (
                <Link
                  key={action.id}
                  to={action.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  style={{ textDecoration: "none" }}
                >
                  {btn}
                </Link>
              );
            }
            return (
              <div key={action.id} role="menuitem">
                {btn}
              </div>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        className="coachSpeedFab"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
    </>
  );
}
