import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { parentLoginUrl } from "../../utils/parentAuth";
import { useToast } from "../../components/ToastProvider";
import { EmptyState } from "../../components/ui";
import AthleteProfileCoachMobile from "./AthleteProfileCoachMobile";

const normalizeError = (err, fallback = "Грешка.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default function CoachAthleteProfile() {
  const { athleteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const athleteIdNum = Number(athleteId);

  const from = searchParams.get("from") || "/coach/teams";
  const tab = ["overview", "attendance", "fees", "history"].includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")
    : "overview";
  const setTab = (id) => setSearchParams({ tab: id, from }, { replace: true });

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [coachTeams, setCoachTeams] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());
  const [initialTeamIds, setInitialTeamIds] = useState(() => new Set());

  const feesAllHref = useMemo(() => {
    if (!profile?.athlete_id) return "/coach/fees";
    return `/coach/fees?athlete_id=${encodeURIComponent(profile.athlete_id)}`;
  }, [profile?.athlete_id]);

  const feesEditHref = useMemo(() => {
    if (!profile?.athlete_id) return "/coach/fees";
    return `/coach/fees?athlete_id=${encodeURIComponent(profile.athlete_id)}&focus=edit`;
  }, [profile?.athlete_id]);

  const feesPayHref = useMemo(() => {
    if (!profile?.athlete_id) return "/coach/fees";
    return `/coach/fees?athlete_id=${encodeURIComponent(profile.athlete_id)}&focus=pay`;
  }, [profile?.athlete_id]);

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
      const profileRes = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteIdNum));
      setProfile(profileRes.data || null);
      toast.success(changedNames.length ? "Отборите са запазени." : "Промените са запазени.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на отборите."));
    } finally {
      setSaving(false);
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

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (!profile) {
    return <EmptyState title="Състезател" description="Профилът не е намерен или нямате достъп." />;
  }

  return (
    <AthleteProfileCoachMobile
      profile={profile}
      tab={tab}
      setTab={setTab}
      from={from}
      feesPayHref={feesPayHref}
      feesEditHref={feesEditHref}
      feesAllHref={feesAllHref}
      coachTeams={coachTeams}
      selectedTeamIds={selectedTeamIds}
      savingTeams={saving}
      hasTeamChanges={hasTeamChanges}
      onToggleTeam={toggleTeam}
      onSaveTeams={saveTeams}
      onCopyParentUrl={copyParentLoginUrl}
      onBack={() => navigate(from)}
    />
  );
}
