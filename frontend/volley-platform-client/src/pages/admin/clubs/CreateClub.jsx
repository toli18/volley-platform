import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../utils/auth";
import { API_PATHS } from "../../../utils/apiPaths";
import { AdminHero, Button, Card, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";

export default function CreateClub() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async () => {
    if (!name.trim()) {
      setError("Името на клуба е задължително");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient(API_PATHS.CLUBS_CREATE, {
        method: "POST",
        data: { name: name.trim(), is_active: true }
      });

      toast.success(`Клуб "${name.trim()}" е създаден успешно.`);
      navigate("/admin/clubs");
    } catch (err) {
      setError(err.message || "Възникна грешка при създаване на клуб");
      toast.error(err?.message || "Възникна грешка при създаване на клуб");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Създай клуб"
        subtitle="Добави нов клуб в системата с активен достъп."
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card style={{ maxWidth: 480 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Input
            placeholder="Име на клуб"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Button onClick={submit} disabled={loading}>
            {loading ? "Създаване..." : "Създай"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

