// src/pages/admin/AdminDrills.jsx
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

export default function AdminDrills() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDrills = async () => {
    try {
      setLoading(true);
      setError("");

      // при теб работи /drills/drills
      let res;
      try {
        res = await axiosInstance.get(API_PATHS.DRILLS_LIST_ALIAS);
      } catch {
        res = await axiosInstance.get(API_PATHS.DRILLS_LIST);
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
    fetchDrills();
  }, []);

  const deleteDrill = async (id) => {
    if (!window.confirm("Сигурен ли си, че искаш да изтриеш упражнението?")) return;

    try {
      await axiosInstance.delete(API_PATHS.DRILL_DELETE(id));
      // рефреш на листа
      await fetchDrills();
    } catch (e) {
      alert("Грешка: " + normalizeFastApiError(e));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ marginTop: 0 }}>📋 Admin: Всички упражнения</h2>

        <button
          onClick={fetchDrills}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #333", background: "white" }}
        >
          🔄 Рефреш
        </button>
      </div>

      {loading && <p>Зареждане...</p>}

      {error && (
        <div style={{ background: "#ffdddd", padding: 10, borderRadius: 6, color: "#c33" }}>
          Грешка: {error}
        </div>
      )}

      {!loading && !error && drills.length === 0 && <p>Няма упражнения.</p>}

      {!loading && !error && drills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drills.map((d) => (
            <div key={d.id} style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <h3 style={{ margin: "0 0 6px 0" }}>{d.title || d.name || "няма име"}</h3>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    ID: {d.id} • Статус: {d.status || "unknown"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  {/* Преглед (публичната страница) */}
                  <Link
                    to={`/drills/${d.id}`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #0066cc",
                      color: "#0066cc",
                      textDecoration: "none",
                      height: "fit-content",
                    }}
                  >
                    Преглед
                  </Link>

                  {/* Админ редакция */}
                  <Link
                    to={`/admin/drills/${d.id}/edit`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #333",
                      color: "#333",
                      textDecoration: "none",
                      height: "fit-content",
                    }}
                  >
                    Редакция
                  </Link>

                  {/* Админ delete */}
                  <button
                    onClick={() => deleteDrill(d.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc3545",
                      color: "white",
                      cursor: "pointer",
                      height: "fit-content",
                    }}
                  >
                    Изтрий
                  </button>
                </div>
              </div>

              <p style={{ margin: "10px 0 0 0" }}>{d.description || "няма описание"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
