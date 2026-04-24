// src/pages/admin/AdminPending.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminActionsRow, AdminHero, AdminSection, Button, Card, EmptyState } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

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
  const toast = useToast();

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
      const msg = normalizeFastApiError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="📋 Чакащи упражнения"
        subtitle="Преглед на новите предложения преди окончателно решение."
        actions={<Button variant="primary" size="sm" onClick={fetchPending}>Презареди</Button>}
      />

      {loading && <p>Зареждане...</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && drills.length === 0 && (
        <EmptyState title="Няма чакащи упражнения" description="Когато има нови предложения, ще се покажат тук." />
      )}

      {!loading && !error && drills.length > 0 && (
        <AdminSection title={`Чакащи предложения (${drills.length})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drills.map((d) => (
            <Card key={d.id}>
              <h3 style={{ margin: "0 0 6px 0" }}>{d.title || d.name || "няма име"}</h3>
              <p style={{ margin: "0 0 10px 0" }}>{d.description || "няма описание"}</p>

              <AdminActionsRow>
                <Button as={Link} to={`/admin/pending/${d.id}`} variant="secondary" size="sm">
                  Преглед / Редакция
                </Button>
              </AdminActionsRow>
            </Card>
          ))}
        </div>
        </AdminSection>
      )}
    </div>
  );
}
