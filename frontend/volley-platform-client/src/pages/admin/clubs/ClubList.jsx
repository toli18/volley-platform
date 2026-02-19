import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../../utils/auth";
import { API_PATHS } from "../../../utils/apiPaths";

export default function ClubList() {
  const [clubs, setClubs] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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
      await apiClient(API_PATHS.CLUB_TOGGLE_ACCESS(club.id), { method: "POST" });
      await reload();
    } catch (e) {
      alert(e?.message || "Грешка при смяна на достъпа");
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
      alert("Името на клуба е задължително.");
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
    } catch (e) {
      alert(e?.message || "Грешка при редакция на клуба");
    } finally {
      setEditSaving(false);
    }
  };

  const onDelete = async (club) => {
    if (!confirm(`Сигурни ли сте, че искате да изтриете клуб "${club.name}"?`)) return;
    try {
      await apiClient(API_PATHS.CLUB_DELETE(club.id), { method: "DELETE" });
      await reload();
    } catch (e) {
      alert(e?.message || "Грешка при изтриване на клуба");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🏢 Clubs</h2>

      <Link
        to="/admin/clubs/new"
        style={{ display: "inline-block", marginBottom: 20, color: "#0066cc", textDecoration: "none" }}
      >
        ➕ Create Club
      </Link>

      {error && <p style={{ color: "red" }}>Грешка: {error}</p>}
      {loading && <p>Зареждане…</p>}

      {!loading && !error && clubs.length === 0 && <p>Няма налични клубове.</p>}

      {!loading && !error && clubs.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {clubs.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid #dce5f2",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
                boxShadow: "0 2px 10px rgba(15,36,68,.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{c.name || "Клуб"}</div>
                  <div style={{ fontSize: 12, color: "#5f708c", marginTop: 2 }}>
                    ID: {c.id} • Треньори: <b>{coachesByClub[Number(c.id)] || 0}</b> • Статус:{" "}
                    <b style={{ color: c.is_active === false ? "#b00020" : "#0b7a31" }}>
                      {c.is_active === false ? "Спрян достъп" : "Активен"}
                    </b>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onToggleAccess(c)}>{c.is_active === false ? "Активирай достъп" : "Спри достъп"}</button>
                  <button onClick={() => openEditModal(c)}>Редакция</button>
                  <button onClick={() => onDelete(c)} style={{ color: "crimson" }}>Изтрий</button>
                </div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
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
            </div>
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
                <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Град</div>
                <input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Държава</div>
                <input value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Телефон</div>
                <input value={editForm.contact_phone} onChange={(e) => setEditForm((p) => ({ ...p, contact_phone: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Email</div>
                <input type="email" value={editForm.contact_email} onChange={(e) => setEditForm((p) => ({ ...p, contact_email: e.target.value }))} />
              </label>
              <label>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Сайт (URL)</div>
                <input value={editForm.website_url} onChange={(e) => setEditForm((p) => ({ ...p, website_url: e.target.value }))} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Адрес</div>
                <input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Лого URL</div>
                <input value={editForm.logo_url} onChange={(e) => setEditForm((p) => ({ ...p, logo_url: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditClub(null)} disabled={editSaving}>Отказ</button>
              <button onClick={onSaveEdit} disabled={editSaving}>
                {editSaving ? "Запис..." : "Запази"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
