import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";
import { Button, Card, Input } from "../../../components/ui";

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

  if (loading) return <div className="uiPage">Зареждане…</div>;

  return (
    <div className="uiPage" style={{ maxWidth: "100%", minHeight: "80vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Пълен преглед / редакция на треньор #{coachId}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Button as={Link} to="/admin/coaches" variant="secondary">Към треньори</Button>
          <Button onClick={() => navigate(-1)} variant="secondary">Назад</Button>
        </div>
      </div>

      {error && (
        <div className="uiAlert uiAlert--danger">
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card title="Профил">
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Име</div>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Email</div>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Роля</div>
              <Input value={form.role} disabled />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Клуб</div>
              <Input as="select" value={form.club_id} onChange={(e) => setForm((p) => ({ ...p, club_id: e.target.value }))}>
                <option value="">Избери клуб</option>
                {clubs.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Input>
            </label>

            <div style={{ marginTop: 4 }}>
              <Button onClick={onSave} disabled={saving}>{saving ? "Запис..." : "Запази данните"}</Button>
            </div>
          </div>
        </Card>

        <Card title="Reset password">
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Нова парола</div>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Поне 6 символа"
              />
            </label>
            <Button onClick={onResetPassword} disabled={resetting}>
              {resetting ? "Смяна..." : "Смени паролата"}
            </Button>
            <div style={{ fontSize: 12, color: "#5f708c" }}>
              Старата парола не се показва никъде. Задава се само нова.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}


