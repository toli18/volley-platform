// src/pages/Drills.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

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
      <PageHero
        title="Упражнения"
        subtitle="Каталог с одобрени упражнения за преглед и практическа употреба."
        actions={<Button variant="secondary" onClick={load}>⟳ Презареди</Button>}
      />

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
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Заглавие</TableHead>
              <TableHead>Описание</TableHead>
              <TableHead>Медия</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                <TableRow key={drill.id}>
                  <TableCell>{drill.id}</TableCell>

                  <TableCell>
                    <Button as={Link} to={`/drills/${drill.id}`} variant="ghost" size="sm">
                      {title}
                    </Button>
                  </TableCell>

                  <TableCell>{drill.description || "няма описание"}</TableCell>

                  <TableCell>
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
                  </TableCell>

                  <TableCell>
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </Card>
      )}
    </div>
  );
}
