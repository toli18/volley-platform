// src/pages/admin/coaches/CreateCoach.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";

export default function CreateCoach() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState("");

  const [clubs, setClubs] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      setLoadingClubs(true);
      setError("");

      try {
        const res = await axiosInstance.get(API_PATHS.CLUBS_LIST);
        const data = res.data;
        setClubs(Array.isArray(data) ? data : []);
      } catch (e) {
        const msg =
          e?.response?.data?.detail ||
          e?.message ||
          "Грешка при зареждане на клубовете";
        setError(typeof msg === "string" ? msg : "Грешка при зареждане на клубовете");
      } finally {
        setLoadingClubs(false);
      }
    };

    run();
  }, []);

  const submit = async () => {
    if (!email.trim() || !password.trim() || !name.trim() || !clubId) {
      setError("Всички полета са задължителни");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ Swagger expects: { email, password, name, club_id }
      await axiosInstance.post(API_PATHS.COACH_CREATE, {
        email: email.trim(),
        password,
        name: name.trim(),
        club_id: Number(clubId),
      });

      navigate("/admin/coaches");
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Възникна грешка при създаване на треньор";
      setError(typeof msg === "string" ? msg : "Възникна грешка при създаване на треньор");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Create Coach</h2>

      {error && (
        <div
          style={{
            background: "#ffdddd",
            padding: 10,
            borderRadius: 6,
            marginBottom: 10,
            color: "#c33",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />

        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />

        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          disabled={loadingClubs}
          style={{ padding: 10, fontSize: 16 }}
        >
          <option value="">
            {loadingClubs ? "Loading clubs..." : "Select club"}
          </option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={submit}
          disabled={loading}
          style={{
            padding: "10px 20px",
            backgroundColor: loading ? "#6c757d" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 16,
          }}
        >
          {loading ? "Създаване..." : "Create"}
        </button>
      </div>
    </div>
  );
}
