import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../utils/auth";
import { API_PATHS } from "../../../utils/apiPaths";
import { Button, Card, Input } from "../../../components/ui";

export default function CreateClub() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

      navigate("/admin/clubs");
    } catch (err) {
      setError(err.message || "Възникна грешка при създаване на клуб");
      console.error("Error creating club:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uiPage">
      <h2>Create Club</h2>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card style={{ maxWidth: 480 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Input
            placeholder="Club name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Button onClick={submit} disabled={loading}>
            {loading ? "Създаване..." : "Create"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

