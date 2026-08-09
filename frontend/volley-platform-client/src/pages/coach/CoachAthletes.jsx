import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../auth/AuthContext";
import useIsCoachMobileShell from "../../hooks/useIsCoachMobileShell";
import { useHorizontalSwipeTabs } from "../../hooks/useHorizontalSwipeTabs";
import AthleteIdentityFields from "../../components/athletes/AthleteIdentityFields";
import AthleteMembershipChips from "../../components/athletes/AthleteMembershipChips";
import CoachSpeedFab from "../../components/coachMobile/CoachSpeedFab";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import { normalizeError } from "../../utils/normalizeError";
import { filterFeesAthletes } from "../../utils/feesAthleteSearch";
import {
  buildAthletePayload,
  emptyAthleteIdentityForm,
  validateAthleteIdentityForm,
} from "../../utils/athleteIdentity";

const TABS = [
  { id: "list", label: "Списък" },
  { id: "add", label: "Нов" },
];

const FILTERS = [
  { id: "all", label: "Всички" },
  { id: "no_sek", label: "без СЕК" },
  { id: "with_sek", label: "в СЕК" },
  { id: "no_photo", label: "без снимка" },
  { id: "with_photo", label: "със снимка" },
  { id: "no_team", label: "без група" },
  { id: "with_team", label: "с група" },
  { id: "ready", label: "СЕК + снимка" },
];

function formatGenderShort(v) {
  if (v === "male") return "М";
  if (v === "female") return "Ж";
  return "—";
}

function matchesStatusFilter(a, filterId) {
  const hasTeam = Boolean(a.team_names && a.team_names.length);
  if (filterId === "no_sek") return !a.bvf_player_id;
  if (filterId === "with_sek") return Boolean(a.bvf_player_id);
  if (filterId === "no_photo") return !a.has_photo;
  if (filterId === "with_photo") return Boolean(a.has_photo);
  if (filterId === "no_team") return !hasTeam;
  if (filterId === "with_team") return hasTeam;
  if (filterId === "ready") return Boolean(a.bvf_player_id) && Boolean(a.has_photo);
  return true;
}

export default function CoachAthletes() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsCoachMobileShell();

  const roleRaw = user?.role;
  const roleValue = typeof roleRaw === "object" && roleRaw && "value" in roleRaw ? roleRaw.value : roleRaw;
  const isHeadCoach = String(roleValue || "").toLowerCase() === "club_head_coach";
  const showCardIndexes = Boolean(user?.show_card_indexes_nav) || isHeadCoach;

  const tab = searchParams.get("tab") === "add" ? "add" : "list";
  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === "add") params.set("tab", "add");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

  const [athletes, setAthletes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [athleteForm, setAthleteForm] = useState(() => emptyAthleteIdentityForm());
  const [teamId, setTeamId] = useState("");
  const [cardIndexes, setCardIndexes] = useState([]);
  const [clubCoaches, setClubCoaches] = useState([]);
  const importInputRef = useRef(null);

  const swipeHandlers = useHorizontalSwipeTabs(tab, setTab, TABS.map((t) => t.id));

  const loadAthletes = async () => {
    const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST);
    setAthletes(Array.isArray(res.data) ? res.data : []);
  };

  const loadTeams = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setTeams(list.filter((t) => t.is_active !== false));
  };

  const loadCardIndexes = async () => {
    if (!showCardIndexes) {
      setCardIndexes([]);
      return;
    }
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_LOCAL);
      const list = Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data)
          ? res.data
          : [];
      setCardIndexes(list.filter((row) => !["signed", "closed"].includes(String(row.status || ""))));
    } catch {
      setCardIndexes([]);
    }
  };

  const loadClubCoaches = async () => {
    if (!isHeadCoach) {
      setClubCoaches([]);
      return;
    }
    try {
      const res = await axiosInstance.get(API_PATHS.FEES_COACHES_LIST);
      setClubCoaches(Array.isArray(res.data) ? res.data : []);
    } catch {
      setClubCoaches([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadAthletes(), loadTeams(), loadCardIndexes(), loadClubCoaches()]);
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHeadCoach, showCardIndexes]);

  const filteredAthletes = useMemo(() => {
    const byQuery = filterFeesAthletes(athletes, query);
    return byQuery.filter((a) => matchesStatusFilter(a, statusFilter));
  }, [athletes, query, statusFilter]);

  const rosterStats = useMemo(() => {
    const total = athletes.length;
    const inSek = athletes.filter((a) => a.bvf_player_id).length;
    const withoutSek = Math.max(0, total - inSek);
    const nameById = new Map(
      (clubCoaches || []).map((c) => [Number(c.id), (c.name || "").trim() || `Треньор #${c.id}`]),
    );
    const byCoachMap = new Map();
    for (const a of athletes) {
      const cid = Number(a.coach_id || 0);
      if (!cid) continue;
      const row = byCoachMap.get(cid) || { coach_id: cid, coach_name: nameById.get(cid) || `Треньор #${cid}`, count: 0, sek: 0 };
      row.count += 1;
      if (a.bvf_player_id) row.sek += 1;
      if (!row.coach_name || row.coach_name.startsWith("Треньор #")) {
        const n = nameById.get(cid);
        if (n) row.coach_name = n;
      }
      byCoachMap.set(cid, row);
    }
    const byCoach = Array.from(byCoachMap.values()).sort((a, b) =>
      String(a.coach_name).localeCompare(String(b.coach_name), "bg"),
    );
    return { total, inSek, withoutSek, byCoach };
  }, [athletes, clubCoaches]);

  const teamsForForm = useMemo(() => {
    const g = athleteForm.gender;
    if (!g) return teams;
    return teams.filter((t) => !t.gender || t.gender === g);
  }, [teams, athleteForm.gender]);

  const resetForm = () => {
    setAthleteForm(emptyAthleteIdentityForm());
    setTeamId("");
  };

  const saveAthlete = async () => {
    const err = validateAthleteIdentityForm(athleteForm, { mode: "minimal" });
    if (err) {
      toast.error(err);
      return;
    }
    const tid = Number(teamId);
    if (!Number.isFinite(tid) || tid <= 0) {
      toast.error("Избери тренировъчна група.");
      return;
    }
    const payload = { ...buildAthletePayload(athleteForm, { mode: "minimal" }), team_id: tid };
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_ATHLETE_CREATE, payload);
      resetForm();
      await loadAthletes();
      toast.success("Състезателят е създаден. Родителят да попълни заявлението за прием.");
      setTab("list");
    } catch (err2) {
      toast.error(normalizeError(err2));
    } finally {
      setBusy(false);
    }
  };

  const importAthletes = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.FEES_ATHLETES_IMPORT, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadAthletes();
      toast.success(
        `Импорт: създадени ${res.data?.created ?? 0}, пропуснати ${res.data?.skipped_duplicates ?? 0}.`,
      );
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен импорт."));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_IMPORT_TEMPLATE, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "athletes-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтегляне на шаблон."));
    }
  };

  const openProfile = (athleteId) => {
    navigate(`/coach/athletes/${athleteId}`);
  };

  const countLabel = query.trim() || statusFilter !== "all"
    ? `${filteredAthletes.length} от ${athletes.length}`
    : `Общо ${athletes.length}`;

  const listBody = (
    <>
      {showCardIndexes && cardIndexes.length > 0 ? (
        <section className="athletesHubCardingBanner">
          <h3 className="athletesHubCardingTitle">Картотекиране този сезон</h3>
          <p className="athletesHubCardingHint">
            Имаш картотечни отбори за попълване. Добавяй само състезатели, готови за СЕК (снимка, данни,
            форма 03).
          </p>
          <div className="athletesHubCardingList">
            {cardIndexes.slice(0, 6).map((ci) => {
              const sexLabel =
                ci.sex === 1 || ci.sex === "male" || ci.sex === "m"
                  ? "М"
                  : ci.sex === 2 || ci.sex === "female" || ci.sex === "f"
                    ? "Ж"
                    : "";
              const title =
                ci.age_group ||
                `${ci.age != null ? `U${ci.age}` : "Отбор"}${sexLabel ? ` ${sexLabel}` : ""}`;
              return (
                <Link key={ci.id} to="/coach/bvf-card-indexes" className="athletesHubCardingChip">
                  {title}
                  {ci.status ? ` · ${ci.status}` : ""}
                  {ci.members_count != null ? ` · ${ci.members_count}` : ""}
                </Link>
              );
            })}
          </div>
          <Button as={Link} to="/coach/bvf-card-indexes" size="sm" variant="secondary">
            Към картотечни отбори
          </Button>
        </section>
      ) : null}

      {!loading && athletes.length > 0 ? (
        <section className="athletesHubStatsBar" aria-label="Брой състезатели">
          <p className="athletesHubStatsTotal">В системата: {rosterStats.total}</p>
          <p className="athletesHubStatsMeta">
            В СЕК: {rosterStats.inSek} · без СЕК: {rosterStats.withoutSek}
          </p>
          {isHeadCoach && rosterStats.byCoach.length > 0 ? (
            <p className="athletesHubStatsCoaches">
              {rosterStats.byCoach.map((row, i) => (
                <span key={row.coach_id}>
                  {i > 0 ? <span className="athletesHubStatsCoachSep"> · </span> : null}
                  <strong>{row.coach_name}</strong> {row.count}
                  <span className="athletesHubStatsMeta"> ({row.sek} СЕК)</span>
                </span>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="athletesHubStickyBar">
        <Input
          placeholder="Търсене: име, група, година…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Търсене"
        />
        <div className="athletesHubFilters" role="group" aria-label="Филтри">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`athletesHubFilterBtn${statusFilter === f.id ? " is-active" : ""}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="athletesHubToolbarRow">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => importInputRef.current?.click()}>
            Импорт
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate}>
            Шаблон
          </Button>
          <Button type="button" size="sm" onClick={() => setTab("add")}>
            Нов състезател
          </Button>
          <Button as={Link} to="/coach/enrollments" size="sm" variant="secondary">
            Записвания онлайн
          </Button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          importAthletes(file);
        }}
      />

      {loading ? <p className="coachMobileMuted">Зареждане…</p> : null}
      {!loading && athletes.length === 0 ? (
        <EmptyState
          title="Няма състезатели"
          description="Създай първия от таб „Нов“ или импортирай списък."
        />
      ) : null}
      {!loading && athletes.length > 0 && filteredAthletes.length === 0 ? (
        <EmptyState title="Няма съвпадения" description="Промени търсенето или филтъра." />
      ) : null}

      {!loading && filteredAthletes.length > 0 ? (
        <ul className="feesCoachAthleteList athletesHubList">
          {filteredAthletes.map((a) => (
            <li key={a.id}>
              <article
                className={`feesAthleteCardCompact${a.gender === "male" ? " feesAthleteCardCompact--male" : ""}${
                  a.gender === "female" ? " feesAthleteCardCompact--female" : ""
                }`}
                onClick={() => openProfile(a.id)}
              >
                <div className="feesAthleteCardCompactBody">
                  <h3 className="feesAthleteCardCompactName">{a.athlete_name}</h3>
                  <p className="feesAthleteCardCompactMeta">
                    {a.birth_year || "—"} · {formatGenderShort(a.gender)}
                    {!a.is_active ? " · неактивен" : ""}
                    {" · "}
                    <span className={a.bvf_player_id ? "feesSekMark feesSekMark--on" : "feesSekMark feesSekMark--off"}>
                      {a.bvf_player_id
                        ? `СЕК${a.bvf_player_number ? ` №${a.bvf_player_number}` : ""}`
                        : "без СЕК"}
                    </span>
                    {!a.bvf_player_id ? (
                      <>
                        {" · "}
                        <span className={a.has_photo ? "feesSekMark feesSekMark--on" : "feesSekMark feesSekMark--off"}>
                          {a.has_photo ? "снимка" : "без снимка"}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <AthleteMembershipChips
                    dense
                    teamNames={a.team_names}
                    cardedTeams={a.carded_teams}
                    showEmpty={!a.team_names?.length && !a.carded_teams?.length}
                  />
                </div>
                <div className="feesAthleteCardCompactActions">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProfile(a.id);
                    }}
                  >
                    Профил
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  const addBody = (
    <section className="feesCoachAddSection athletesHubAdd">
      <p className="coachMobileMuted">
        Само име, година, пол, телефон на родител и група. Останалото идва от заявлението за прием;
        снимката добавяш ти за СЕК.
      </p>
      <div className="feesCoachForm">
        <AthleteIdentityFields form={athleteForm} setForm={setAthleteForm} mode="minimal" showEgn={false} />
        <label className="athletesHubTeamField">
          <span>Тренировъчна група *</span>
          <select
            className="uiInput"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            required
          >
            <option value="">Избери група…</option>
            {teamsForForm.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.coach_name ? ` · ${t.coach_name}` : ""}
              </option>
            ))}
          </select>
        </label>
        {teamsForForm.length === 0 ? (
          <p className="coachMobileMuted">
            Няма подходяща група. Първо създай тренировъчна група или смени пола.
          </p>
        ) : null}
        <Button disabled={busy} onClick={saveAthlete} block>
          Създай състезател
        </Button>
        <Button variant="secondary" onClick={resetForm} block disabled={busy}>
          Изчисти
        </Button>
        {!isMobile ? (
          <Button variant="secondary" onClick={() => setTab("list")} block disabled={busy}>
            Към списъка
          </Button>
        ) : null}
      </div>
    </section>
  );

  if (isMobile) {
    return (
      <div className="coachMobilePage feesCoachPage athletesHubPage">
        <header className="feesCoachHead">
          <h2 className="feesCoachHeadTitle">Състезатели</h2>
          <span className="feesCoachHeadBadge">{countLabel}</span>
        </header>
        <nav className="coachMobileSubNav" aria-label="Състезатели секции">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`coachMobileSubNavBtn${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="feesCoachSwipeArea" {...swipeHandlers}>
          {tab === "list" ? listBody : addBody}
        </div>
        <CoachSpeedFab
          actions={[
            {
              id: "add",
              label: "Нов състезател",
              primary: true,
              onClick: () => setTab("add"),
            },
            { id: "enroll", label: "Записвания онлайн", to: "/coach/enrollments" },
            { id: "fees", label: "Плати такса", to: "/coach/fees" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Състезатели"
        subtitle="Профили, тренировъчни групи и готовност за СЕК. Таксите са в отделен модул."
      />
      {tab === "add" ? <Card title="Нов състезател">{addBody}</Card> : <Card title="Списък">{listBody}</Card>}
    </div>
  );
}
