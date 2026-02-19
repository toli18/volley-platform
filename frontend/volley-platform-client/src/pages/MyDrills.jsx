// src/pages/MyDrills.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";

export default function MyDrills() {
  const navigate = useNavigate();

  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDrills() {
    try {
      setLoading(true);
      setError("");

      // Swagger: има GET /drills/my (и алиас /drills/drills/my)
      // Почваме с /drills/my, ако твоят бек е с префикс, смени тук на "/drills/drills/my"
      const res = await axiosInstance.get("/drills/my");
      const data = res.data;

      setDrills(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Грешка при зареждане на упражненията";
      setError(typeof msg === "string" ? msg : "Грешка при зареждане на упражненията");
      setDrills([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrills();
  }, []);

  const handleDelete = async (drillId) => {
    const ok = window.confirm("Сигурни ли сте, че искате да изтриете това упражнение?");
    if (!ok) return;

    try {
      // Swagger: има DELETE /drills/{drill_id}
      await axiosInstance.delete(`/drills/${drillId}`);
      // refresh
      await loadDrills();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Грешка при изтриване";
      alert("Грешка: " + (typeof msg === "string" ? msg : "Грешка при изтриване"));
    }
  };

  const getStatusLabel = (status) => {
    if (status === "pending") return "Чака одобрение";
    if (status === "approved") return "Одобрено";
    if (status === "rejected") return "Отказано";
    return status || "—";
  };

  const getStatusStyle = (status) => {
    if (status === "pending") {
      return {
        padding: "4px 8px",
        backgroundColor: "#fff3cd",
        color: "#856404",
        borderRadius: "4px",
        fontWeight: "bold",
      };
    }
    if (status === "approved") {
      return {
        padding: "4px 8px",
        backgroundColor: "#d4edda",
        color: "#155724",
        borderRadius: "4px",
        fontWeight: "bold",
      };
    }
    if (status === "rejected") {
      return {
        padding: "4px 8px",
        backgroundColor: "#f8d7da",
        color: "#721c24",
        borderRadius: "4px",
        fontWeight: "bold",
      };
    }
    return { padding: "4px 8px", backgroundColor: "#eee", borderRadius: "4px" };
  };

  const formatAgeGroup = (ageMin, ageMax) => {
    if (ageMin && ageMax) return `${ageMin}-${ageMax}`;
    if (ageMin) return `${ageMin}+`;
    if (ageMax) return `≤${ageMax}`;
    return "няма данни";
  };

  const grouped = useMemo(() => {
    const pending = [];
    const approved = [];
    const rejected = [];
    const other = [];

    for (const d of drills) {
      if (d.status === "pending") pending.push(d);
      else if (d.status === "approved") approved.push(d);
      else if (d.status === "rejected") rejected.push(d);
      else other.push(d);
    }

    return { pending, approved, rejected, other };
  }, [drills]);

  const renderDrillRow = (drill) => {
    const isPending = drill.status === "pending";
    const title = drill.title || drill.name || "(без име)"; // fallback ако някъде е name

    return (
      <tr key={drill.id}>
        <td>{title}</td>
        <td>{drill.category || "няма данни"}</td>
        <td>{formatAgeGroup(drill.age_min, drill.age_max)}</td>
        <td>
          <span style={getStatusStyle(drill.status)}>{getStatusLabel(drill.status)}</span>
        </td>
        <td>
          {isPending ? (
            <>
              <span style={{ marginRight: "10px", color: "#666" }}>Редакция: само админ</span>
              <button
                onClick={() => handleDelete(drill.id)}
                style={{
                  padding: "2px 8px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Изтрий
              </button>
            </>
          ) : (
            <Link to={`/drills/${drill.id}`} style={{ color: "#0066cc", textDecoration: "none" }}>
              Преглед
            </Link>
          )}
        </td>
      </tr>
    );
  };

  const renderTable = (title, list) => {
    if (list.length === 0) return null;

    return (
      <div style={{ marginBottom: "30px" }}>
        <h2>
          {title} ({list.length})
        </h2>
        <table
          border="1"
          cellPadding="8"
          style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th>Име</th>
              <th>Категория</th>
              <th>Възрастова група</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>{list.map(renderDrillRow)}</tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1>Моите упражнения</h1>

        {/* ✅ Restored create button */}
        <button
          onClick={() => navigate("/drills/new")}
          style={{
            padding: "8px 12px",
            background: "#0066cc",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          + Ново упражнение
        </button>
      </div>

      {loading && <p>Зареждане…</p>}

      {error && (
        <p style={{ background: "#ffdddd", padding: "10px", borderRadius: "4px" }}>
          Грешка: {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {drills.length === 0 ? (
            <p>Няма създадени упражнения.</p>
          ) : (
            <>
              {renderTable("Чакащи одобрение", grouped.pending)}
              {renderTable("Одобрени", grouped.approved)}
              {renderTable("Отказани", grouped.rejected)}
              {renderTable("Други", grouped.other)}
            </>
          )}
        </>
      )}
    </div>
  );
}
