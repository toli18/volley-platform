import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";
import { normalizeError } from "../../../utils/normalizeError";
import { AdminHero, Button, Card, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";
import SekCoachLinkFields, {
  emptySekLinkValue,
  sekLinkFromCoach,
  sekLinkPayload,
} from "../../../components/admin/SekCoachLinkFields";

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
  const [sekLink, setSekLink] = useState(emptySekLinkValue());
  const [newPassword, setNewPassword] = useState("");
  const toast = useToast();

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
        setSekLink(sekLinkFromCoach(coach));
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
    if (sekLink.sek_link_mode === "self" && !sekLink.bvf_coach_id) {
      setError("Избери лицензиран треньор от падащото меню.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await apiClient(API_PATHS.COACH_UPDATE(coachId), {
        method: "PATCH",
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          club_id: Number(form.club_id),
          ...sekLinkPayload(sekLink),
        },
      });
      setSekLink(sekLinkFromCoach(updated));
      toast.success("Промените са записани.");
    } catch (e) {
      const msg = normalizeError(e, "Грешка при запис.");
      setError(msg);
      toast.error(msg);
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
      toast.success("Паролата е сменена успешно.");
    } catch (e) {
      const msg = normalizeError(e, "Грешка при reset на парола.");
      setError(msg);
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className="uiPage adminTheme">Зареждане…</div>;

  return (
    <div className="uiPage adminTheme" style={{ maxWidth: "100%", minHeight: "80vh" }}>
      <AdminHero
        title={`Пълен преглед / редакция на треньор #${coachId}`}
        subtitle="Локалното име се редактира свободно; лицензът в СЕК е отделно."
        actions={
          <>
            <Button as={Link} to="/admin/coaches" variant="secondary">Към треньори</Button>
            <Button onClick={() => navigate(-1)} variant="secondary">Назад</Button>
          </>
        }
      />

      {error && (
        <div className="uiAlert uiAlert--danger">
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <Card title="Профил">
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Име в платформата</div>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Как се показва при нас"
              />
              <div style={{ fontSize: 11, color: "#5f708c", marginTop: 4 }}>
                Това е нашето име — редактира се свободно, независимо от СЕК.
              </div>
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
              <Input
                as="select"
                value={form.club_id}
                onChange={(e) => {
                  setForm((p) => ({ ...p, club_id: e.target.value }));
                  setSekLink(emptySekLinkValue());
                }}
              >
                <option value="">Избери клуб</option>
                {clubs.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.bvf_club_id ? " · СЕК" : ""}
                  </option>
                ))}
              </Input>
            </label>

            <SekCoachLinkFields
              clubId={form.club_id}
              value={sekLink}
              onChange={setSekLink}
              toast={toast}
              disabled={saving}
            />

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
