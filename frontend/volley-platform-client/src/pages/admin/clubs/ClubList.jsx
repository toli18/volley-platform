import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../../utils/auth";
import { API_PATHS } from "../../../utils/apiPaths";
import { AdminHero, Button, Card, EmptyState, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";
import { resolveStaticUrl } from "../../../utils/staticUrl";

const REGION_OPTIONS = ["Витоша", "Струма", "Тракия", "Странджа", "Добруджа", "Хемус", "Неразпределен"];

export default function ClubList() {
  const [clubs, setClubs] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [editClub, setEditClub] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    city: "",
    country: "",
    address: "",
    contact_email: "",
    contact_phone: "",
    website_url: "",
    logo_url: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const [clubsData, coachesData] = await Promise.all([
          apiClient(API_PATHS.CLUBS_LIST),
          apiClient(API_PATHS.COACHES_LIST),
        ]);
        setClubs(Array.isArray(clubsData) ? clubsData : []);
        setCoaches(Array.isArray(coachesData) ? coachesData : []);
      } catch (e) {
        setError(e?.message || "Failed to fetch");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const coachesByClub = coaches.reduce((acc, c) => {
    const key = Number(c?.club_id);
    if (!Number.isFinite(key)) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clubs.filter((club) => {
      if (regionFilter) {
        const region = club.region || "Неразпределен";
        if (region !== regionFilter) return false;
      }
      if (!q) return true;
      const haystack = [
        club.id,
        club.name,
        club.city,
        club.region,
        club.country,
        club.address,
        club.contact_email,
        club.contact_phone,
        club.website_url,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [clubs, query, regionFilter]);

  const reload = async () => {
    const [clubsData, coachesData] = await Promise.all([
      apiClient(API_PATHS.CLUBS_LIST),
      apiClient(API_PATHS.COACHES_LIST),
    ]);
    setClubs(Array.isArray(clubsData) ? clubsData : []);
    setCoaches(Array.isArray(coachesData) ? coachesData : []);
  };

  const onToggleAccess = async (club) => {
    try {
      const result = await apiClient(API_PATHS.CLUB_TOGGLE_ACCESS(club.id), { method: "POST" });
      await reload();
      toast.success(
        result?.is_active === false
          ? `Достъпът на клуб "${club.name}" е спрян.`
          : `Достъпът на клуб "${club.name}" е активиран.`
      );
    } catch (e) {
      toast.error(e?.message || "Грешка при смяна на достъпа");
    }
  };

  const openEditModal = (club) => {
    setEditClub(club);
    setEditForm({
      name: club?.name || "",
      city: club?.city || "",
      country: club?.country || "",
      address: club?.address || "",
      contact_email: club?.contact_email || "",
      contact_phone: club?.contact_phone || "",
      website_url: club?.website_url || "",
      logo_url: club?.logo_url || "",
    });
  };

  const onSaveEdit = async () => {
    if (!editClub) return;
    if (!editForm.name.trim()) {
      toast.error("Името на клуба е задължително.");
      return;
    }
    setEditSaving(true);
    try {
      await apiClient(API_PATHS.CLUB_UPDATE(editClub.id), {
        method: "PATCH",
        data: {
          name: editForm.name.trim(),
          city: editForm.city.trim(),
          country: editForm.country.trim(),
          address: editForm.address.trim(),
          contact_email: editForm.contact_email.trim(),
          contact_phone: editForm.contact_phone.trim(),
          website_url: editForm.website_url.trim(),
          logo_url: editForm.logo_url.trim(),
        },
      });
      setEditClub(null);
      await reload();
      toast.success(`Клуб "${editForm.name.trim()}" е обновен успешно.`);
    } catch (e) {
      toast.error(e?.message || "Грешка при редакция на клуба");
    } finally {
      setEditSaving(false);
    }
  };

  const onDelete = async (club) => {
    if (!confirm(`Сигурни ли сте, че искате да изтриете клуб "${club.name}"?`)) return;
    try {
      await apiClient(API_PATHS.CLUB_DELETE(club.id), { method: "DELETE" });
      await reload();
      toast.success(`Клуб "${club.name}" е изтрит.`);
    } catch (e) {
      toast.error(e?.message || "Грешка при изтриване на клуба");
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="🏢 Админ управление на клубове"
        subtitle="Стил B: по-контрастен sporty вид с цветове, близки до БФ Волейбол."
      />

      <Button
        as={Link}
        to="/admin/clubs/new"
        variant="secondary"
        size="sm"
      >
        ➕ Create Club
      </Button>

      <div style={{ marginTop: 10, marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <Input
            placeholder="Търси клуб по ID, име, град, регион, държава, email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Input
          as="select"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          style={{ flex: "0 0 200px" }}
        >
          <option value="">Всички региони</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Input>
      </div>

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card
              key={idx}
              className="uiCard--soft"
              style={{ minHeight: 110, opacity: 0.9 }}
            >
              <div style={{ height: 14, width: "42%", background: "#dce5f2", borderRadius: 7, marginBottom: 8 }} />
              <div style={{ height: 10, width: "70%", background: "#e6edf7", borderRadius: 7, marginBottom: 10 }} />
              <div style={{ height: 10, width: "90%", background: "#e6edf7", borderRadius: 7 }} />
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && filteredClubs.length === 0 && (
        <EmptyState
          title={clubs.length === 0 ? "Няма налични клубове" : "Няма резултати"}
          description={clubs.length === 0 ? "Създай първия клуб от бутона горе." : "Промени текста в търсачката и опитай отново."}
        />
      )}

      {!loading && !error && filteredClubs.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredClubs.map((c) => (
            <Card
              key={c.id}
              className="uiCard--soft"
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  {c.logo_url ? (
                    <img
                      src={resolveStaticUrl(c.logo_url)}
                      alt={c.name || "Клуб"}
                      style={{ width: 44, height: 44, objectFit: "contain", background: "#fff", borderRadius: 10, padding: 3, border: "1px solid #e2e8f0", flexShrink: 0 }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900, fontSize: 18 }}>{c.name || "Клуб"}</span>
                    <span
                      className={`uiBadge ${c.region ? "uiBadge--success" : ""}`}
                      title="Регион (по град или по името на клуба)"
                    >
                      {c.region || "Неразпределен"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#5f708c", marginTop: 2 }}>
                    ID: {c.id} • Треньори: <b>{coachesByClub[Number(c.id)] || 0}</b> • Статус:{" "}
                    <b style={{ color: c.is_active === false ? "#be1e2d" : "#0a6b47" }}>
                      {c.is_active === false ? "Спрян достъп" : "Активен"}
                    </b>
                  </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button onClick={() => onToggleAccess(c)} size="sm" variant="secondary">
                    {c.is_active === false ? "Активирай достъп" : "Спри достъп"}
                  </Button>
                  <Button onClick={() => openEditModal(c)} size="sm" variant="ghost">Редакция</Button>
                  <Button onClick={() => onDelete(c)} size="sm" variant="danger">Изтрий</Button>
                </div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <div><b>Регион:</b> {c.region || "—"}</div>
                <div><b>Град:</b> {c.city || "—"}</div>
                <div><b>Държава:</b> {c.country || "—"}</div>
                <div><b>Email:</b> {c.contact_email || "—"}</div>
                <div><b>Телефон:</b> {c.contact_phone || "—"}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <b>Адрес:</b> {c.address || "—"}
              </div>

              <div style={{ marginTop: 8 }}>
                <b>Сайт:</b>{" "}
                {c.website_url ? (
                  <a href={c.website_url} target="_blank" rel="noreferrer">
                    {c.website_url}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editClub && (
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
          onClick={() => !editSaving && setEditClub(null)}
        >
          <div
            style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #dce5f2" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px" }}>Редакция на клуб</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Име *</div>
                <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Град</div>
                <Input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Държава</div>
                <Input value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Телефон</div>
                <Input value={editForm.contact_phone} onChange={(e) => setEditForm((p) => ({ ...p, contact_phone: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Email</div>
                <Input type="email" value={editForm.contact_email} onChange={(e) => setEditForm((p) => ({ ...p, contact_email: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Сайт (URL)</div>
                <Input value={editForm.website_url} onChange={(e) => setEditForm((p) => ({ ...p, website_url: e.target.value }))} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Адрес</div>
                <Input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Лого URL</div>
                <Input value={editForm.logo_url} onChange={(e) => setEditForm((p) => ({ ...p, logo_url: e.target.value }))} />
                {editForm.logo_url ? (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <img
                      src={resolveStaticUrl(editForm.logo_url)}
                      alt="Преглед на логото"
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "contain",
                        background: "#fff",
                        borderRadius: 10,
                        padding: 4,
                        border: "1px solid #e2e8f0",
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#64748b" }}>Преглед</span>
                  </div>
                ) : null}
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <Button onClick={() => setEditClub(null)} disabled={editSaving} variant="secondary">Отказ</Button>
              <Button onClick={onSaveEdit} disabled={editSaving}>
                {editSaving ? "Запис..." : "Запази"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
