import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, AdminSection, Button, Card, EmptyState } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

const STATUS_LABELS = {
  new: "Нова",
  contacted: "Контакт",
  activated: "Активиран",
  declined: "Отказ",
};

export default function AdminPilotRequests() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.PILOT_REQUESTS, { params: { limit: 100 } });
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = async (id, patch) => {
    try {
      const res = await axiosInstance.patch(API_PATHS.PILOT_REQUEST_UPDATE(id), patch);
      setItems((prev) => prev.map((x) => (x.id === id ? res.data : x)));
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const markAllSeen = async () => {
    try {
      await axiosInstance.post(API_PATHS.PILOT_REQUESTS_READ_ALL);
      setItems((prev) => prev.map((x) => ({ ...x, admin_seen: true })));
      toast.success("Всички заявки са маркирани като видяни.");
    } catch (err) {
      toast.error(normalizeError(err));
    }
  };

  const unread = items.filter((x) => !x.admin_seen).length;

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Пилотни заявки"
        subtitle="Заявки от /pilot/ — създавай клуб и треньори от тук."
        actions={
          <>
            <Button variant="secondary" onClick={load}>Обнови</Button>
            {unread > 0 ? (
              <Button variant="secondary" onClick={markAllSeen}>Маркирай всички видяни ({unread})</Button>
            ) : null}
            <Link className="uiBtn uiBtn--primary" to="/admin/clubs/new" style={{ textDecoration: "none" }}>
              + Нов клуб
            </Link>
          </>
        }
      />

      <AdminSection title={`Заявки (${items.length})`}>
        {loading ? <p className="uiMuted">Зареждане...</p> : null}
        {!loading && items.length === 0 ? (
          <EmptyState title="Няма заявки" description="Когато клуб попълни формата на /pilot/, ще се появи тук и в известията." />
        ) : null}
        {!loading && items.length > 0 ? (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((row) => (
              <Card key={row.id} style={{ border: row.admin_seen ? undefined : "1px solid #86efac" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <strong>{row.club_name}</strong>
                    {!row.admin_seen ? <span className="uiBadge uiBadge--success" style={{ marginLeft: 8 }}>Ново</span> : null}
                    <div className="uiMuted" style={{ fontSize: 14, marginTop: 4 }}>
                      {[row.city, row.region].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span className="uiBadge">{STATUS_LABELS[row.status] || row.status}</span>
                </div>
                <div style={{ fontSize: 14, marginTop: 10, display: "grid", gap: 4 }}>
                  <div><b>Контакт:</b> {row.contact_name}</div>
                  <div><b>Отбори / треньори:</b> {row.teams_count || "—"} / {row.coaches_count || "—"}</div>
                  {row.note ? <div><b>Бележка:</b> {row.note}</div> : null}
                  <div className="uiMuted">{row.created_at ? new Date(row.created_at).toLocaleString("bg-BG") : ""}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <select
                    className="uiInput"
                    value={row.status}
                    onChange={(e) => updateRow(row.id, { status: e.target.value, admin_seen: true })}
                    style={{ maxWidth: 160 }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {!row.admin_seen ? (
                    <Button variant="secondary" onClick={() => updateRow(row.id, { admin_seen: true })}>
                      Маркирай видяна
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </AdminSection>
    </div>
  );
}
