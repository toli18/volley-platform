import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import ClubLogo from "../../components/shared/ClubLogo";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import "./CoachClubProfile.css";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

const PROFILE_TABS = [
  { id: "club", label: "Клуб" },
  { id: "halls", label: "Зали" },
  { id: "fees", label: "Такси", headOnly: true },
  { id: "enroll", label: "Записване", headOnly: true },
  { id: "coaches", label: "Треньори" },
];

export default function CoachClubProfile() {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = normalizeRole(user);
  const isHead =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const tabs = useMemo(
    () => PROFILE_TABS.filter((t) => !t.headOnly || isHead),
    [isHead],
  );
  const requestedTab = searchParams.get("tab") || "club";
  const activeTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "club";
  const setActiveTab = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  };
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [coachDrafts, setCoachDrafts] = useState({});
  const [publicForm, setPublicForm] = useState({
    public_page_enabled: false,
    public_slug: "",
    public_tagline: "",
    public_about: "",
  });
  const [publicMeta, setPublicMeta] = useState(null);

  const [enrollmentTeamIds, setEnrollmentTeamIds] = useState([]);
  const [clubTeams, setClubTeams] = useState([]);
  const [hallDrafts, setHallDrafts] = useState({});
  const [newHall, setNewHall] = useState({ name: "", address: "", google_maps_url: "" });
  const [feesForm, setFeesForm] = useState({
    enabled: true,
    fee_amount: 15,
    fee_due_day: 10,
    age_exempt_enabled: false,
    age_exempt_min_age: 18,
  });
  const [feesDefaults, setFeesDefaults] = useState({
    fee_amount: 15,
    fee_due_day: 10,
    age_exempt_min_age: 18,
  });
  const [feesMeta, setFeesMeta] = useState({ age_exempt_from_month: null });
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      setLoadError(null);
      // Профилът е задължителен; публична страница и такси са опционални
      // (не чупим екрана ако бекендът още няма fees-settings).
      const profileRes = await axiosInstance.get(API_PATHS.BVF_ADMIN_CLUB_PROFILE);
      setProfile(profileRes.data);
      const drafts = {};
      for (const c of profileRes.data?.coaches || []) {
        drafts[c.id] = {
          phone: c.phone || "",
          phone_visible_to_parents: Boolean(c.phone_visible_to_parents),
        };
      }
      setCoachDrafts(drafts);
      const hDrafts = {};
      for (const h of profileRes.data?.halls || []) {
        hDrafts[h.id] = {
          name: h.name || "",
          address: h.address || "",
          google_maps_url: h.google_maps_url || "",
        };
      }
      setHallDrafts(hDrafts);

      if (isHead) {
        const settled = await Promise.allSettled([
          axiosInstance.get(API_PATHS.CLUB_PUBLIC_PAGE_SETTINGS),
          axiosInstance.get(API_PATHS.CLUB_FEES_SETTINGS),
        ]);
        const pubRes = settled[0].status === "fulfilled" ? settled[0].value : null;
        const feesRes = settled[1].status === "fulfilled" ? settled[1].value : null;
        if (pubRes?.data) {
          setPublicMeta(pubRes.data);
          setPublicForm({
            public_page_enabled: Boolean(pubRes.data.public_page_enabled),
            public_slug: pubRes.data.public_slug || "",
            public_tagline: pubRes.data.public_tagline || "",
            public_about: pubRes.data.public_about || "",
          });
          const teams = Array.isArray(pubRes.data.teams) ? pubRes.data.teams : [];
          setClubTeams(teams);
          setEnrollmentTeamIds(
            teams.filter((t) => t.public_enrollment_open && t.is_active).map((t) => Number(t.id)),
          );
        }
        if (feesRes?.data) {
          setFeesForm({
            enabled: feesRes.data.enabled !== false,
            fee_amount: Number(feesRes.data.fee_amount ?? 15),
            fee_due_day: Number(feesRes.data.fee_due_day ?? 10),
            age_exempt_enabled: Boolean(feesRes.data.age_exempt_enabled),
            age_exempt_min_age: Number(feesRes.data.age_exempt_min_age ?? 18),
          });
          setFeesMeta({
            age_exempt_from_month: feesRes.data.age_exempt_from_month || null,
          });
          if (feesRes.data.defaults) {
            setFeesDefaults({
              fee_amount: Number(feesRes.data.defaults.fee_amount ?? 15),
              fee_due_day: Number(feesRes.data.defaults.fee_due_day ?? 10),
              age_exempt_min_age: Number(feesRes.data.defaults.age_exempt_min_age ?? 18),
            });
          }
        }
      }
    } catch (err) {
      setLoadError(normalizeError(err, "Неуспешно зареждане на клубен профил."));
      toast.error(normalizeError(err, "Неуспешно зареждане на клубен профил."));
    } finally {
      setBusy(false);
    }
  }, [toast, isHead]);

  useEffect(() => {
    load();
  }, [load]);

  const syncFromSek = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CLUB_PROFILE_SYNC, {});
      setProfile(res.data);
      const drafts = {};
      for (const c of res.data?.coaches || []) {
        drafts[c.id] = {
          phone: c.phone || "",
          phone_visible_to_parents: Boolean(c.phone_visible_to_parents),
        };
      }
      setCoachDrafts(drafts);
      const hDrafts = {};
      for (const h of res.data?.halls || []) {
        hDrafts[h.id] = {
          name: h.name || "",
          address: h.address || "",
          google_maps_url: h.google_maps_url || "",
        };
      }
      setHallDrafts(hDrafts);
      const s = res.data?.sync || {};
      toast.success(
        `Синхронизирано от СЕК · зали: ${s.halls_remote ?? 0} · телефони: ${s.phones_updated ?? 0} · полета: ${(s.changed_fields || []).length}`,
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен sync от СЕК."));
    } finally {
      setBusy(false);
    }
  };

  const saveClub = async () => {
    if (!profile?.can_edit) return;
    try {
      setBusy(true);
      const res = await axiosInstance.patch(API_PATHS.BVF_ADMIN_CLUB_PROFILE, {
        contact_phone: profile.contact_phone || null,
        contact_email: profile.contact_email || null,
        contact_name: profile.contact_name || null,
        website_url: profile.website_url || null,
        address: profile.address || null,
        city: profile.city || null,
      });
      setProfile((prev) => ({ ...prev, ...res.data, can_edit: true, can_sync: true }));
      toast.success("Клубният профил е записан.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const saveHall = async (hallId) => {
    const draft = hallDrafts[hallId];
    if (!draft?.name?.trim()) {
      toast.error("Името на залата е задължително.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.patch(API_PATHS.BVF_ADMIN_CLUB_PROFILE_HALL(hallId), {
        name: draft.name.trim(),
        address: draft.address?.trim() || null,
        google_maps_url: draft.google_maps_url?.trim() || null,
      });
      setProfile((prev) => ({
        ...prev,
        halls: (prev?.halls || []).map((h) => (h.id === hallId ? { ...h, ...res.data } : h)),
      }));
      setHallDrafts((d) => ({
        ...d,
        [hallId]: {
          name: res.data.name || "",
          address: res.data.address || "",
          google_maps_url: res.data.google_maps_url || "",
        },
      }));
      toast.success("Залата е записана.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на зала."));
    } finally {
      setBusy(false);
    }
  };

  const addHall = async () => {
    if (!newHall.name.trim()) {
      toast.error("Името на залата е задължително.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CLUB_PROFILE_HALLS, {
        name: newHall.name.trim(),
        address: newHall.address.trim() || null,
        google_maps_url: newHall.google_maps_url.trim() || null,
      });
      setProfile((prev) => ({
        ...prev,
        halls: [...(prev?.halls || []), res.data],
      }));
      setHallDrafts((d) => ({
        ...d,
        [res.data.id]: {
          name: res.data.name || "",
          address: res.data.address || "",
          google_maps_url: res.data.google_maps_url || "",
        },
      }));
      setNewHall({ name: "", address: "", google_maps_url: "" });
      toast.success("Залата е добавена.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне на зала."));
    } finally {
      setBusy(false);
    }
  };

  const removeHall = async (hallId) => {
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.BVF_ADMIN_CLUB_PROFILE_HALL(hallId));
      setProfile((prev) => ({
        ...prev,
        halls: (prev?.halls || []).filter((h) => h.id !== hallId),
      }));
      setHallDrafts((d) => {
        const next = { ...d };
        delete next[hallId];
        return next;
      });
      toast.success("Залата е премахната.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно премахване на зала."));
    } finally {
      setBusy(false);
    }
  };

  const saveFeesSettings = async () => {
    if (!isHead) return;
    const amount = Number(feesForm.fee_amount);
    const dueDay = Number(feesForm.fee_due_day);
    const minAge = Number(feesForm.age_exempt_min_age);
    if (feesForm.enabled) {
      if (!Number.isFinite(amount) || amount < 0 || amount > 10000) {
        toast.error("Сумата трябва да е между 0 и 10000.");
        return;
      }
      if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
        toast.error("Падежът трябва да е ден от 1 до 28.");
        return;
      }
      if (feesForm.age_exempt_enabled && (!Number.isFinite(minAge) || minAge < 1 || minAge > 80)) {
        toast.error("Възрастта за освобождаване трябва да е между 1 и 80.");
        return;
      }
    }
    try {
      setBusy(true);
      const body = {
        enabled: Boolean(feesForm.enabled),
        age_exempt_enabled: Boolean(feesForm.enabled && feesForm.age_exempt_enabled),
        age_exempt_min_age: Math.round(
          Number.isFinite(minAge) ? minAge : feesDefaults.age_exempt_min_age || 18,
        ),
      };
      if (feesForm.enabled) {
        body.fee_amount = Math.round(amount);
        body.fee_due_day = Math.round(dueDay);
      }
      const res = await axiosInstance.put(API_PATHS.CLUB_FEES_SETTINGS, body);
      setFeesForm({
        enabled: res.data.enabled !== false,
        fee_amount: Number(res.data.fee_amount ?? feesDefaults.fee_amount),
        fee_due_day: Number(res.data.fee_due_day ?? feesDefaults.fee_due_day),
        age_exempt_enabled: Boolean(res.data.age_exempt_enabled),
        age_exempt_min_age: Number(res.data.age_exempt_min_age ?? feesDefaults.age_exempt_min_age),
      });
      setFeesMeta({
        age_exempt_from_month: res.data.age_exempt_from_month || null,
      });
      await refreshMe?.();
      toast.success(
        res.data.enabled
          ? `Месечните такси са включени · ${res.data.fee_amount} € до ${res.data.fee_due_day}-о число.`
          : "Месечните такси са изключени — скрити за родители и треньори.",
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на настройките за такси."));
    } finally {
      setBusy(false);
    }
  };

  const saveCoachPhone = async (coachId) => {
    const draft = coachDrafts[coachId];
    if (!draft) return;
    try {
      setBusy(true);
      const res = await axiosInstance.patch(API_PATHS.BVF_ADMIN_CLUB_PROFILE_COACH(coachId), {
        phone: draft.phone || null,
        phone_visible_to_parents: draft.phone_visible_to_parents,
      });
      setProfile((prev) => ({
        ...prev,
        coaches: (prev?.coaches || []).map((c) =>
          c.id === coachId
            ? {
                ...c,
                phone: res.data.phone,
                phone_visible_to_parents: res.data.phone_visible_to_parents,
              }
            : c
        ),
      }));
      toast.success("Телефонът е записан.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на телефон."));
    } finally {
      setBusy(false);
    }
  };

  const savePublicPage = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.CLUB_PUBLIC_PAGE_SETTINGS, {
        ...publicForm,
        enrollment_team_ids: enrollmentTeamIds,
      });
      setPublicMeta(res.data);
      setPublicForm({
        public_page_enabled: Boolean(res.data.public_page_enabled),
        public_slug: res.data.public_slug || "",
        public_tagline: res.data.public_tagline || "",
        public_about: res.data.public_about || "",
      });
      const teams = Array.isArray(res.data.teams) ? res.data.teams : [];
      setClubTeams(teams);
      setEnrollmentTeamIds(
        teams.filter((t) => t.public_enrollment_open && t.is_active).map((t) => Number(t.id)),
      );
      toast.success("Публичната страница е обновена.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на публичната страница."));
    } finally {
      setBusy(false);
    }
  };

  const publicPath = publicMeta?.public_url_path;
  const publicUrl =
    typeof window !== "undefined" && publicPath ? `${window.location.origin}${publicPath}` : null;
  const shareUrl = publicUrl ? `${publicUrl}#zapisvane` : null;

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Линкът е копиран — публикувай го във Facebook.");
    } catch {
      toast.error("Неуспешно копиране. Маркирай линка ръчно.");
    }
  };

  const publicPageCard = isHead ? (
    <Card title="Бланка за записване (линк за Facebook)">
      <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
        Това е страницата, която клубът публикува ръчно във Facebook (пост или бутон в био). Родителят
        отваря линка и попълва заявка за пробна тренировка — без отделен сайт и без връзка с Facebook
        новини.
      </p>
      <ol style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
        <li>Включи страницата, отметни групите за набиране и запази.</li>
        <li>Копирай линка по-долу и го публикувай във Facebook страницата на клуба.</li>
        <li>Родителят избира група и дата за пробна; заявките идват в „Записвания“.</li>
      </ol>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={publicForm.public_page_enabled}
            disabled={busy}
            onChange={(e) =>
              setPublicForm((p) => ({ ...p, public_page_enabled: e.target.checked }))
            }
          />
          1) Активна публична страница
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Slug в линка (/c/…)</span>
          <Input
            placeholder="напр. troyan-volley"
            value={publicForm.public_slug}
            disabled={busy}
            onChange={(e) => setPublicForm((p) => ({ ...p, public_slug: e.target.value }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Мото</span>
          <Input
            placeholder="Кратко мото"
            value={publicForm.public_tagline}
            disabled={busy}
            onChange={(e) => setPublicForm((p) => ({ ...p, public_tagline: e.target.value }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Описание</span>
          <textarea
            rows={4}
            value={publicForm.public_about}
            disabled={busy}
            onChange={(e) => setPublicForm((p) => ({ ...p, public_about: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", fontFamily: "inherit" }}
            placeholder="За клуба (публичен текст)"
          />
        </label>
        <div
          style={{
            display: "grid",
            gap: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #99f6e4",
            background: "#f0fdfa",
          }}
        >
          <strong style={{ fontSize: 14 }}>2) Кои групи приемат нови деца?</strong>
          <p className="uiMuted" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
            Отметни групата и натисни „Запази“. На сайта родителите виждат името + годините от колона
            „Група“ (напр. 2017, 2018…), без сезона.
          </p>
          {clubTeams.length === 0 ? (
            <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
              Няма тренировъчни групи. Създай ги в „Тренировъчни групи“.
            </p>
          ) : (
            clubTeams.map((t) => (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 14,
                  opacity: t.is_active ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy || !t.is_active}
                  checked={enrollmentTeamIds.includes(Number(t.id))}
                  onChange={(e) => {
                    const id = Number(t.id);
                    setEnrollmentTeamIds((prev) =>
                      e.target.checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id),
                    );
                  }}
                />
                <span>
                  <strong>{t.name}</strong>
                  {enrollmentTeamIds.includes(Number(t.id)) ? (
                    <span style={{ color: "#0f766e", fontWeight: 700 }}> · отворена за набиране</span>
                  ) : (
                    <span className="uiMuted"> · затворена</span>
                  )}
                  {!t.is_active ? <span className="uiMuted"> · неактивна</span> : null}
                </span>
              </label>
            ))
          )}
        </div>
        <div>
          <Button type="button" disabled={busy} onClick={savePublicPage}>
            Запази набирането и публичната страница
          </Button>
        </div>
        {shareUrl ? (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #93c5fd",
              background: "#eff6ff",
            }}
          >
            <strong style={{ fontSize: 14 }}>Линк за публикуване във Facebook</strong>
            <a href={shareUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>
              {shareUrl}
            </a>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="button" size="sm" onClick={copyShareLink} disabled={busy}>
                Копирай линка
              </Button>
              <a href={shareUrl} target="_blank" rel="noreferrer">
                <Button type="button" size="sm" variant="secondary">
                  Преглед
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Включи страницата, отметни групи и запази — после ще се появи линкът за Facebook.
          </p>
        )}
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
          Заявките идват в{" "}
          <Link to="/coach/enrollments">Записвания</Link>. Можеш да отваряш/затваряш набиране и от{" "}
          <Link to="/coach/teams">Тренировъчни групи</Link>.
        </p>
      </div>
    </Card>
  ) : null;

  if (!profile) {
    return (
      <div className="uiPage">
        {loadError ? (
          <EmptyState
            title="Неуспешно зареждане"
            description={loadError}
            action={
              <Button type="button" disabled={busy} onClick={load}>
                Опитай отново
              </Button>
            }
          />
        ) : (
          <EmptyState title="Зареждане…" description="Профил на клуба" />
        )}
      </div>
    );
  }

  if (!profile.unlocked) {
    return (
      <div className="uiPage clubProfilePage">
        <PageHero
          title="Профил на клуба"
          subtitle="Заключен до връзка със СЕК системата."
          actions={
            isHead ? (
              <Link to="/coach/bvf-admin">
                <Button>Администрация БФВ</Button>
              </Link>
            ) : null
          }
        />
        <nav className="coachMobileSubNav clubProfilePage__tabs" aria-label="Секции на клубния профил">
          {tabs
            .filter((t) => t.id === "club" || t.id === "enroll" || t.id === "fees")
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className={`coachMobileSubNavBtn${activeTab === t.id ? " is-active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </nav>
        {activeTab === "enroll" && isHead ? (
          publicPageCard
        ) : activeTab === "fees" && isHead ? (
          <Card title="Месечни такси">
            <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
              Ако клубът не събира месечна такса, изключи настройката — родителят няма да вижда
              „неплатено“, а треньорите няма да имат меню „Такси“.
            </p>
            <div style={{ display: "grid", gap: 14, maxWidth: 420 }}>
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Събираме месечна такса
                </legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className={`coachMobileSubNavBtn${feesForm.enabled ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => setFeesForm((f) => ({ ...f, enabled: true }))}
                  >
                    Да
                  </button>
                  <button
                    type="button"
                    className={`coachMobileSubNavBtn${!feesForm.enabled ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => setFeesForm((f) => ({ ...f, enabled: false }))}
                  >
                    Не
                  </button>
                </div>
              </fieldset>
              {feesForm.enabled ? (
                <>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Сума (€)</span>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      value={feesForm.fee_amount}
                      disabled={busy}
                      onChange={(e) => setFeesForm((f) => ({ ...f, fee_amount: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Падеж (ден от месеца)</span>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      step={1}
                      value={feesForm.fee_due_day}
                      disabled={busy}
                      onChange={(e) => setFeesForm((f) => ({ ...f, fee_due_day: e.target.value }))}
                    />
                  </label>
                  <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                      Освободени над възраст
                    </legend>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        className={`coachMobileSubNavBtn${feesForm.age_exempt_enabled ? " is-active" : ""}`}
                        disabled={busy}
                        onClick={() => setFeesForm((f) => ({ ...f, age_exempt_enabled: true }))}
                      >
                        Да
                      </button>
                      <button
                        type="button"
                        className={`coachMobileSubNavBtn${!feesForm.age_exempt_enabled ? " is-active" : ""}`}
                        disabled={busy}
                        onClick={() => setFeesForm((f) => ({ ...f, age_exempt_enabled: false }))}
                      >
                        Не
                      </button>
                    </div>
                  </fieldset>
                  {feesForm.age_exempt_enabled ? (
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>От възраст (години)</span>
                      <Input
                        type="number"
                        min={1}
                        max={80}
                        step={1}
                        value={feesForm.age_exempt_min_age}
                        disabled={busy}
                        onChange={(e) =>
                          setFeesForm((f) => ({ ...f, age_exempt_min_age: e.target.value }))
                        }
                      />
                      <span className="uiMuted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        Възраст към 1 януари. По подразбиране {feesDefaults.age_exempt_min_age}. Смяната
                        важи от следващия месец
                        {feesMeta.age_exempt_from_month
                          ? ` (от ${feesMeta.age_exempt_from_month})`
                          : ""}
                        .
                      </span>
                    </label>
                  ) : null}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                  Клубът работи без месечна такса. Модулът за такси е скрит за родители и треньори.
                </p>
              )}
              <div>
                <Button type="button" disabled={busy} onClick={saveFeesSettings}>
                  Запази настройката
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Заключен">
            <p style={{ marginTop: 0, lineHeight: 1.45 }}>
              След като главният треньор свърже клуба със СЕК (ApiKey), профилът се отключва и данните се
              изтеглят автоматично — име, адрес, контакти и телефони на треньорите.
            </p>
            {isHead ? (
              <Link to="/coach/bvf-admin?tab=link">
                <Button type="button">Свържи клуба със СЕК</Button>
              </Link>
            ) : (
              <p className="uiMuted" style={{ marginBottom: 0 }}>
                Поискай от главния треньор да направи връзката в Администрация БФВ.
              </p>
            )}
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="uiPage clubProfilePage">
      <PageHero
        title={profile.name || "Профил на клуба"}
        subtitle={
          !profile.can_edit
            ? "Преглед · без право на редакция"
            : profile.bvf_club_id
              ? `Свързан със СЕК · БФВ №${profile.bvf_club_id}${profile.bvf_club_name ? ` · ${profile.bvf_club_name}` : ""}`
              : "Клубен профил"
        }
        actions={
          profile.can_sync ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={syncFromSek}>
              Изтегли от СЕК
            </Button>
          ) : null
        }
      />

      <nav className="coachMobileSubNav clubProfilePage__tabs" aria-label="Секции на клубния профил">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`coachMobileSubNavBtn${activeTab === t.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === "club" ? (
      <Card title="Клуб">
        <div className="clubProfilePage__clubGrid">
          {profile.logo_url ? (
            <ClubLogo logoUrl={profile.logo_url} name={profile.name} className="appHeaderClubLogo" />
          ) : null}
          <div className="clubProfilePage__fields">
            {profile.full_name ? (
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>Официално име:</strong> {profile.full_name}
              </p>
            ) : null}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Град</span>
              <Input
                value={profile.city || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Адрес</span>
              <Input
                value={profile.address || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Председател (име)</span>
              <Input
                placeholder="Име на председателя"
                value={profile.contact_name || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, contact_name: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Телефон на клуба</span>
              <Input
                value={profile.contact_phone || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, contact_phone: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Email</span>
              <Input
                value={profile.contact_email || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, contact_email: e.target.value }))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Уебсайт</span>
              <Input
                value={profile.website_url || ""}
                disabled={!profile.can_edit || busy}
                onChange={(e) => setProfile((p) => ({ ...p, website_url: e.target.value }))}
              />
            </label>
            <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
              {[
                profile.bulstat ? `ЕИК ${profile.bulstat}` : null,
                profile.license_number ? `Лиценз ${profile.license_number}` : null,
                profile.bvf_region ? `Регион ${profile.bvf_region}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "ЕИК / лиценз се попълват от СЕК при sync."}
            </p>
            {profile.can_edit ? (
              <div>
                <Button type="button" disabled={busy} onClick={saveClub}>
                  Запази клубните данни
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
      ) : null}

      {activeTab === "halls" ? (
      <Card title="Зали">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
          Ако има зали в СЕК — идват при sync. Ако няма, главният треньор ги попълва тук. Показват се на
          публичния линк за записване (адресът се закача към пробния слот при съвпадение на името с
          графика).
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {(profile.halls || []).map((h) => {
            const draft = hallDrafts[h.id] || {
              name: h.name || "",
              address: h.address || "",
              google_maps_url: h.google_maps_url || "",
            };
            return (
              <div
                key={h.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                {profile.can_edit ? (
                  <>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        Име{h.bvf_hall_id ? " (СЕК)" : ""}
                      </span>
                      <Input
                        value={draft.name}
                        disabled={busy}
                        onChange={(e) =>
                          setHallDrafts((d) => ({
                            ...d,
                            [h.id]: { ...draft, name: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Адрес</span>
                      <Input
                        value={draft.address}
                        disabled={busy}
                        placeholder="ул. …"
                        onChange={(e) =>
                          setHallDrafts((d) => ({
                            ...d,
                            [h.id]: { ...draft, address: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Google Maps (по желание)</span>
                      <Input
                        value={draft.google_maps_url}
                        disabled={busy}
                        placeholder="https://maps.google.com/…"
                        onChange={(e) =>
                          setHallDrafts((d) => ({
                            ...d,
                            [h.id]: { ...draft, google_maps_url: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Button type="button" size="sm" disabled={busy} onClick={() => saveHall(h.id)}>
                        Запази
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => removeHall(h.id)}
                      >
                        Премахни
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong style={{ fontSize: 14 }}>{h.name}</strong>
                    <span className="uiMuted" style={{ fontSize: 13 }}>
                      {h.address || "—"}
                    </span>
                  </>
                )}
              </div>
            );
          })}

          {profile.can_edit ? (
            <div
              style={{
                border: "1px dashed #94a3b8",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gap: 8,
                background: "#f8fafc",
              }}
            >
              <strong style={{ fontSize: 14 }}>Добави зала</strong>
              <Input
                placeholder="Име на залата"
                value={newHall.name}
                disabled={busy}
                onChange={(e) => setNewHall((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                placeholder="Адрес"
                value={newHall.address}
                disabled={busy}
                onChange={(e) => setNewHall((p) => ({ ...p, address: e.target.value }))}
              />
              <Input
                placeholder="Google Maps (по желание)"
                value={newHall.google_maps_url}
                disabled={busy}
                onChange={(e) => setNewHall((p) => ({ ...p, google_maps_url: e.target.value }))}
              />
              <div>
                <Button type="button" size="sm" disabled={busy} onClick={addHall}>
                  Добави
                </Button>
              </div>
            </div>
          ) : null}

          {!profile.can_edit && (profile.halls || []).length === 0 ? (
            <EmptyState title="Няма зали" description="Главният треньор може да ги попълни в профила." />
          ) : null}
        </div>
      </Card>
      ) : null}

      {activeTab === "fees" && isHead ? (
        <Card title="Месечни такси">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>
            Ако клубът не събира месечна такса, изключи настройката — родителят няма да вижда
            „неплатено“, а треньорите няма да имат меню „Такси“.
          </p>
          <div style={{ display: "grid", gap: 14, maxWidth: 420 }}>
            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                Събираме месечна такса
              </legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className={`coachMobileSubNavBtn${feesForm.enabled ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() => setFeesForm((f) => ({ ...f, enabled: true }))}
                >
                  Да
                </button>
                <button
                  type="button"
                  className={`coachMobileSubNavBtn${!feesForm.enabled ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() => setFeesForm((f) => ({ ...f, enabled: false }))}
                >
                  Не
                </button>
              </div>
            </fieldset>

            {feesForm.enabled ? (
              <>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Сума (€)</span>
                  <Input
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    value={feesForm.fee_amount}
                    disabled={busy}
                    onChange={(e) =>
                      setFeesForm((f) => ({ ...f, fee_amount: e.target.value }))
                    }
                  />
                  <span className="uiMuted" style={{ fontSize: 12 }}>
                    По подразбиране {feesDefaults.fee_amount} €
                  </span>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Падеж (ден от месеца)</span>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    step={1}
                    value={feesForm.fee_due_day}
                    disabled={busy}
                    onChange={(e) =>
                      setFeesForm((f) => ({ ...f, fee_due_day: e.target.value }))
                    }
                  />
                  <span className="uiMuted" style={{ fontSize: 12 }}>
                    По подразбиране до {feesDefaults.fee_due_day}-о число
                  </span>
                </label>
                <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                  <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    Освободени над възраст
                  </legend>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className={`coachMobileSubNavBtn${feesForm.age_exempt_enabled ? " is-active" : ""}`}
                      disabled={busy}
                      onClick={() => setFeesForm((f) => ({ ...f, age_exempt_enabled: true }))}
                    >
                      Да
                    </button>
                    <button
                      type="button"
                      className={`coachMobileSubNavBtn${!feesForm.age_exempt_enabled ? " is-active" : ""}`}
                      disabled={busy}
                      onClick={() => setFeesForm((f) => ({ ...f, age_exempt_enabled: false }))}
                    >
                      Не
                    </button>
                  </div>
                </fieldset>
                {feesForm.age_exempt_enabled ? (
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>От възраст (години)</span>
                    <Input
                      type="number"
                      min={1}
                      max={80}
                      step={1}
                      value={feesForm.age_exempt_min_age}
                      disabled={busy}
                      onChange={(e) =>
                        setFeesForm((f) => ({ ...f, age_exempt_min_age: e.target.value }))
                      }
                    />
                    <span className="uiMuted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Възраст към 1 януари. По подразбиране {feesDefaults.age_exempt_min_age}. Смяната
                      важи от следващия месец
                      {feesMeta.age_exempt_from_month
                        ? ` (от ${feesMeta.age_exempt_from_month})`
                        : ""}
                      .
                    </span>
                  </label>
                ) : null}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
                Клубът работи без месечна такса. Модулът за такси е скрит за родители и треньори.
              </p>
            )}

            <div>
              <Button type="button" disabled={busy} onClick={saveFeesSettings}>
                Запази настройката
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "enroll" ? publicPageCard : null}

      {activeTab === "coaches" ? (
      <Card title="Треньори — телефони за родители">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Телефоните се изтеглят от СЕК при sync (ако ги има). Можеш да ги допълниш ръчно — видимите се
          показват в родителския портал и на публичната страница на клуба.
        </p>
        {(profile.coaches || []).length === 0 ? (
          <EmptyState title="Няма треньори" description="Добави треньори в клуба." />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(profile.coaches || []).map((c) => {
              const draft = coachDrafts[c.id] || { phone: "", phone_visible_to_parents: true };
              return (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {c.name}
                    {c.bvf_coach_id ? (
                      <span className="uiMuted" style={{ fontWeight: 500, marginLeft: 8, fontSize: 12 }}>
                        СЕК #{c.bvf_coach_id}
                      </span>
                    ) : null}
                  </div>
                  {profile.can_edit ? (
                    <>
                      <Input
                        value={draft.phone}
                        placeholder="Телефон"
                        disabled={busy}
                        onChange={(e) =>
                          setCoachDrafts((d) => ({
                            ...d,
                            [c.id]: { ...draft, phone: e.target.value },
                          }))
                        }
                      />
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={draft.phone_visible_to_parents}
                          disabled={busy}
                          onChange={(e) =>
                            setCoachDrafts((d) => ({
                              ...d,
                              [c.id]: { ...draft, phone_visible_to_parents: e.target.checked },
                            }))
                          }
                        />
                        Видим за родители
                      </label>
                      <div>
                        <Button type="button" size="sm" disabled={busy} onClick={() => saveCoachPhone(c.id)}>
                          Запази
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 14 }}>
                      {c.phone || "—"}
                      {c.phone_visible_to_parents ? " · видим за родители" : " · скрит за родители"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      ) : null}
    </div>
  );
}
