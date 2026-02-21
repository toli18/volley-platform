// src/pages/admin/AdminDrills.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState } from "../../components/ui";

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
    <div className="uiPage">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ marginTop: 0 }}>📋 Admin: Всички упражнения</h2>

        <Button onClick={fetchDrills} variant="secondary" size="sm">
          🔄 Рефреш
        </Button>
      </div>

      {loading && <p>Зареждане...</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && drills.length === 0 && <EmptyState title="Няма упражнения" description="Няма налични записи за админ преглед." />}

      {!loading && !error && drills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drills.map((d) => (
            <Card key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <h3 style={{ margin: "0 0 6px 0" }}>{d.title || d.name || "няма име"}</h3>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    ID: {d.id} • Статус: {d.status || "unknown"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Button as={Link} to={`/drills/${d.id}`} variant="secondary" size="sm">
                    Преглед
                  </Button>

                  <Button as={Link} to={`/admin/drills/${d.id}/edit`} variant="ghost" size="sm">
                    Редакция
                  </Button>

                  <Button onClick={() => deleteDrill(d.id)} variant="danger" size="sm">
                    Изтрий
                  </Button>
                </div>
              </div>

              <p style={{ margin: "10px 0 0 0" }}>{d.description || "няма описание"}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
