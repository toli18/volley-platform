import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

const AGE_OPTIONS = [
  { age: 12, label: "Детски" },
  { age: 13, label: "Мини" },
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
  if (it.status === "ready_for_head") return "Заявка към главния";
  if (it.status === "building") return "Пълни се";
  if (it.local_only) return "Локална чернова";
  return "Чернова";
}

export default function CoachBvfCardIndexes() {
  const { user } = useAuth();
  const toast = useToast();
  const { permanent, tokenBody } = useClubBvfLink();
  const role = normalizeRole(user);
  const isHead =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [season, setSeason] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [assignAge, setAssignAge] = useState("14");
  const [assignSex, setAssignSex] = useState("0");
  const [assignCoachId, setAssignCoachId] = useState("");
  const [assignSecondCoachId, setAssignSecondCoachId] = useState("");
  const [assignDoctorName, setAssignDoctorName] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState(() => new Set());
  const [requestNote, setRequestNote] = useState("");
  const [bvfMirrorItems, setBvfMirrorItems] = useState([]);

  const canCallBvf = permanent || Boolean(token.trim());
  const canManage = Boolean(season?.can_manage) || isHead;

  const memberIds = useMemo(
    () => new Set((detail?.members || []).map((m) => m.athlete_id)),
    [detail],
  );

  const availableAthletes = useMemo(
    () => eligible.filter((a) => !memberIds.has(a.id)),
    [eligible, memberIds],
  );

  const loadSeason = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS, {
        params: { year: Number(year) },
      });
      setSeason(res.data);
      setItems(res.data?.slots || []);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на сезонната заявка."));
    }
  }, [toast, year]);

  const loadCoaches = useCallback(async () => {
    if (!isHead) return;
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CLUB_COACHES);
      setCoaches(res.data || []);
      if (!assignCoachId && res.data?.[0]?.id) setAssignCoachId(String(res.data[0].id));
    } catch {
      setCoaches([]);
    }
  }, [assignCoachId, isHead]);

  const loadEligible = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_ELIGIBLE, {
        params: { season_year: Number(year), require_form_03: true },
      });
      setEligible(res.data?.athletes || []);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на допустими състезатели."));
    }
  }, [toast, year]);

  const loadDetail = useCallback(
    async (localId) => {
      if (!localId) {
        setDetail(null);
        return;
      }
      try {
        const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_DETAIL(localId));
        setDetail(res.data);
      } catch (err) {
        setDetail(null);
        toast.error(normalizeError(err, "Неуспешно зареждане на състава."));
      }
    },
    [toast],
  );

  useEffect(() => {
    loadSeason();
    loadEligible();
    loadCoaches();
  }, [loadSeason, loadEligible, loadCoaches]);

  const openSeason = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS, {
        year: Number(year),
        note: null,
      });
      toast.success(res.data?.message || `Сезон ${year} е отворен за картотекиране.`);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно отваряне на сезон."));
    } finally {
      setBusy(false);
    }
  };

  const activateForms = async () => {
    if (season?.application?.status !== "open") {
      toast.error("Първо отвори сезона, после активирай Форма 03.");
      return;
    }
    if (
      !window.confirm(
        `Активиране на Форма 03 / 03-А за ${year}? Родителите без подпис ще я видят в портала.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS_ACTIVATE_FORMS, {
        year: Number(year),
        note: null,
      });
      toast.success(res.data?.message || `Форма 03 е активна за ${year}.`);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно активиране на Форма 03."));
    } finally {
      setBusy(false);
    }
  };

  const closeSeason = async () => {
    if (
      !window.confirm(
        `Затваряне на сезон ${year}? Форма 03 / 03-А спира да излиза на родителите. Вече подписаните форми остават.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS_CLOSE, {
        year: Number(year),
      });
      toast.success(res.data?.message || `Сезон ${year} е затворен.`);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно затваряне на сезон."));
    } finally {
      setBusy(false);
    }
  };

  const importFromSek = async () => {
    if (!canCallBvf) {
      toast.error("Нужен е линк към СЕК (постоянни данни или token).");
      return;
    }
    if (
      !window.confirm(
        `Импорт на заявените отбори от СЕК за ${year}? Ще се създадат локални картотеки. Форма 03 / сезонът НЕ се отваря автоматично — остава ръчно.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS_IMPORT_SEK, {
        year: Number(year),
        open_if_needed: false,
        ...tokenBody(token),
      });
      toast.success(res.data?.message || "Импортът от СЕК е готов.");
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен импорт от СЕК заявка."));
    } finally {
      setBusy(false);
    }
  };

  const assignCoach = async () => {
    if (!assignCoachId) {
      toast.error("Избери треньор.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SEASON_ASSIGN_COACH, {
        year: Number(year),
        age: Number(assignAge),
        sex: Number(assignSex),
        coach_user_id: Number(assignCoachId),
        second_coach_user_id: assignSecondCoachId ? Number(assignSecondCoachId) : null,
        doctor_name: assignDoctorName.trim() || null,
      });
      toast.success(`Назначен: ${res.data?.assigned_coach_name || "треньор"} · ${res.data?.age_group}`);
      setSelectedId(String(res.data?.id || ""));
      await loadSeason();
      if (res.data?.id) await loadDetail(res.data.id);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно назначение."));
    } finally {
      setBusy(false);
    }
  };

  const selectRow = async (localId) => {
    setSelectedId(String(localId));
    setSelectedAthleteIds(new Set());
    await loadDetail(localId);
  };

  const deleteDraft = async (it, e) => {
    e?.stopPropagation?.();
    if (!it?.can_delete) {
      toast.error("Може да се изтрие само преди заявка към главния треньор.");
      return;
    }
    if (!window.confirm(`Изтриване на ${it.age_group || it.age}? Съставът също ще се премахне.`)) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_DELETE(it.id));
      toast.success("Отборът е изтрит.");
      if (String(selectedId) === String(it.id)) {
        setSelectedId("");
        setDetail(null);
      }
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване."));
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
    if (!selectedId) return;
    const ids = [...selectedAthleteIds];
    if (!ids.length) {
      toast.error("Избери състезатели с Форма 03.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_ADD(selectedId), {
        athlete_ids: ids,
      });
      toast.success(`Добавени: ${res.data?.added || 0}`);
      if (res.data?.errors?.length) toast.error(res.data.errors.slice(0, 3).join("; "));
      setSelectedAthleteIds(new Set());
      await loadDetail(selectedId);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне."));
    } finally {
      setBusy(false);
    }
  };

  const requestHead = async () => {
    if (!selectedId) return;
    if (!window.confirm("Изпращаш заявка към главния треньор за запис в СЕК?")) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_REQUEST(selectedId), {
        note: requestNote || null,
      });
      toast.success(res.data?.message || "Заявката е изпратена.");
      setRequestNote("");
      await loadDetail(selectedId);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна заявка."));
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_REOPEN(selectedId), {
        note: "Върнат за корекции",
      });
      toast.success("Отборът е върнат на треньора.");
      await loadDetail(selectedId);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно връщане."));
    } finally {
      setBusy(false);
    }
  };

  const submitToBvf = async () => {
    if (!selectedId) return;
    if (!window.confirm("Запис в СЕК / изпращане към БФВ. Продължаваш?")) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_SUBMIT(selectedId), {
        ...tokenBody(token),
      });
      toast.success(`Статус: ${res.data?.status || "ok"}`);
      await loadDetail(selectedId);
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Записът в СЕК чака write token или връзка с БФВ."));
      await loadDetail(selectedId);
    } finally {
      setBusy(false);
    }
  };

  const fetchBvfMirror = async () => {
    if (!canCallBvf) {
      toast.error("Първо оторизирай клуба в Администрация БФВ.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEXES_FETCH, {
        ...tokenBody(token),
      });
      setBvfMirrorItems(res.data?.items || []);
      toast.success(`Огледало БФВ: ${(res.data?.items || []).length}`);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане от БФВ."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uiPage">
      <PageHero
        title="Картотечни отбори"
        subtitle={
          isHead
            ? "Сезонна заявка (активира Форма 03 за родителите) → назначение по възраст → състав само с подписана форма → запис в СЕК."
            : "Попълваш назначения ти отбор от допустими състезатели (Форма 03) и пращаш заявка към главния."
        }
        actions={
          isHead ? (
            <Link to="/coach/bvf-admin">
              <Button variant="secondary">Администрация БФВ</Button>
            </Link>
          ) : null
        }
      />

      <Card title="Сезон">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Отворен сезон = картотекиране (назначение и състав). Форма 03/03-А се включва отделно, когато е
          готово с Eurotrust. Затворен сезон = спират и картотекирането, и формите.
          След заявка за участие в СЕК: „Импортни отбори от СЕК“ създава локалните картотеки.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Година</span>
            <Input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} />
          </label>
          {canManage ? (
            <>
              <Button type="button" disabled={busy} onClick={openSeason}>
                {season?.application?.status === "open" ? "Отвори отново" : "Отвори сезон"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || season?.application?.status !== "open" || season?.application?.forms_active}
                onClick={activateForms}
                title={
                  season?.application?.status !== "open"
                    ? "Първо отвори сезона"
                    : season?.application?.forms_active
                      ? "Форма 03 вече е активна"
                      : undefined
                }
              >
                {season?.application?.forms_active ? "Форма 03 активна" : "Активирай Форма 03"}
              </Button>
              <Button
                type="button"
                disabled={busy || !canCallBvf}
                onClick={importFromSek}
                title={!canCallBvf ? "Нужен е СЕК token / постоянен линк" : undefined}
              >
                Импортни отбори от СЕК
              </Button>
              {season?.application?.status === "open" ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={closeSeason}>
                  Затвори сезон
                </Button>
              ) : null}
            </>
          ) : null}
          <Button type="button" variant="secondary" disabled={busy} onClick={loadSeason}>
            Презареди
          </Button>
        </div>
        <p className="uiMuted" style={{ marginBottom: 0, marginTop: 10, fontSize: 13 }}>
          {season?.application
            ? `Заявка #${season.application.id} · ${
                season.application.status === "open"
                  ? "ОТВОРЕН"
                  : season.application.status === "closed"
                    ? "ЗАТВОРЕН"
                    : season.application.status === "draft"
                      ? "ЧЕРНОВА"
                      : season.application.status
              } · Форма 03: ${season.application.forms_active ? "активна" : "неактивна"} · ${season.year}`
            : "Все още няма сезонна заявка за тази година."}
        </p>
      </Card>

      {canManage ? (
        <Card title="1. Назначи треньор по възраст">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Създава локална чернова на картотечен отбор (треньор, втори треньор, лекар). Записът в СЕК е
            отделна стъпка след заявка от треньора.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Възраст</span>
              <select className="uiInput" value={assignAge} onChange={(e) => setAssignAge(e.target.value)}>
                {AGE_OPTIONS.map((o) => (
                  <option key={o.age} value={o.age}>
                    {o.label} ({o.age})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Пол</span>
              <select className="uiInput" value={assignSex} onChange={(e) => setAssignSex(e.target.value)}>
                <option value="0">Мъжки</option>
                <option value="1">Женски</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Треньор</span>
              <select className="uiInput" value={assignCoachId} onChange={(e) => setAssignCoachId(e.target.value)}>
                <option value="">—</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Втори треньор</span>
              <select
                className="uiInput"
                value={assignSecondCoachId}
                onChange={(e) => setAssignSecondCoachId(e.target.value)}
              >
                <option value="">— по желание —</option>
                {coaches
                  .filter((c) => String(c.id) !== String(assignCoachId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, minWidth: 180 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Лекар</span>
              <input
                className="uiInput"
                value={assignDoctorName}
                onChange={(e) => setAssignDoctorName(e.target.value)}
                placeholder="Име на лекар"
              />
            </label>
            <Button type="button" disabled={busy || !assignCoachId} onClick={assignCoach}>
              Назначи / обнови
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title={isHead ? "2. Отбори за сезона" : "Моите картотечни отбори"}>
        {items.length === 0 ? (
          <EmptyState
            title="Няма отбори"
            description={
              isHead
                ? "Отвори сезон и назначи треньор по възраст."
                : "Главният треньор още не ти е назначил възрастова група."
            }
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="uiTable">
              <thead>
                <tr>
                  <th>Група</th>
                  <th>Пол</th>
                  <th>Треньор</th>
                  <th>Втори</th>
                  <th>Лекар</th>
                  <th>Състав</th>
                  <th>Статус</th>
                  {isHead ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    style={{
                      cursor: "pointer",
                      background: String(selectedId) === String(it.id) ? "#ecfdf5" : undefined,
                    }}
                    onClick={() => selectRow(it.id)}
                  >
                    <td>
                      {it.age_group || it.age}
                      {it.local_only ? " · локално" : it.bvf_card_index_id ? ` · БФВ #${it.bvf_card_index_id}` : ""}
                    </td>
                    <td>{it.sex === 1 ? "Ж" : "М"}</td>
                    <td>{it.assigned_coach_name || "—"}</td>
                    <td>{it.second_coach_name || "—"}</td>
                    <td>{it.doctor_name || "—"}</td>
                    <td>{it.members_count ?? 0}</td>
                    <td>{statusLabel(it)}</td>
                    {isHead ? (
                      <td onClick={(e) => e.stopPropagation()}>
                        {it.can_delete ? (
                          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={(e) => deleteDraft(it, e)}>
                            Изтрий
                          </Button>
                        ) : (
                          <span className="uiMuted" style={{ fontSize: 12 }}>
                            —
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="3. Състав (само с Форма 03 / 03-А)">
        {!selectedId ? (
          <EmptyState title="Избери отбор" description="Кликни ред от списъка." />
        ) : (
          <>
            <p className="uiMuted" style={{ marginTop: 0 }}>
              Избран: <strong>#{selectedId}</strong>
              {detail?.age_group ? ` · ${detail.age_group}` : ""} · {statusLabel(detail || {})}
              {detail?.all_ready ? " · готов" : " · има липси"}
            </p>

            {(detail?.members || []).length ? (
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table className="uiTable">
                  <thead>
                    <tr>
                      <th>Име</th>
                      <th>БФВ №</th>
                      <th>Форма 03</th>
                      <th>Готов</th>
                      <th>Липси</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((m) => (
                      <tr key={m.athlete_id}>
                        <td style={{ fontWeight: 600 }}>{m.athlete_name}</td>
                        <td>{m.bvf_player_number || m.bvf_player_id}</td>
                        <td>{m.has_form_03 ? "✓" : "○"}</td>
                        <td>{m.ready ? "✓" : "○"}</td>
                        <td style={{ fontSize: 12, color: "#92400e" }}>
                          {(m.checklist || [])
                            .filter((c) => !c.ok && c.key !== "any_doc")
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

            {detail?.can_edit ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Добави допустими (подписана Форма 03 за {year})
                </p>
                {availableAthletes.length === 0 ? (
                  <p className="uiMuted" style={{ fontSize: 13 }}>
                    Няма свободни състезатели с подписана Форма 03. Родителят я попълва в портала след отваряне на сезона.
                  </p>
                ) : (
                  <div
                    style={{
                      maxHeight: 220,
                      overflow: "auto",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    {availableAthletes.map((a) => (
                      <label key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                        <input
                          type="checkbox"
                          checked={selectedAthleteIds.has(a.id)}
                          onChange={() => toggleAthlete(a.id)}
                        />
                        <span style={{ fontSize: 13 }}>
                          {a.athlete_name} · № {a.bvf_player_number || a.bvf_player_id}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button type="button" disabled={busy || !selectedAthleteIds.size} onClick={addPlayers}>
                    Добави избраните ({selectedAthleteIds.size})
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ color: "#166534", fontSize: 13 }}>Съставът е заключен за редакция.</p>
            )}

            {!isHead && detail?.can_request_head ? (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginTop: 0 }}>4. Заявка към главния треньор</p>
                <Input
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Бележка (по желание)"
                  style={{ marginBottom: 8 }}
                />
                <Button type="button" disabled={busy} onClick={requestHead}>
                  Изпрати заявка за картотекиране
                </Button>
              </div>
            ) : null}

            {isHead && detail && !detail?.is_signed && detail?.status !== "signed" && detail?.status !== "pending_bvf_sign" ? (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginTop: 0 }}>4. Запис в СЕК (главен треньор)</p>
                <p className="uiMuted" style={{ fontSize: 13 }}>
                  {detail?.status === "ready_for_head"
                    ? "Има заявка от треньора. Без write ApiKey записът остава готов при нас."
                    : "Можеш да запишеш директно, ако съставът е готов (или да изчакаш заявка)."}
                </p>
                {!permanent ? (
                  <textarea
                    className="uiInput"
                    rows={2}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="БФВ token (временно)"
                    style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", marginBottom: 8 }}
                  />
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button type="button" disabled={busy || !detail?.all_ready} onClick={submitToBvf}>
                    Запиши в СЕК / изпрати към БФВ
                  </Button>
                  {detail?.status === "ready_for_head" ? (
                    <Button type="button" variant="secondary" disabled={busy} onClick={reopen}>
                      Върни на треньора
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {isHead ? (
        <Card title="Огледало от БФВ (по желание)">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Синхронизира вече съществуващи картотечни отбори от федерацията — отделно от локалния сезонни поток.
          </p>
          <Button type="button" variant="secondary" disabled={busy || !canCallBvf} onClick={fetchBvfMirror}>
            Зареди от БФВ
          </Button>
          {bvfMirrorItems.length > 0 ? (
            <p className="uiMuted" style={{ marginBottom: 0, marginTop: 8, fontSize: 13 }}>
              {bvfMirrorItems.length} записа · ползвай локалните отбори по-горе за новия поток.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
