import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
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

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

function statusLabel(it) {
  if (it.is_signed || it.status === "signed") return "Изпратен към БФВ";
  if (it.status === "pending_bvf_sign") return "Готов (чака подпис в БФВ)";
  return "Чернова";
}

export default function CoachBvfCardIndexes() {
  const { user } = useAuth();
  const toast = useToast();
  const { permanent, tokenBody } = useClubBvfLink();
  const role = normalizeRole(user);
  const canSubmitUi =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [token, setToken] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [age, setAge] = useState("14");
  const [sex, setSex] = useState("0");
  const [selectedBvfId, setSelectedBvfId] = useState("");
  const [detail, setDetail] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState(() => new Set());
  const [canSubmitApi, setCanSubmitApi] = useState(canSubmitUi);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const canCallBvf = permanent || Boolean(token.trim());
  const canSubmit = canSubmitApi || canSubmitUi;

  const memberIds = useMemo(
    () => new Set((detail?.members || []).map((m) => m.athlete_id)),
    [detail],
  );

  const availableAthletes = useMemo(
    () => eligible.filter((a) => !memberIds.has(a.id)),
    [eligible, memberIds],
  );

  const loadEligible = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_ELIGIBLE);
      setEligible(res.data?.athletes || []);
      if (typeof res.data?.can_submit === "boolean") setCanSubmitApi(res.data.can_submit);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на картотекирани състезатели."));
    }
  };

  const loadDetail = async (bvfId) => {
    if (!bvfId) {
      setDetail(null);
      return;
    }
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEX_DETAIL(bvfId));
      setDetail(res.data);
      if (typeof res.data?.can_submit === "boolean") setCanSubmitApi(res.data.can_submit);
    } catch (err) {
      setDetail(null);
      toast.error(normalizeError(err, "Неуспешно зареждане на състава."));
    }
  };

  const fetchList = async () => {
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEXES_FETCH, {
        ...tokenBody(token),
      });
      setItems(res.data?.items || []);
      if (typeof res.data?.can_submit === "boolean") setCanSubmitApi(res.data.can_submit);
      toast.success(`Картотечни отбори: ${(res.data?.items || []).length}`);
      if (selectedBvfId) await loadDetail(selectedBvfId);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadEligible();
  }, []);

  const createIndex = async () => {
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ.");
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
      toast.success(`Създаден картотечен отбор #${res.data?.bvf_card_index_id}`);
      setSelectedBvfId(String(res.data?.bvf_card_index_id || ""));
      await fetchList();
      if (res.data?.bvf_card_index_id) await loadDetail(res.data.bvf_card_index_id);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване."));
    } finally {
      setBusy(false);
    }
  };

  const toggleAthlete = (id) => {
    setSelectedAthleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addPlayers = async () => {
    if (!selectedBvfId) {
      toast.error("Избери картотечен отбор.");
      return;
    }
    const ids = [...selectedAthleteIds];
    if (!ids.length) {
      toast.error("Избери поне един картотекиран състезател.");
      return;
    }
    if (detail && !detail.can_edit) {
      toast.error("Отборът е заключен след изпращане.");
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
      setSelectedAthleteIds(new Set());
      await loadDetail(selectedBvfId);
      await fetchList();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне."));
    } finally {
      setBusy(false);
    }
  };

  const submitToBvf = async () => {
    if (!selectedBvfId) return;
    if (!canSubmit) {
      toast.error("Само главният треньор / администратор изпраща към БФВ.");
      return;
    }
    if (!window.confirm("Изпращане към федерацията заключва състава. Продължаваш?")) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_SUBMIT(selectedBvfId), {
        ...tokenBody(token),
      });
      toast.success(`Изпратен към БФВ · статус ${res.data?.status}`);
      await fetchList();
      await loadDetail(selectedBvfId);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изпращане."));
      await loadDetail(selectedBvfId);
    } finally {
      setBusy(false);
    }
  };

  const selectRow = async (bvfId) => {
    setSelectedBvfId(String(bvfId));
    setSelectedAthleteIds(new Set());
    await loadDetail(bvfId);
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Картотечни отбори"
        subtitle="Треньорът създава и пълни състава. Главният треньор / админът изпраща към БФВ."
        actions={
          <Link to="/coach/bvf-admin">
            <Button variant="secondary">Администрация БФВ</Button>
          </Link>
        }
      />

      <Card title="Връзка с БФВ">
        {permanent ? (
          <p style={{ margin: 0, fontSize: 14, color: "#166534" }}>
            Постоянна връзка е активна.{" "}
            <Link to="/coach/bvf-admin">Администрация БФВ</Link>
          </p>
        ) : (
          <>
            <p className="uiMuted" style={{ marginTop: 0 }}>
              Оторизирай клуба в <Link to="/coach/bvf-admin">Администрация БФВ</Link>.
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
            Зареди картотечни отбори
          </Button>
        </div>
      </Card>

      <Card title="1. Създай картотечен отбор (треньор)">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Това е чернова в БФВ — още не е изпратена към федерацията.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Сезон</span>
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
            Създай отбор
          </Button>
        </div>
      </Card>

      <Card title="2. Списък">
        {items.length === 0 ? (
          <EmptyState title="Няма заредени отбори" description="Създай нов или зареди от БФВ." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="uiTable">
              <thead>
                <tr>
                  <th>БФВ id</th>
                  <th>Сезон</th>
                  <th>Група</th>
                  <th>Пол</th>
                  <th>Състав</th>
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
                    onClick={() => selectRow(it.bvf_card_index_id)}
                  >
                    <td>{it.bvf_card_index_id}</td>
                    <td>{it.year}</td>
                    <td>{it.age_group || it.age}</td>
                    <td>{it.sex === 1 ? "Ж" : "М"}</td>
                    <td>{it.members_count ?? "—"}</td>
                    <td>{statusLabel(it)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="3. Състав (само картотекирани)">
        {!selectedBvfId ? (
          <EmptyState title="Избери отбор" description="Кликни ред от списъка." />
        ) : (
          <>
            <p className="uiMuted" style={{ marginTop: 0 }}>
              Избран: <strong>#{selectedBvfId}</strong>
              {detail?.age_group ? ` · ${detail.age_group}` : ""} ·{" "}
              {detail?.all_ready ? "готов за изпращане" : "има липси в документите"}
            </p>

            {(detail?.members || []).length ? (
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table className="uiTable">
                  <thead>
                    <tr>
                      <th>Име</th>
                      <th>БФВ №</th>
                      <th>Готов</th>
                      <th>Липси</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((m) => (
                      <tr key={m.athlete_id}>
                        <td style={{ fontWeight: 600 }}>{m.athlete_name}</td>
                        <td>{m.bvf_player_number || m.bvf_player_id}</td>
                        <td>{m.ready ? "✓" : "○"}</td>
                        <td style={{ fontSize: 12, color: "#92400e" }}>
                          {(m.checklist || [])
                            .filter((c) => !c.ok)
                            .map((c) => c.label)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="uiMuted">Все още няма добавени състезатели.</p>
            )}

            {detail?.can_edit !== false ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Добави картотекирани</p>
                {availableAthletes.length === 0 ? (
                  <p className="uiMuted" style={{ fontSize: 13 }}>
                    Няма свободни картотекирани състезатели (с БФВ id) за теб.
                  </p>
                ) : (
                  <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                    {availableAthletes.map((a) => (
                      <label key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                        <input
                          type="checkbox"
                          checked={selectedAthleteIds.has(a.id)}
                          onChange={() => toggleAthlete(a.id)}
                        />
                        <span style={{ fontSize: 13 }}>
                          {a.athlete_name} · № {a.bvf_player_number || a.bvf_player_id}
                          {!a.has_egn || !a.has_photo ? (
                            <span style={{ color: "#92400e" }}>
                              {" "}
                              ({[!a.has_egn && "без ЕГН", !a.has_photo && "без снимка"].filter(Boolean).join(", ")})
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Button type="button" disabled={busy || !selectedAthleteIds.size} onClick={addPlayers}>
                    Добави избраните ({selectedAthleteIds.size})
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ color: "#166534", fontSize: 13 }}>Отборът е заключен след изпращане.</p>
            )}
          </>
        )}
      </Card>

      <Card title="4. Изпрати към БФВ (главен треньор / админ)">
        {!canSubmit ? (
          <p className="uiMuted" style={{ margin: 0 }}>
            Ти можеш да създаваш и пълниш отбора. Изпращането към федерацията е за главния треньор (или администратор
            на клуба — предстои).
          </p>
        ) : (
          <>
            <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
              Преди изпращане всички в състава трябва да имат снимка, ЕГН и документи. След успех съставът се заключва в
              БФВ.
            </p>
            <Button
              type="button"
              disabled={busy || !selectedBvfId || !detail?.all_ready || detail?.is_signed}
              onClick={submitToBvf}
            >
              Изпрати към федерацията
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
