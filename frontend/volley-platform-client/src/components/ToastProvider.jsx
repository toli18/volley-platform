import { createContext, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const kinds = {
  success: { bg: "#ecfdf5", border: "#86efac", color: "#166534" },
  error: { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
  info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e3a8a" },
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

