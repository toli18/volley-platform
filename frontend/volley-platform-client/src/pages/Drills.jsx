// src/pages/Drills.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState } from "../components/ui";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  if (typeof detail === "object") return JSON.stringify(detail);
  return "Възникна грешка при заявката.";
};

async function getWithFallback(primaryPath, aliasPath) {
  try {
    const res = await axiosInstance.get(primaryPath);
    return res.data;
  } catch (e) {
    // ако primary path не съществува, пробваме alias
    const status = e?.response?.status;
    if (aliasPath && (status === 404 || status === 405)) {
      const res2 = await axiosInstance.get(aliasPath);
      return res2.data;
    }
    throw e;
  }
}

export default function Drills() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getWithFallback(
        API_PATHS.DRILLS_LIST,
        API_PATHS.DRILLS_LIST_ALIAS
      );

      setDrills(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="uiPage">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Упражнения</h1>
        <Button variant="secondary" onClick={load}>
          ⟳ Презареди
        </Button>
      </div>

      {error && (
        <div className="uiAlert uiAlert--danger">
          Грешка: {error}
        </div>
      )}

      {loading && <p>Зареждане…</p>}

      {!loading && !error && drills.length === 0 && (
        <EmptyState title="Няма упражнения" description="Добави ново упражнение или презареди по-късно." />
      )}

      {!loading && !error && drills.length > 0 && (
        <Card padded={false}>
          <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th>ID</th>
              <th>Заглавие</th>
              <th>Описание</th>
              <th>Медия</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {drills.map((drill) => {
              let imageUrl = null;

              if (drill.image_urls) {
                if (Array.isArray(drill.image_urls) && drill.image_urls.length > 0) {
                  imageUrl = drill.image_urls[0];
                } else if (
                  typeof drill.image_urls === "string" &&
                  drill.image_urls.trim()
                ) {
                  imageUrl = drill.image_urls.trim();
                }
              }

              const hasImage = !!(imageUrl && typeof imageUrl === "string" && imageUrl.trim());

              const hasVideo =
                drill.video_urls &&
                ((Array.isArray(drill.video_urls) && drill.video_urls.length > 0) ||
                  (typeof drill.video_urls === "string" && drill.video_urls.trim()));

              const title = drill.title || drill.name || "няма заглавие";

              const status = String(drill.status || "").toLowerCase();
              const statusLabel =
                status === "approved"
                  ? "Одобрено"
                  : status === "pending"
                  ? "Чака одобрение"
                  : status === "rejected"
                  ? "Отказано"
                  : drill.status || "няма статус";

              const statusColor =
                status === "approved"
                  ? "#28a745"
                  : status === "pending"
                  ? "#ffc107"
                  : status === "rejected"
                  ? "#dc3545"
                  : "#6c757d";

              return (
                <tr key={drill.id}>
                  <td>{drill.id}</td>

                  <td>
                    <Link
                      to={`/drills/${drill.id}`}
                      style={{ color: "#0066cc", textDecoration: "none", fontWeight: 800 }}
                    >
                      {title}
                    </Link>
                  </td>

                  <td>{drill.description || "няма описание"}</td>

                  <td>
                    {hasImage ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        style={{
                          maxWidth: 100,
                          maxHeight: 60,
                          objectFit: "cover",
                          border: "1px solid #ddd",
                          borderRadius: 4,
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : hasVideo ? (
                      <span style={{ color: "#0066cc", fontSize: 12 }}>📹 Видео</span>
                    ) : (
                      <span style={{ color: "#999", fontSize: 12 }}>—</span>
                    )}
                  </td>

                  <td>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        backgroundColor: statusColor,
                        color: "white",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </Card>
      )}
    </div>
  );
}
