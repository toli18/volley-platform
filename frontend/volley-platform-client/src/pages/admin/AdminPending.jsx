// src/pages/admin/AdminPending.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Validation error (422)";
  return "Грешка при заявката";
};

export default function AdminPending() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPending = async () => {
    try {
      setLoading(true);
      setError("");

      // първо пробваме alias-а, който при теб работи
      let res;
      try {
        res = await axiosInstance.get(API_PATHS.DRILLS_PENDING);
      } catch {
        res = await axiosInstance.get(API_PATHS.DRILLS_PENDING_ALIAS);
      }

      const data = res.data;
      setDrills(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>📋 Чакащи упражнения</h2>

      {loading && <p>Зареждане...</p>}

      {error && (
        <div style={{ background: "#ffdddd", padding: 10, borderRadius: 6, color: "#c33" }}>
          Грешка: {error}
        </div>
      )}

      {!loading && !error && drills.length === 0 && <p>Няма чакащи упражнения.</p>}

      {!loading && !error && drills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drills.map((d) => (
            <div key={d.id} style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
              <h3 style={{ margin: "0 0 6px 0" }}>{d.title || d.name || "няма име"}</h3>
              <p style={{ margin: "0 0 10px 0" }}>{d.description || "няма описание"}</p>

              <Link
                to={`/admin/pending/${d.id}`}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  border: "1px solid #0066cc",
                  borderRadius: 4,
                  textDecoration: "none",
                  color: "#0066cc",
                }}
              >
                Преглед / Редакция
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
