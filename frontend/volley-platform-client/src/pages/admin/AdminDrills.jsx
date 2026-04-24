// src/pages/admin/AdminDrills.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, Button, EmptyState, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Validation error (422)";
  return "Грешка при заявката";
};

export default function AdminDrills() {
  const [drills, setDrills] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const toast = useToast();

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
      toast.success("Упражнението е изтрито успешно.");
    } catch (e) {
      toast.error("Грешка: " + normalizeFastApiError(e));
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDrills = drills.filter((d) => {
    if (!normalizedQuery) return true;
    const haystack = [
      d.id,
      d.title,
      d.name,
      d.description,
      d.status,
      d.category,
      d.level,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(normalizedQuery);
  });

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="📋 Admin: Всички упражнения"
        subtitle="Пълен каталог за админ преглед, редакция и изтриване."
        actions={<Button onClick={fetchDrills} variant="secondary" size="sm">🔄 Рефреш</Button>}
      />

      <div style={{ marginBottom: 10 }}>
        <Input
          placeholder="Търси по ID, заглавие, описание, статус, категория..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <p>Зареждане...</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && filteredDrills.length === 0 && (
        <EmptyState
          title={drills.length === 0 ? "Няма упражнения" : "Няма резултати"}
          description={drills.length === 0 ? "Няма налични записи за админ преглед." : "Промени текста в търсачката и опитай отново."}
        />
      )}

      {!loading && !error && filteredDrills.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Заглавие</TableHead>
              <TableHead>Описание</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDrills.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.id}</TableCell>
                <TableCell>{d.title || d.name || "няма име"}</TableCell>
                <TableCell>{d.description || "няма описание"}</TableCell>
                <TableCell>
                  <span className="uiBadge">{d.status || "unknown"}</span>
                </TableCell>
                <TableCell>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
