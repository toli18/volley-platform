import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { useToast } from "../../components/ToastProvider";
import { Button, EmptyState } from "../../components/ui";

const normalizeError = (err, fallback = "Грешка.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default function CoachAthleteProfile() {
  const { athleteId } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const athleteIdNum = Number(athleteId);

  const from = searchParams.get("from") || "/coach/teams";

  const role = String(user?.role || "").toLowerCase();
  const isHeadCoach = role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [coachTeams, setCoachTeams] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => new Set());
  const [initialTeamIds, setInitialTeamIds] = useState(() => new Set());

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

  const hasChanges = useMemo(() => {
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
    if (!hasChanges) {
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
      if (changedNames.length) {
        toast.success(`Отборите са запазени: ${changedNames.join(", ")}.`);
      } else {
        toast.success("Промените са запазени.");
      }
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на отборите."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="coachMobileMuted">Зареждане...</p>;
  }

  if (!profile) {
    return <EmptyState title="Състезател" description="Профилът не е намерен или нямате достъп." />;
  }

  return (
    <div className="coachMobilePage">
      <h2 className="coachMobileHubTeamName">{profile.athlete_name}</h2>
      <p className="coachMobileMuted">
        {profile.birth_year ? `Година ${profile.birth_year}` : ""}
        {profile.athlete_phone ? ` · ${profile.athlete_phone}` : ""}
      </p>

      <section className="coachMobileCard">
        <h3 className="coachMobileSectionTitle">Отбори</h3>
        <p className="coachMobileMuted" style={{ marginTop: 0 }}>
          Изберете в кои отбори участва състезателят. Натиснете „Запази“, за да приложите промените.
        </p>
        {coachTeams.length === 0 ? (
          <p className="coachMobileMuted">Нямате отбори за управление.</p>
        ) : (
          <ul className="coachMobileTeamPickList">
            {coachTeams.map((team) => (
              <li key={team.id}>
                <label className="coachMobileTeamPickRow">
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.has(team.id)}
                    onChange={() => toggleTeam(team.id)}
                    disabled={saving}
                  />
                  <span>
                    <span className="coachMobileMenuLabel">{team.name}</span>
                    {team.age_group ? (
                      <span className="coachMobileMuted coachMobileMenuHint">{team.age_group}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="coachMobileHubLinks" style={{ marginTop: 12 }}>
          <Button type="button" disabled={saving || !hasChanges} onClick={saveTeams}>
            {saving ? "Запазване..." : "Запази отбори"}
          </Button>
        </div>
      </section>

      <section className="coachMobileCard">
        <h3 className="coachMobileSectionTitle">Присъствие</h3>
        <p className="coachMobileMuted" style={{ marginTop: 0 }}>
          Процент: {profile.attendance_summary?.attendance_rate_percent ?? 0}% · Присъства:{" "}
          {profile.attendance_summary?.present ?? 0}
        </p>
      </section>

      <Link to={from} className="coachMobileQuickBtn" style={{ display: "inline-flex", marginTop: 4 }}>
        ← Назад
      </Link>
      <Link
        to={`/teams/athletes/${athleteIdNum}?from=${encodeURIComponent(from)}`}
        className="coachMobileMuted"
        style={{ display: "block", marginTop: 8, fontSize: 13 }}
      >
        Пълен профил (десктоп)
      </Link>
    </div>
  );
}
