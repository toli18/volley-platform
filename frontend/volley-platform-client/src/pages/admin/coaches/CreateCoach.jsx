// src/pages/admin/coaches/CreateCoach.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";
import { AdminHero, Button, Card, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";

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
  const toast = useToast();

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

      toast.success(`Треньор "${name.trim()}" е създаден успешно.`);
      navigate("/admin/coaches");
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Възникна грешка при създаване на треньор";
      setError(typeof msg === "string" ? msg : "Възникна грешка при създаване на треньор");
      toast.error(typeof msg === "string" ? msg : "Възникна грешка при създаване на треньор");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Създай треньор"
        subtitle="Добавяне на нов треньор към избран клуб."
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card style={{ maxWidth: 520 }}>
        <div style={{ display: "grid", gap: 10 }}>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          type="password"
          placeholder="Парола"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Input
          type="text"
          placeholder="Име"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Input
          as="select"
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          disabled={loadingClubs}
        >
          <option value="">
            {loadingClubs ? "Зареждане на клубове..." : "Избери клуб"}
          </option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Input>

        <Button onClick={submit} disabled={loading}>
          {loading ? "Създаване..." : "Създай"}
        </Button>
        </div>
      </Card>
    </div>
  );
}
