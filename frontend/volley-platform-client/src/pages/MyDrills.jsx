// src/pages/MyDrills.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { useToast } from "../components/ToastProvider";

export default function MyDrills() {
  const navigate = useNavigate();
  const toast = useToast();

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
      toast.success("Упражнението е изтрито.");
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Грешка при изтриване";
      toast.error("Грешка: " + (typeof msg === "string" ? msg : "Грешка при изтриване"));
    }
  };

  const getStatusLabel = (status) => {
    if (status === "pending") return "Чака одобрение";
    if (status === "approved") return "Одобрено";
    if (status === "rejected") return "Отказано";
    return status || "—";
  };

  const getStatusClass = (status) => {
    if (status === "approved") return "uiBadge uiBadge--success";
    if (status === "rejected") return "uiBadge uiBadge--danger";
    return "uiBadge";
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
      <TableRow key={drill.id}>
        <TableCell>{title}</TableCell>
        <TableCell>{drill.category || "няма данни"}</TableCell>
        <TableCell>{formatAgeGroup(drill.age_min, drill.age_max)}</TableCell>
        <TableCell>
          <span className={getStatusClass(drill.status)}>{getStatusLabel(drill.status)}</span>
        </TableCell>
        <TableCell>
          {isPending ? (
            <>
              <span style={{ marginRight: "10px", color: "#666" }}>Редакция: само админ</span>
              <Button size="sm" variant="danger" onClick={() => handleDelete(drill.id)}>
                Изтрий
              </Button>
            </>
          ) : (
            <Button as={Link} to={`/drills/${drill.id}`} variant="secondary" size="sm">
              Преглед
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const renderTable = (title, list) => {
    if (list.length === 0) return null;

    return (
      <Card key={title} title={`${title} (${list.length})`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Име</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Възрастова група</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{list.map(renderDrillRow)}</TableBody>
        </Table>
      </Card>
    );
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Моите упражнения"
        subtitle="Преглед на статуса и управление на собствените предложения."
        actions={<Button onClick={() => navigate("/drills/new")}>+ Ново упражнение</Button>}
      />

      {loading && <p>Зареждане…</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && (
        <>
          {drills.length === 0 ? (
            <EmptyState title="Няма създадени упражнения" description="Създай първото упражнение от бутона горе." />
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
