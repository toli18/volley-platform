import { createContext, useContext, useMemo, useState } from "react";

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
      <div
        className="uiToastStack"
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 12000,
          display: "grid",
          gap: 8,
          pointerEvents: "none",
          maxWidth: "min(92vw, 380px)",
        }}
      >
        {toasts.map((toast) => {
          const theme = kinds[toast.type] || kinds.info;
          return (
            <div
              key={toast.id}
              style={{
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                color: theme.color,
                borderRadius: 10,
                padding: "10px 12px",
                boxShadow: "0 10px 28px rgba(15, 23, 42, 0.13)",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {toast.message}
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

