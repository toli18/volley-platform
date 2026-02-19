// src/pages/DrillsList.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { isAdmin } from "../utils/auth";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Възникна грешка при заявката.";
};

export default function DrillsList() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      // ✅ ВАЖНО: тук е само /drills (НЕ /drills/drills)
      const res = await axiosInstance.get("/drills");
      setDrills(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Упражнения</h2>

      {error && (
        <div style={{ background: "#ffdddd", padding: 10, borderRadius: 8, color: "#a00", marginBottom: 12 }}>
          <strong>Грешка:</strong> {error}
        </div>
      )}

      {loading && <div>Зареждане…</div>}

      {!loading && !error && drills.length === 0 && <div>Няма налични упражнения.</div>}

      {!loading && !error && drills.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {drills.map((d) => (
            <div key={d.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{d.title || "Без име"}</div>

              <div style={{ color: "#444", marginTop: 6 }}>
                {d.description ? String(d.description).slice(0, 220) + (String(d.description).length > 220 ? "…" : "") : "—"}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <Link
                  to={`/drills/${d.id}`}
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #0066cc",
                    borderRadius: 6,
                    textDecoration: "none",
                    color: "#0066cc",
                    fontWeight: 800,
                  }}
                >
                  Преглед
                </Link>

                {isAdmin() && (
                  <Link
                    to={`/drills/${d.id}/edit`}
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      border: "1px solid #333",
                      borderRadius: 6,
                      textDecoration: "none",
                      color: "#111",
                      fontWeight: 800,
                    }}
                  >
                    Редакция
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button
          onClick={load}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "white",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ⟳ Презареди
        </button>
      </div>
    </div>
  );
}
