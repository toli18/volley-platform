import { createContext, useContext, useMemo, useState } from "react";
import "./ui/ui.css";

const ToastContext = createContext(null);

const kinds = {
  success: { bg: "#e9faf1", border: "#8ccfb0", color: "#0a5a3d" },
  error: { bg: "#fff2f3", border: "#f6c7cd", color: "#9f1d28" },
  info: { bg: "#eef6f2", border: "#b9d8c8", color: "#0c5b3e" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const show = (message, type = "info", ttl = 3200) => {
    const msg = String(message || "").trim();
    if (!msg) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message: msg }]);
    window.setTimeout(() => removeToast(id), ttl);
  };

  const value = useMemo(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error", 4200),
      info: (message) => show(message, "info"),
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="uiToastStack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => {
          const theme = kinds[toast.type] || kinds.info;
          return (
            <div
              key={toast.id}
              className="uiToastItem"
              style={{
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                color: theme.color,
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Затвори"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 0,
                  opacity: 0.6,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}

