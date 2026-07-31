import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

const AGE_OPTIONS = [
  { age: 8, label: "Мини" },
  { age: 11, label: "Детски" },
  { age: 14, label: "Под 14" },
  { age: 16, label: "Под 16" },
  { age: 18, label: "Под 18" },
  { age: 20, label: "Под 20" },
  { age: 99, label: "Мъже / Жени" },
];

export default function CoachBvfCardIndexes() {
  const toast = useToast();
  const { permanent, tokenBody } = useClubBvfLink();
  const [token, setToken] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [age, setAge] = useState("14");
  const [sex, setSex] = useState("0");
  const [selectedBvfId, setSelectedBvfId] = useState("");
  const [athleteIds, setAthleteIds] = useState("");

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const canCallBvf = permanent || Boolean(token.trim());

  const fetchList = async () => {
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEXES_FETCH, {
        ...tokenBody(token),
      });
      setItems(res.data?.items || []);
      toast.success(`Картотеки: ${(res.data?.items || []).length}`);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане."));
    } finally {
      setBusy(false);
    }
  };

  const createIndex = async () => {
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEXES_CREATE, {
        ...tokenBody(token),
        year: Number(year),
        age: Number(age),
        sex: Number(sex),
      });
      toast.success(`Създадена картотека #${res.data?.bvf_card_index_id}`);
      await fetchList();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване."));
    } finally {
      setBusy(false);
    }
  };

  const addPlayers = async () => {
    if (!selectedBvfId) {
      toast.error("Избери картотека.");
      return;
    }
    const ids = athleteIds
      .split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) {
      toast.error("Въведи athlete id-та от платформата (с БФВ връзка).");
      return;
    }
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_ADD_PLAYERS(selectedBvfId), {
        ...tokenBody(token),
        athlete_ids: ids,
      });
      toast.success(`Добавени: ${res.data?.added || 0}`);
      if (res.data?.errors?.length) toast.error(res.data.errors.slice(0, 3).join("; "));
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Картотечни отбори"
        subtitle="Сезон × възраст × пол — sync към db.bvf.bg. Добавяй само състезатели с БФВ id."
        actions={
          <Link to="/coach/bvf-admin">
            <Button variant="secondary">Администрация БФВ</Button>
          </Link>
        }
      />

      <Card title="1. Връзка с БФВ">
        {permanent ? (
          <p style={{ margin: 0, fontSize: 14, color: "#166534" }}>
            Постоянна връзка е активна — token не е нужен.{" "}
            <Link to="/coach/bvf-admin">Администрация БФВ</Link>
          </p>
        ) : (
          <>
            <p className="uiMuted" style={{ marginTop: 0 }}>
              Оторизирай клуба в <Link to="/coach/bvf-admin">Администрация БФВ</Link> или временно постави token.
            </p>
            <textarea
              className="uiInput"
              rows={2}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="БФВ token (временно)"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%" }}
            />
          </>
        )}
        <div style={{ marginTop: 8 }}>
          <Button type="button" disabled={busy || !canCallBvf} onClick={fetchList}>
            Зареди картотеки от БФВ
          </Button>
        </div>
      </Card>

      <Card title="2. Създай картотека">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Година</span>
            <Input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} placeholder={String(currentYear)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Възраст</span>
            <select className="uiInput" value={age} onChange={(e) => setAge(e.target.value)}>
              {AGE_OPTIONS.map((o) => (
                <option key={o.age} value={o.age}>
                  {o.label} ({o.age})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Пол</span>
            <select className="uiInput" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="0">Мъжки</option>
              <option value="1">Женски</option>
            </select>
          </label>
          <Button type="button" disabled={busy || !canCallBvf} onClick={createIndex}>
            Създай в БФВ
          </Button>
        </div>
      </Card>

      <Card title="3. Списък">
        {items.length === 0 ? (
          <EmptyState
            title="Няма заредени картотеки"
            description={permanent ? "Зареди от БФВ." : "Оторизирай клуба или постави token."}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="uiTable">
              <thead>
                <tr>
                  <th>БФВ id</th>
                  <th>Година</th>
                  <th>Група</th>
                  <th>Пол</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.bvf_card_index_id}
                    style={{
                      cursor: "pointer",
                      background: String(selectedBvfId) === String(it.bvf_card_index_id) ? "#ecfdf5" : undefined,
                    }}
                    onClick={() => setSelectedBvfId(String(it.bvf_card_index_id))}
                  >
                    <td>{it.bvf_card_index_id}</td>
                    <td>{it.year}</td>
                    <td>{it.age_group || it.age}</td>
                    <td>{it.sex === 1 ? "Ж" : "М"}</td>
                    <td>{it.is_signed ? "подписана" : it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="4. Добави състезатели">
        <p className="uiMuted" style={{ marginTop: 0 }}>
          Избрана картотека: <strong>{selectedBvfId || "—"}</strong>. Въведи platform athlete id (разделени със запетая),
          всеки трябва да има bvf_player_id.
        </p>
        <Input value={athleteIds} onChange={(e) => setAthleteIds(e.target.value)} placeholder="напр. 12, 15, 18" />
        <div style={{ marginTop: 8 }}>
          <Button type="button" disabled={busy || !canCallBvf || !selectedBvfId} onClick={addPlayers}>
            Добави към картотеката
          </Button>
        </div>
      </Card>
    </div>
  );
}
