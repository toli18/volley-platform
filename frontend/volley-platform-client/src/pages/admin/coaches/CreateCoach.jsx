// src/pages/admin/coaches/CreateCoach.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../../utils/apiClient";
import { API_PATHS } from "../../../utils/apiPaths";
import { AdminHero, Button, Card, Input } from "../../../components/ui";
import { useToast } from "../../../components/ToastProvider";
import SekCoachLinkFields, {
  emptySekLinkValue,
  sekLinkPayload,
} from "../../../components/admin/SekCoachLinkFields";

export default function CreateCoach() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState("");
  const [sekLink, setSekLink] = useState(emptySekLinkValue());

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
    if (sekLink.sek_link_mode === "self" && !sekLink.bvf_coach_id) {
      setError("Избери треньор от СЕК или смени режима на разпознаване.");
      return;
    }
    if (sekLink.sek_link_mode === "proxy" && !sekLink.bvf_first_coach_proxy_id) {
      setError("Избери прокси треньор от СЕК.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await axiosInstance.post(API_PATHS.COACH_CREATE, {
        email: email.trim(),
        password,
        name: name.trim(),
        club_id: Number(clubId),
        ...sekLinkPayload(sekLink),
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
        subtitle="Добавяне на нов треньор към избран клуб + опционално разпознаване в СЕК."
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card style={{ maxWidth: 560 }}>
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
            onChange={(e) => {
              setClubId(e.target.value);
              setSekLink(emptySekLinkValue());
            }}
            disabled={loadingClubs}
          >
            <option value="">
              {loadingClubs ? "Зареждане на клубове..." : "Избери клуб"}
            </option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.bvf_club_id ? " · СЕК" : ""}
              </option>
            ))}
          </Input>

          <SekCoachLinkFields
            clubId={clubId}
            value={sekLink}
            onChange={setSekLink}
            toast={toast}
            disabled={loading}
          />

          <Button onClick={submit} disabled={loading}>
            {loading ? "Създаване..." : "Създай"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
