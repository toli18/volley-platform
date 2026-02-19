import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";

export default function CoachDetailsAdmin() {
  const { id } = useParams();
  const navigate = useNavigate();
  const coachId = useMemo(() => Number(id), [id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const [clubs, setClubs] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    club_id: "",
    role: "coach",
  });
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!Number.isFinite(coachId)) {
        setError("Невалиден ID.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [coach, clubsData] = await Promise.all([
          apiClient(API_PATHS.COACH_GET(coachId)),
          apiClient(API_PATHS.CLUBS_LIST),
        ]);
        setForm({
          name: coach?.name || "",
          email: coach?.email || "",
          club_id: coach?.club_id != null ? String(coach.club_id) : "",
          role: coach?.role || "coach",
        });
        setClubs(Array.isArray(clubsData) ? clubsData : []);
      } catch (e) {
        setError(e?.message || "Грешка при зареждане.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [coachId]);

  const onSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Име и email са задължителни.");
      return;
    }
    if (!form.club_id) {
      setError("Изберете клуб.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiClient(API_PATHS.COACH_UPDATE(coachId), {
        method: "PATCH",
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          club_id: Number(form.club_id),
        },
      });
      alert("Промените са записани.");
    } catch (e) {
      setError(e?.message || "Грешка при запис.");
    } finally {
      setSaving(false);
    }
  };

  const onResetPassword = async () => {
    if (!newPassword.trim() || newPassword.trim().length < 6) {
      setError("Новата парола трябва да е поне 6 символа.");
      return;
    }
    setResetting(true);
    setError("");
    try {
      await apiClient(API_PATHS.COACH_UPDATE(coachId), {
        method: "PATCH",
        data: { password: newPassword.trim() },
      });
      setNewPassword("");
      alert("Паролата е сменена успешно.");
    } catch (e) {
      setError(e?.message || "Грешка при reset на парола.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Зареждане…</div>;

  return (
    <div style={{ padding: 20, maxWidth: "100%", minHeight: "80vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Пълен преглед / редакция на треньор #{coachId}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/admin/coaches"><button>Към треньори</button></Link>
          <button onClick={() => navigate(-1)}>Назад</button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#ffe2e2", border: "1px solid #ffc7c7", color: "#9f1a1a", padding: 10, borderRadius: 10, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <div style={{ border: "1px solid #dce5f2", borderRadius: 12, padding: 12, background: "#fff" }}>
          <h3 style={{ margin: "0 0 10px" }}>Профил</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Име</div>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Email</div>
              <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Роля</div>
              <input value={form.role} disabled />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Клуб</div>
              <select value={form.club_id} onChange={(e) => setForm((p) => ({ ...p, club_id: e.target.value }))}>
                <option value="">Избери клуб</option>
                {clubs.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ marginTop: 4 }}>
              <button onClick={onSave} disabled={saving}>{saving ? "Запис..." : "Запази данните"}</button>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid #dce5f2", borderRadius: 12, padding: 12, background: "#fff" }}>
          <h3 style={{ margin: "0 0 10px" }}>Reset password</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Нова парола</div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Поне 6 символа"
              />
            </label>
            <button onClick={onResetPassword} disabled={resetting}>
              {resetting ? "Смяна..." : "Смени паролата"}
            </button>
            <div style={{ fontSize: 12, color: "#5f708c" }}>
              Старата парола не се показва никъде. Задава се само нова.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


