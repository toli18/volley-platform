// src/pages/admin/AdminPending.jsx
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
    <div className="uiPage">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ marginTop: 0 }}>📋 Чакащи упражнения</h2>
        <Button variant="secondary" size="sm" onClick={fetchPending}>
          Презареди
        </Button>
      </div>

      {loading && <p>Зареждане...</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && drills.length === 0 && (
        <EmptyState title="Няма чакащи упражнения" description="Когато има нови предложения, ще се покажат тук." />
      )}

      {!loading && !error && drills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drills.map((d) => (
            <Card key={d.id}>
              <h3 style={{ margin: "0 0 6px 0" }}>{d.title || d.name || "няма име"}</h3>
              <p style={{ margin: "0 0 10px 0" }}>{d.description || "няма описание"}</p>

              <Button as={Link} to={`/admin/pending/${d.id}`} variant="secondary" size="sm">
                Преглед / Редакция
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
