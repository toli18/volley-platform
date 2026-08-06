import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
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
  const [bvfMirrorItems, setBvfMirrorItems] = useState([]);
  const [autoOpened, setAutoOpened] = useState(false);

  const canCallBvf = permanent || Boolean(token.trim());
  const canManage = Boolean(season?.can_manage) || isHead;

  const loadSeason = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_SEASON_APPLICATIONS, {
        params: { year: Number(year) },
      });
      setSeason(res.data);
      setItems(res.data?.slots || []);
      return res.data?.slots || [];
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на сезонната заявка."));
      return [];
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

  useEffect(() => {
    loadSeason();
    loadCoaches();
  }, [loadSeason, loadCoaches]);

  // Треньор с точно 1 назначен отбор → направо в екрана за състав.
  useEffect(() => {
    if (isHead || autoOpened || !items.length) return;
    if (items.length === 1 && items[0]?.id) {
      setAutoOpened(true);
      navigate(`/coach/bvf-card-indexes/${items[0].id}`, { replace: true });
    }
  }, [autoOpened, isHead, items, navigate]);

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
      await loadSeason();
      if (res.data?.id) navigate(`/coach/bvf-card-indexes/${res.data.id}`);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно назначение."));
    } finally {
      setBusy(false);
    }
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
      await loadSeason();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване."));
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
            ? "Сезонна заявка → назначение по възраст → клик на отбор за състав и запис в СЕК."
            : "Отваряш назначения ти отбор, попълваш състава (Форма 03) и пращаш заявка към главния."
        }
        actions={
          isHead ? (
            <Link to="/coach/bvf-admin">
              <Button variant="secondary">Администрация БФВ</Button>
            </Link>
          ) : null
        }
      />

      {isHead || canManage ? (
        <Card title="Сезон">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Отворен сезон = картотекиране (назначение и състав). Форма 03/03-А се включва отделно.
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
                >
                  {season?.application?.forms_active ? "Форма 03 активна" : "Активирай Форма 03"}
                </Button>
                <Button type="button" disabled={busy || !canCallBvf} onClick={importFromSek}>
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
      ) : (
        <Card title="Сезон">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Година</span>
              <Input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} />
            </label>
            <Button type="button" variant="secondary" disabled={busy} onClick={loadSeason}>
              Презареди
            </Button>
          </div>
          <p className="uiMuted" style={{ marginBottom: 0, marginTop: 10, fontSize: 13 }}>
            {season?.application
              ? `Сезон ${season.year} · ${
                  season.application.status === "open" ? "отворен" : season.application.status
                } · Форма 03: ${season.application.forms_active ? "активна" : "неактивна"}`
              : "Няма сезонна заявка."}
          </p>
        </Card>
      )}

      {canManage ? (
        <Card title="1. Назначи треньор по възраст">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Създава локална чернова. След назначение се отваря екранът за състав.
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
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Кликни отбор, за да отвориш състава и търсачката.
        </p>
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
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/coach/bvf-card-indexes/${it.id}`)}
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
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={(e) => deleteDraft(it, e)}
                          >
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

      {isHead ? (
        <Card title="Огледало от БФВ (по желание)">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Синхронизира вече съществуващи картотечни отбори от федерацията — отделно от локалния сезонен поток.
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
