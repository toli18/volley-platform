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
  const [nameTouched, setNameTouched] = useState(false);
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
      setError("Email, парола, име и клуб са задължителни");
      return;
    }
    if (sekLink.sek_link_mode === "self" && !sekLink.bvf_coach_id) {
      setError("Избери лицензиран треньор от падащото меню.");
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
        subtitle="Избери клуб и лицензиран треньор от СЕК — или добави локален без лиценз."
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Клуб *</span>
            <Input
              as="select"
              value={clubId}
              onChange={(e) => {
                setClubId(e.target.value);
                setSekLink(emptySekLinkValue());
                if (!nameTouched) setName("");
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
          </label>

          <SekCoachLinkFields
            clubId={clubId}
            value={sekLink}
            onChange={setSekLink}
            onSuggestLocalName={(suggested) => {
              if (!nameTouched) setName(suggested);
            }}
            toast={toast}
            disabled={loading}
          />

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Име в платформата *</span>
            <Input
              type="text"
              placeholder="Как ще се показва при нас"
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
            />
            <span style={{ fontSize: 11, color: "#5f708c" }}>
              При избор от СЕК се попълва автоматично — можеш да го редактираш.
            </span>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Email *</span>
            <Input
              type="email"
              placeholder="Email за вход"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Парола *</span>
            <Input
              type="password"
              placeholder="Парола"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <Button onClick={submit} disabled={loading}>
            {loading ? "Създаване..." : "Създай"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
