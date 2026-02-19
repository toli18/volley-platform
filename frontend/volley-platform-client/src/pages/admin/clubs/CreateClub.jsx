import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../utils/auth";
import { API_PATHS } from "../../../utils/apiPaths";

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
    <div style={{ padding: 20 }}>
      <h2>Create Club</h2>

      {error && (
        <div style={{ background: "#ffdddd", padding: 10, borderRadius: 4, marginBottom: 10, color: "#c33" }}>
          {error}
        </div>
      )}

      <input
        placeholder="Club name"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ padding: 10, width: 300, fontSize: 16, marginBottom: 10 }}
      />

      <br />

      <button 
        onClick={submit}
        disabled={loading}
        style={{
          padding: "10px 20px",
          backgroundColor: loading ? "#6c757d" : "#0066cc",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 16
        }}
      >
        {loading ? "Създаване..." : "Create"}
      </button>
    </div>
  );
}

