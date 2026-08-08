import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import ClubLogo from "../../components/shared/ClubLogo";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

export default function CoachClubProfile() {
  const { user } = useAuth();
  const toast = useToast();
  const role = normalizeRole(user);
  const isHead =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [coachDrafts, setCoachDrafts] = useState({});
  const [publicForm, setPublicForm] = useState({
    public_page_enabled: false,
    public_slug: "",
    public_tagline: "",
    public_about: "",
    facebook_page_url: "",
  });
  const [publicMeta, setPublicMeta] = useState(null);

  const [enrollmentTeamIds, setEnrollmentTeamIds] = useState([]);
  const [clubTeams, setClubTeams] = useState([]);

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const jobs = [axiosInstance.get(API_PATHS.BVF_ADMIN_CLUB_PROFILE)];
      if (isHead) jobs.push(axiosInstance.get(API_PATHS.CLUB_PUBLIC_PAGE_SETTINGS));
      const [res, pubRes] = await Promise.all(jobs);
      setProfile(res.data);
      const drafts = {};
      for (const c of res.data?.coaches || []) {
        drafts[c.id] = {
          phone: c.phone || "",
          phone_visible_to_parents: Boolean(c.phone_visible_to_parents),
        };
      }
      setCoachDrafts(drafts);
      if (pubRes?.data) {
        setPublicMeta(pubRes.data);
        setPublicForm({
          public_page_enabled: Boolean(pubRes.data.public_page_enabled),
          public_slug: pubRes.data.public_slug || "",
          public_tagline: pubRes.data.public_tagline || "",
          public_about: pubRes.data.public_about || "",
          facebook_page_url: pubRes.data.facebook_page_url || "",
        });
        const teams = Array.isArray(pubRes.data.teams) ? pubRes.data.teams : [];
        setClubTeams(teams);
        setEnrollmentTeamIds(
          teams.filter((t) => t.public_enrollment_open && t.is_active).map((t) => Number(t.id)),
        );
      }
    } catch (err) {
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
      const s = res.data?.sync || {};
      toast.success(
        `Синхронизирано от СЕК · телефони обновени: ${s.phones_updated ?? 0} · полета: ${(s.changed_fields || []).length}`,
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
        facebook_page_url: res.data.facebook_page_url || "",
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

  const publicPageCard = isHead ? (
    <Card title="Набиране на нови деца (публична страница)">
      <ol style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
        <li>Включи публичната страница и запази (линкът е по-долу).</li>
        <li>
          <strong>Отвори групите за набиране</strong> с отметките — само те се показват на родителите.
        </li>
        <li>Родителят избира група по <strong>име</strong> и дата за пробна тренировка.</li>
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
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Facebook страница</span>
          <Input
            placeholder="https://www.facebook.com/..."
            value={publicForm.facebook_page_url}
            disabled={busy}
            onChange={(e) => setPublicForm((p) => ({ ...p, facebook_page_url: e.target.value }))}
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
        {publicUrl ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            Публичен линк:{" "}
            <a href={publicUrl} target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </p>
        ) : (
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Включи страницата, отметни групи и запази — после ще се появи линкът.
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
        <EmptyState title="Зареждане…" description="Профил на клуба" />
      </div>
    );
  }

  if (!profile.unlocked) {
    return (
      <div className="uiPage">
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
        {publicPageCard}
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title={profile.name || "Профил на клуба"}
        subtitle={
          profile.bvf_club_id
            ? `Свързан със СЕК · БФВ №${profile.bvf_club_id}${profile.bvf_club_name ? ` · ${profile.bvf_club_name}` : ""}`
            : "Клубен профил"
        }
        actions={
          <>
            {profile.can_sync ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={syncFromSek}>
                Изтегли от СЕК
              </Button>
            ) : null}
            <Link to="/coach/bvf-admin">
              <Button variant="secondary">Администрация БФВ</Button>
            </Link>
          </>
        }
      />

      <Card title="Клуб">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {profile.logo_url ? (
            <ClubLogo logoUrl={profile.logo_url} name={profile.name} className="appHeaderClubLogo" />
          ) : null}
          <div style={{ flex: "1 1 280px", display: "grid", gap: 8 }}>
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

      {publicPageCard}

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
    </div>
  );
}
