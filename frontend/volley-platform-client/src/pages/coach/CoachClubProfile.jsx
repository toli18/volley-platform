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

  const load = useCallback(async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CLUB_PROFILE);
      setProfile(res.data);
      const drafts = {};
      for (const c of res.data?.coaches || []) {
        drafts[c.id] = {
          phone: c.phone || "",
          phone_visible_to_parents: Boolean(c.phone_visible_to_parents),
        };
      }
      setCoachDrafts(drafts);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на клубен профил."));
    } finally {
      setBusy(false);
    }
  }, [toast]);

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

      <Card title="Треньори — телефони за родители">
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
          Телефоните се изтеглят от СЕК при sync (ако ги има). Можеш да ги допълниш ръчно — видимите се
          показват в родителския портал.
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
