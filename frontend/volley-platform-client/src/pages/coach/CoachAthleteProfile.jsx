import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { parentLoginUrl } from "../../utils/parentAuth";
import { useToast } from "../../components/ToastProvider";
import BvfCreateAthleteModal from "../../components/athletes/BvfCreateAthleteModal";
import BvfLinkByEgnModal from "../../components/athletes/BvfLinkByEgnModal";
import { EmptyState } from "../../components/ui";
import AthleteProfileCoachMobile from "./AthleteProfileCoachMobile";
import { normalizeError } from "../../utils/normalizeError";
import {
  athleteToIdentityForm,
  buildAthletePayload,
  validateAthleteIdentityForm,
} from "../../utils/athleteIdentity";

export default function CoachAthleteProfile() {
  const { athleteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const athleteIdNum = Number(athleteId);

  const from = searchParams.get("from") || "/coach/teams";
  const rawTab = searchParams.get("tab") || "";
  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);
  const monthlyFeesEnabled = user?.monthly_fees_enabled !== false;
  // „tests“ е стар alias — съдържанието е обединено в physical.
  const tab = ["overview", "data", "bvf", "tests", "physical", "attendance", "fees", "history"].includes(rawTab)
    ? rawTab === "tests"
      ? "physical"
      : rawTab
    : "overview";
  const setTab = (id) => setSearchParams({ tab: id, from }, { replace: true });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFeeExempt, setSavingFeeExempt] = useState(false);
  const [profile, setProfile] = useState(null);
  const showFees = monthlyFeesEnabled && !profile?.fee_exempt;

  useEffect(() => {
    if (!showFees && tab === "fees") {
      setSearchParams({ tab: "overview", from }, { replace: true });
    }
  }, [showFees, tab, from, setSearchParams]);

  const [coachTeams, setCoachTeams] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());
  const [initialTeamIds, setInitialTeamIds] = useState(() => new Set());

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [bvfOpen, setBvfOpen] = useState(false);
  const [bvfLinkOpen, setBvfLinkOpen] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
  const [syncingIdentity, setSyncingIdentity] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const feesAllHref = useMemo(() => {
    if (!profile?.athlete_id) return "/coach/fees";
    return `/coach/fees?athlete_id=${encodeURIComponent(profile.athlete_id)}`;
  }, [profile?.athlete_id]);

  const feesPayHref = useMemo(() => {
    if (!profile?.athlete_id) return "/coach/fees";
    return `/coach/fees?athlete_id=${encodeURIComponent(profile.athlete_id)}&focus=pay`;
  }, [profile?.athlete_id]);

  const reloadProfile = async () => {
    const profileRes = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteIdNum));
    setProfile(profileRes.data || null);
    return profileRes.data;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!athleteIdNum) return;
      try {
        setLoading(true);
        const [profileRes, teamsRes] = await Promise.all([
          axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteIdNum)),
          axiosInstance.get(API_PATHS.TEAMS_LIST),
        ]);
        if (cancelled) return;

        setProfile(profileRes.data || null);

        let teams = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        teams = teams.filter((t) => t.is_active !== false);
        if (!isHeadCoach) {
          teams = teams.filter((t) => Number(t?.coach_id) === currentUserId);
        }
        teams.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "bg"));
        setCoachTeams(teams);

        const memberChecks = await Promise.all(
          teams.map(async (team) => {
            try {
              const res = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(team.id));
              const members = Array.isArray(res.data?.members) ? res.data.members : [];
              return members.some((m) => Number(m.athlete_id) === athleteIdNum) ? team.id : null;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;

        const inTeams = new Set(memberChecks.filter(Boolean));
        setSelectedTeamIds(new Set(inTeams));
        setInitialTeamIds(new Set(inTeams));
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err, "Неуспешно зареждане на профила."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteIdNum, isHeadCoach, currentUserId, toast]);

  const hasTeamChanges = useMemo(() => {
    if (selectedTeamIds.size !== initialTeamIds.size) return true;
    for (const id of selectedTeamIds) {
      if (!initialTeamIds.has(id)) return true;
    }
    return false;
  }, [selectedTeamIds, initialTeamIds]);

  const toggleTeam = (teamId) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const saveTeams = async () => {
    if (!hasTeamChanges) {
      toast.success("Няма промени за запазване.");
      return;
    }
    try {
      setSaving(true);
      const changedNames = [];
      for (const team of coachTeams) {
        const shouldBe = selectedTeamIds.has(team.id);
        const was = initialTeamIds.has(team.id);
        if (shouldBe === was) continue;

        const res = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(team.id));
        const members = Array.isArray(res.data?.members) ? res.data.members : [];
        let ids = members.map((m) => Number(m.athlete_id));

        if (shouldBe && !ids.includes(athleteIdNum)) {
          ids = [...ids, athleteIdNum];
        }
        if (!shouldBe) {
          ids = ids.filter((id) => id !== athleteIdNum);
        }

        await axiosInstance.put(API_PATHS.TEAM_MEMBERS_SET(team.id), { athlete_ids: ids });
        changedNames.push(team.name);
      }

      setInitialTeamIds(new Set(selectedTeamIds));
      await reloadProfile();
      toast.success(changedNames.length ? "Отборите са запазени." : "Промените са запазени.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на отборите."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!profile) return;
    setEditForm(athleteToIdentityForm(profile));
    setEditing(true);
    setTab("data");
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditForm(null);
  };

  const saveProfile = async () => {
    if (!profile || !editForm) return;
    const locked = Boolean(profile.bvf_player_id || profile.bvf_identity_locked);
    if (!locked) {
      const err = validateAthleteIdentityForm(editForm, {
        requireSplitNames:
          Boolean(editForm.first_name || editForm.middle_name || editForm.last_name) || !editForm.athlete_name,
      });
      if (err) {
        toast.error(err);
        return;
      }
    }
    const payload = locked
      ? {
          athlete_phone: (editForm.athlete_phone || "").trim() || null,
          parent_name: (editForm.parent_name || "").trim() || null,
          parent_phone: (editForm.parent_phone || "").trim() || null,
          notes: (editForm.notes || "").trim() || null,
          is_active: Boolean(editForm.is_active),
          jersey_number: String(editForm.jersey_number ?? "").trim() === ""
            ? null
            : Number(editForm.jersey_number),
        }
      : buildAthletePayload(editForm);
    try {
      setSavingProfile(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_UPDATE(profile.athlete_id), payload);
      await reloadProfile();
      setEditing(false);
      setEditForm(null);
      toast.success("Профилът е запазен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване."));
    } finally {
      setSavingProfile(false);
    }
  };

  const copyParentLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(parentLoginUrl());
      toast.success("Адресът за родителски вход е копиран.");
    } catch {
      toast.error("Неуспешно копиране.");
    }
  };

  const syncPhotoFromBvf = async () => {
    if (!profile?.athlete_id) return;
    try {
      setSyncingPhoto(true);
      await axiosInstance.post(API_PATHS.BVF_ADMIN_SYNC_PHOTO, {
        athlete_id: profile.athlete_id,
      });
      toast.success("Снимката е заредена от БФВ.");
      await reloadProfile();
    } catch (err) {
      const msg = normalizeError(err, "Неуспешно зареждане на снимка.");
      toast.error(
        /няма право да чете файлове|\/api\/files/i.test(msg)
          ? `${msg} Ползвай „Качи снимка“ докато ApiKey-ът няма Files read.`
          : msg,
        { duration: 8000 }
      );
    } finally {
      setSyncingPhoto(false);
    }
  };

  const syncIdentityFromBvf = async () => {
    if (!profile?.athlete_id) return;
    try {
      setSyncingIdentity(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_SYNC_IDENTITY, {
        athlete_id: profile.athlete_id,
      });
      toast.success(res.data?.message || "Данните са обновени от СЕК.");
      await reloadProfile();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно обновяване на данните от СЕК."));
    } finally {
      setSyncingIdentity(false);
    }
  };

  const uploadLocalPhoto = async (file) => {
    if (!profile?.athlete_id || !file) return;
    const form = new FormData();
    form.append("file", file);
    // Само главният треньор изпраща снимка към СЕК; груповите треньори записват локално.
    const pushToBvf = Boolean(isHeadCoach && profile.bvf_player_id);
    form.append("push_to_bvf", pushToBvf ? "true" : "false");
    try {
      setSyncingPhoto(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_ATHLETE_PHOTO(profile.athlete_id), form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(
        res.data?.pushed_to_bvf
          ? "Снимката е записана и изпратена към СЕК."
          : "Снимката е записана локално (до създаване в СЕК).",
      );
      await reloadProfile();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно качване на снимка."));
    } finally {
      setSyncingPhoto(false);
    }
  };

  const deleteAthlete = async () => {
    if (!profile?.athlete_id) return;
    if (profile.bvf_player_id) {
      toast.error("Състезател, свързан със СЕК, не може да се изтрие.");
      return;
    }
    if (
      !window.confirm(
        `Изтриване на ${profile.athlete_name}? Това премахва локалния запис (такси, групи). Действието е необратимо.`,
      )
    ) {
      return;
    }
    try {
      setDeleting(true);
      await axiosInstance.delete(API_PATHS.FEES_ATHLETE_DELETE(profile.athlete_id));
      toast.success("Състезателят е изтрит.");
      navigate(from || "/coach/athletes", { replace: true });
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване."));
    } finally {
      setDeleting(false);
    }
  };

  const saveFeeExempt = async ({ fee_exempt_manual, fee_exempt_note }) => {
    if (!profile?.athlete_id || !isHeadCoach) return;
    try {
      setSavingFeeExempt(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_FEE_EXEMPT(profile.athlete_id), {
        fee_exempt_manual: Boolean(fee_exempt_manual),
        fee_exempt_note: fee_exempt_note || null,
      });
      await reloadProfile();
      toast.success(
        fee_exempt_manual
          ? "Ръчното освобождаване е записано (от следващия месец)."
          : "Ръчното освобождаване е махнато.",
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис на освобождаването."));
    } finally {
      setSavingFeeExempt(false);
    }
  };

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (!profile) {
    return <EmptyState title="Състезател" description="Профилът не е намерен или нямате достъп." />;
  }

  return (
    <>
      <AthleteProfileCoachMobile
        profile={profile}
        tab={tab}
        setTab={setTab}
        from={from}
        feesPayHref={feesPayHref}
        feesAllHref={feesAllHref}
        coachTeams={coachTeams}
        selectedTeamIds={selectedTeamIds}
        savingTeams={saving}
        hasTeamChanges={hasTeamChanges}
        onToggleTeam={toggleTeam}
        onSaveTeams={saveTeams}
        onCopyParentUrl={copyParentLoginUrl}
        onBack={() => navigate(from)}
        editing={editing}
        editForm={editForm}
        setEditForm={setEditForm}
        savingProfile={savingProfile}
        onStartEdit={startEdit}
        onCancelEdit={cancelEdit}
        onSaveEdit={saveProfile}
        onOpenBvfCreate={isHeadCoach ? () => setBvfOpen(true) : undefined}
        onOpenBvfLink={isHeadCoach ? () => setBvfLinkOpen(true) : undefined}
        onSyncPhoto={isHeadCoach ? syncPhotoFromBvf : undefined}
        onSyncIdentity={isHeadCoach ? syncIdentityFromBvf : undefined}
        onUploadPhoto={uploadLocalPhoto}
        syncingPhoto={syncingPhoto}
        syncingIdentity={syncingIdentity}
        canManageSek={isHeadCoach}
        onDelete={!profile.bvf_player_id ? deleteAthlete : undefined}
        deleting={deleting}
        onSaveFeeExempt={isHeadCoach ? saveFeeExempt : undefined}
        savingFeeExempt={savingFeeExempt}
      />
      {isHeadCoach ? (
        <>
          <BvfCreateAthleteModal
            open={bvfOpen}
            onClose={() => setBvfOpen(false)}
            athleteId={profile.athlete_id}
            athleteName={profile.athlete_name}
            initialEgn={profile.egn || ""}
            missing={profile.bvf_missing || []}
            hasPhoto={Boolean(profile.has_photo)}
            toast={toast}
            onCreated={async () => {
              await reloadProfile();
            }}
          />
          <BvfLinkByEgnModal
            open={bvfLinkOpen}
            onClose={() => setBvfLinkOpen(false)}
            athleteId={profile.athlete_id}
            athleteName={profile.athlete_name}
            initialEgn={profile.egn || ""}
            toast={toast}
            onLinked={async () => {
              await reloadProfile();
            }}
          />
        </>
      ) : null}
    </>
  );
}
