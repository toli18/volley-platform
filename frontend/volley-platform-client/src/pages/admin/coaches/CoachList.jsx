import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";
import { Link } from "react-router-dom";
import { AdminActionsRow, AdminHero, AdminSection, Button, Card, EmptyState, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";

export default function CoachList() {
  const [coaches, setCoaches] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [editCoach, setEditCoach] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", club_id: "" });
  const [editSaving, setEditSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const [coachesData, clubsData] = await Promise.all([
          apiClient(API_PATHS.COACHES_LIST),
          apiClient(API_PATHS.CLUBS_LIST),
        ]);
        setCoaches(Array.isArray(coachesData) ? coachesData : []);
        setClubs(Array.isArray(clubsData) ? clubsData : []);
      } catch (e) {
        setError(e?.message || "Failed to fetch coaches");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const clubMap = useMemo(() => {
    const m = new Map();
    clubs.forEach((c) => m.set(Number(c.id), c));
    return m;
  }, [clubs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (coaches || [])
      .filter((c) => {
        if (!qq) return true;
        const clubName = c?.club_id ? clubMap.get(Number(c.club_id))?.name || "" : "";
        const hay = `${c?.name || ""} ${c?.email || ""} ${clubName}`.toLowerCase();
        return hay.includes(qq);
      })
      .filter((c) => {
        if (clubFilter === "all") return true;
        return String(c?.club_id || "") === clubFilter;
      });
  }, [coaches, q, clubFilter, clubMap]);

  const reload = async () => {
    const [coachesData, clubsData] = await Promise.all([
      apiClient(API_PATHS.COACHES_LIST),
      apiClient(API_PATHS.CLUBS_LIST),
    ]);
    setCoaches(Array.isArray(coachesData) ? coachesData : []);
    setClubs(Array.isArray(clubsData) ? clubsData : []);
  };

  const onDeleteCoach = async (coach) => {
    if (!confirm(`Сигурни ли сте, че искате да изтриете треньор "${coach.name || coach.email}"?`)) return;
    try {
      await apiClient(API_PATHS.COACH_DELETE(coach.id), { method: "DELETE" });
      await reload();
      toast.success(`Треньор "${coach.name || coach.email}" е изтрит.`);
    } catch (e) {
      toast.error(e?.message || "Грешка при изтриване на треньор");
    }
  };

  const assignHeadCoach = async (coach) => {
    if (!coach?.club_id) {
      toast.error("Треньорът няма зададен клуб.");
      return;
    }
    if (!confirm(`Назначаване на "${coach.name || coach.email}" за Главен треньор на клуба?`)) return;
    try {
      await apiClient(API_PATHS.CLUB_HEAD_COACH_ASSIGN(coach.club_id), {
        method: "PUT",
        data: { user_id: coach.id },
      });
      await reload();
      toast.success("Главният треньор е обновен успешно.");
    } catch (e) {
      toast.error(e?.message || "Грешка при назначаване на главен треньор");
    }
  };

  const openEditModal = (coach) => {
    setEditCoach(coach);
    setEditForm({
      name: coach?.name || "",
      email: coach?.email || "",
      club_id: coach?.club_id != null ? String(coach.club_id) : "",
    });
  };

  const onSaveEditCoach = async () => {
    if (!editCoach) return;
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.club_id) {
      toast.error("Име, email и клуб са задължителни.");
      return;
    }
    setEditSaving(true);
    try {
      await apiClient(API_PATHS.COACH_UPDATE(editCoach.id), {
        method: "PATCH",
        data: {
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          club_id: Number(editForm.club_id),
        },
      });
      setEditCoach(null);
      await reload();
      toast.success("Данните за треньора са обновени.");
    } catch (e) {
      toast.error(e?.message || "Грешка при редакция на треньор");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero title="👤 Управление на треньори" subtitle="Преглед, филтър и бърза редакция на треньорски профили." />

      <AdminSection title="Действия и филтри" subtitle="Създай нов треньор или филтрирай текущия списък.">
      <AdminActionsRow>
        <Button
          as={Link}
          to="/admin/coaches/new"
          variant="secondary"
          size="sm"
        >
          ➕ Create Coach
        </Button>
      </AdminActionsRow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Търси по име, email, клуб…"
        />
        <Input as="select" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
          <option value="all">Всички клубове</option>
          {clubs.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </Input>
      </div>
      </AdminSection>

      {loading && <p>Зареждане…</p>}
      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Няма треньори" description="Няма треньори по тези критерии." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <AdminSection title={`Треньори (${filtered.length})`}>
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((c) => {
            const club = c?.club_id ? clubMap.get(Number(c.club_id)) : null;
            return (
              <Card key={c.id}>
                <div style={{ fontWeight: 900 }}>{c.name || "Треньор"}</div>
                <div style={{ fontSize: 13, color: "#415472" }}>{c.email}</div>
                <div style={{ marginTop: 4, fontSize: 13 }}>
                  <b>Клуб:</b> {club?.name || (c.club_id ? `ID ${c.club_id}` : "Не е зададен")}
                </div>
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  <span className={`uiBadge ${c.role === "club_head_coach" ? "uiBadge--info" : "uiBadge--secondary"}`}>
                    {c.role === "club_head_coach" ? "Главен треньор" : "Треньор"}
                  </span>
                  {c.sek_link_status === "self" ? (
                    <span className="uiBadge uiBadge--success" style={{ marginLeft: 6 }} title={c.bvf_coach_name || ""}>
                      СЕК · {c.bvf_coach_name || `#${c.bvf_coach_id}`}
                    </span>
                  ) : c.sek_link_status === "proxy" ? (
                    <span className="uiBadge uiBadge--warning" style={{ marginLeft: 6 }} title={c.bvf_first_coach_proxy_name || ""}>
                      СЕК прокси · {c.bvf_first_coach_proxy_name || `#${c.bvf_first_coach_proxy_id}`}
                    </span>
                  ) : club?.bvf_default_first_coach_id ? (
                    <span className="uiBadge uiBadge--secondary" style={{ marginLeft: 6 }} title={club.bvf_default_first_coach_name || ""}>
                      СЕК · клубен default
                    </span>
                  ) : (
                    <span className="uiBadge uiBadge--secondary" style={{ marginLeft: 6 }}>
                      Без СЕК
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#5f708c" }}>
                  {club?.city ? `${club.city}, ` : ""}{club?.country || ""}
                </div>
                <AdminActionsRow>
                  <Button as={Link} to={`/admin/coaches/${c.id}`} variant="secondary" size="sm">
                    Пълен преглед/редакция
                  </Button>
                  <Button onClick={() => assignHeadCoach(c)} variant="primary" size="sm">Направи главен</Button>
                  <Button onClick={() => openEditModal(c)} variant="ghost" size="sm">Редакция</Button>
                  <Button onClick={() => onDeleteCoach(c)} variant="danger" size="sm">Изтрий</Button>
                </AdminActionsRow>
              </Card>
            );
          })}
        </div>
        </AdminSection>
      )}

      {editCoach && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,16,28,.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !editSaving && setEditCoach(null)}
        >
          <div
            style={{ width: "min(560px, 100%)", background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #dce5f2" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px" }}>Редакция на треньор</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Име</div>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Email</div>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Клуб</div>
                <Input
                  as="select"
                  value={editForm.club_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, club_id: e.target.value }))}
                >
                  <option value="">Избери клуб</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={String(club.id)}>
                      {club.name}
                    </option>
                  ))}
                </Input>
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <Button onClick={() => setEditCoach(null)} disabled={editSaving} variant="secondary">Отказ</Button>
              <Button onClick={onSaveEditCoach} disabled={editSaving}>
                {editSaving ? "Запис..." : "Запази"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
