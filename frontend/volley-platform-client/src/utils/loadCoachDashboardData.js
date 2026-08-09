import axiosInstance from "./apiClient";
import { API_PATHS } from "./apiPaths";
import { createDraftKey, hasMeaningfulDraft, loadDraft } from "./articleDrafts";
import {
  buildFeeOverdueLists,
  feesLookbackFromMonth,
  loadCoachAttendanceRegularity,
} from "./coachDashboardStats";
import { normalizePlan } from "./trainingPlanNormalize";

export const currentMonthKey = (now = new Date()) => {
  const d = now instanceof Date ? now : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatShortDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
};

const monthStartMs = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
};

const extractDrillIdsFromPlan = (plan) => {
  const normalized = normalizePlan(plan);
  return Object.values(normalized).flatMap((items) => items.map((x) => x.drillId));
};

const HEAD_STATS_SCOPE_KEY = (userId) => `vp-head-stats-team-scope-${userId}`;

export function readHeadStatsScope(userId) {
  try {
    const raw = localStorage.getItem(HEAD_STATS_SCOPE_KEY(userId));
    return raw === "mine" || raw === "all" ? raw : "all";
  } catch {
    return "all";
  }
}

export function writeHeadStatsScope(userId, scope) {
  try {
    localStorage.setItem(HEAD_STATS_SCOPE_KEY(userId), scope);
  } catch {
    /* ignore */
  }
}

export const EMPTY_DASHBOARD = {
  feesSummary: { total: 0, paid: 0, unpaid: 0 },
  feeOverdue: { late10: [], overTwo: [] },
  forumItems: [],
  articleItems: [],
  lastTrainings: [],
  topDrills: [],
  draftCount: 0,
  returnedArticles: [],
  activityItems: [],
  monthlyStats: { trainingsCreated: 0, drillsUsed: 0 },
  scheduleItems: [],
  attendanceRank: { top: [], bottom: [], sessionLimit: 10 },
  absenceNotices: [],
  monthKey: currentMonthKey(),
};

/** Слива частично заредени секции; activityItems се обединяват по id. */
export function mergeDashboardData(prev, partial) {
  if (!partial || typeof partial !== "object") return prev;
  const next = { ...prev };
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    if (key === "activityItems" && Array.isArray(prev?.activityItems) && Array.isArray(value)) {
      const map = new Map();
      [...prev.activityItems, ...value].forEach((item) => {
        if (item?.id != null) map.set(item.id, item);
      });
      next.activityItems = Array.from(map.values())
        .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
        .slice(0, 12);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function scheduleParams({ isHeadCoach, myCoachId, scopeMine }) {
  return {
    from: new Date().toISOString().slice(0, 10),
    to: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    ...(!isHeadCoach && myCoachId ? { coach_id: myCoachId } : {}),
    ...(scopeMine && myCoachId ? { coach_id: myCoachId } : {}),
  };
}

async function loadTodaySection({ isHeadCoach, myCoachId, scopeMine }) {
  const [scheduleRes, absenceRes, notificationsRes] = await Promise.allSettled([
    axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
      params: scheduleParams({ isHeadCoach, myCoachId, scopeMine }),
    }),
    axiosInstance.get(API_PATHS.COACH_ABSENCE_NOTICES),
    axiosInstance.get(API_PATHS.FORUM_NOTIFICATIONS, { params: { limit: 8 } }),
  ]);

  const absenceList =
    absenceRes.status === "fulfilled" && Array.isArray(absenceRes.value.data) ? absenceRes.value.data : [];
  const absenceAlerts = absenceList.map((n) => ({
    id: `absence-${n.id}`,
    kind: "absence",
    text: `Извинение от родител: ${n.athlete_name} ще липсва на ${formatShortDate(n.notice_date)}${n.team_name ? ` · ${n.team_name}` : ""}${n.note ? ` (${n.note})` : ""}`,
    at: n.created_at,
    to: n.team_id
      ? `/teams/${n.team_id}/attendance?date=${encodeURIComponent(n.notice_date)}`
      : "/coach/teams",
  }));

  const forumNotifications =
    notificationsRes.status === "fulfilled" && Array.isArray(notificationsRes.value.data?.items)
      ? notificationsRes.value.data.items.map((n) => ({
          id: `forum-${n.id}`,
          text: n.message,
          at: n.created_at,
          to: `/forum/${n.post_id}`,
        }))
      : [];

  const scheduleList =
    scheduleRes.status === "fulfilled" && Array.isArray(scheduleRes.value.data?.items)
      ? scheduleRes.value.data.items
      : [];

  return {
    absenceNotices: absenceList,
    scheduleItems: scheduleList.slice(0, isHeadCoach ? 48 : 24),
    activityItems: [...absenceAlerts, ...forumNotifications]
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
      .slice(0, 12),
  };
}

async function loadContentSection() {
  const [forumRes, articlesRes, trainingsRes, drillsRes, myDrillsRes, myArticlesRes] =
    await Promise.allSettled([
      axiosInstance.get(API_PATHS.FORUM_POSTS_LIST, { params: { page: 1, page_size: 5 } }),
      axiosInstance.get(API_PATHS.ARTICLES_LIST),
      axiosInstance.get(API_PATHS.TRAININGS_LIST_MY),
      axiosInstance.get(API_PATHS.DRILLS_LIST),
      axiosInstance.get(API_PATHS.DRILLS_MY),
      axiosInstance.get(API_PATHS.ARTICLE_MINE),
    ]);

  const forumList =
    forumRes.status === "fulfilled" && Array.isArray(forumRes.value.data?.items)
      ? forumRes.value.data.items
      : [];

  const articles =
    articlesRes.status === "fulfilled" && Array.isArray(articlesRes.value.data)
      ? articlesRes.value.data
      : [];
  articles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const myTrainings =
    trainingsRes.status === "fulfilled" && Array.isArray(trainingsRes.value.data)
      ? [...trainingsRes.value.data]
      : [];
  myTrainings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const allDrills =
    drillsRes.status === "fulfilled" && Array.isArray(drillsRes.value.data) ? drillsRes.value.data : [];
  const myDrills =
    myDrillsRes.status === "fulfilled" && Array.isArray(myDrillsRes.value.data)
      ? myDrillsRes.value.data
      : [];
  const myArticles =
    myArticlesRes.status === "fulfilled" && Array.isArray(myArticlesRes.value.data)
      ? myArticlesRes.value.data
      : [];

  const drillIds = myTrainings.flatMap((t) => extractDrillIdsFromPlan(t.plan));
  const uniqueDrillIds = new Set(drillIds);
  const drillCountMap = new Map();
  drillIds.forEach((id) => {
    drillCountMap.set(id, (drillCountMap.get(id) || 0) + 1);
  });

  const drillNameMap = new Map();
  [...allDrills, ...myDrills].forEach((d) => {
    const id = Number(d.id);
    if (Number.isFinite(id)) drillNameMap.set(id, d.title || d.name || `Упражнение #${id}`);
  });

  const topDrills = Array.from(drillCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count, title: drillNameMap.get(id) || `Упражнение #${id}` }));

  const localDraft = loadDraft(createDraftKey());
  const hasLocalDraft = hasMeaningfulDraft(localDraft);
  const draftTrainings = myTrainings.filter((t) =>
    String(t.status || "").toLowerCase().includes("draft"),
  ).length;

  const returnedArticles = myArticles
    .filter((a) => String(a.status || "").toUpperCase() === "NEEDS_EDIT")
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 5);

  const monthFrom = monthStartMs();
  const monthlyStats = {
    trainingsCreated: myTrainings.filter((t) => new Date(t.created_at || 0).getTime() >= monthFrom).length,
    drillsUsed: uniqueDrillIds.size,
  };

  const articleStatusAlerts = myArticles
    .filter((a) => {
      const st = String(a.status || "").toUpperCase();
      return st === "APPROVED" || st === "REJECTED" || st === "NEEDS_EDIT";
    })
    .map((a) => {
      const st = String(a.status || "").toUpperCase();
      const label = st === "APPROVED" ? "одобрена" : st === "REJECTED" ? "отказана" : "върната за редакция";
      return {
        id: `article-${a.id}-${st}`,
        text: `Статия "${a.title || `#${a.id}`}" е ${label}.`,
        at: a.updated_at || a.created_at,
        to: "/articles/my",
      };
    });

  const drillStatusAlerts = myDrills
    .filter((d) => {
      const st = String(d.status || "").toLowerCase();
      return st === "approved" || st === "rejected";
    })
    .map((d) => {
      const st = String(d.status || "").toLowerCase();
      const label = st === "approved" ? "одобрено" : "отказано";
      return {
        id: `drill-${d.id}-${st}`,
        text: `Упражнение "${d.title || d.name || `#${d.id}`}" е ${label}.`,
        at: d.updated_at || d.created_at,
        to: "/my-drills",
      };
    });

  return {
    forumItems: forumList.slice(0, 5),
    articleItems: articles.slice(0, 5),
    lastTrainings: myTrainings.slice(0, 5),
    topDrills,
    draftCount: draftTrainings + (hasLocalDraft ? 1 : 0),
    returnedArticles,
    monthlyStats,
    activityItems: [...articleStatusAlerts, ...drillStatusAlerts],
  };
}

async function loadStatsSection({
  isHeadCoach,
  myCoachId,
  scopeMine,
  monthKey,
  includeTrainingStats = true,
}) {
  const feesParams = {
    from_month: feesLookbackFromMonth(monthKey, 2),
    to_month: monthKey,
  };
  if (scopeMine && myCoachId) feesParams.coach_id = myCoachId;

  const tasks = [
    axiosInstance.get(API_PATHS.FEES_PERIOD_REPORT, { params: feesParams }),
    axiosInstance.get(API_PATHS.TEAMS_LIST),
  ];
  if (includeTrainingStats) {
    tasks.push(axiosInstance.get(API_PATHS.TRAININGS_LIST_MY));
  }

  const results = await Promise.allSettled(tasks);
  const [feesRes, teamsRes, trainingsRes] = results;

  const feesRows =
    feesRes.status === "fulfilled" && Array.isArray(feesRes.value.data?.rows)
      ? feesRes.value.data.rows
      : [];
  const unpaid = feesRows.filter((row) => {
    const month = Array.isArray(row.months) ? row.months.find((m) => m?.month_key === monthKey) : null;
    return month ? !month.paid : false;
  }).length;

  let teamList =
    teamsRes.status === "fulfilled" && Array.isArray(teamsRes.value.data) ? teamsRes.value.data : [];
  if ((!isHeadCoach || scopeMine) && myCoachId) {
    teamList = teamList.filter((t) => Number(t?.coach_id) === myCoachId);
  }
  teamList = teamList.filter((t) => t.is_active !== false);

  let attendanceRank = { top: [], bottom: [], sessionLimit: 10 };
  try {
    attendanceRank = await loadCoachAttendanceRegularity(axiosInstance, teamList, { sessionLimit: 10 });
  } catch {
    attendanceRank = { top: [], bottom: [], sessionLimit: 10 };
  }

  const partial = {
    feesSummary: {
      total: feesRows.length,
      paid: Math.max(0, feesRows.length - unpaid),
      unpaid,
    },
    feeOverdue: buildFeeOverdueLists(feesRows),
    attendanceRank,
  };

  if (includeTrainingStats && trainingsRes?.status === "fulfilled") {
    const myTrainings = Array.isArray(trainingsRes.value.data) ? trainingsRes.value.data : [];
    const monthFrom = monthStartMs();
    const drillIds = myTrainings.flatMap((t) => extractDrillIdsFromPlan(t.plan));
    partial.monthlyStats = {
      trainingsCreated: myTrainings.filter((t) => new Date(t.created_at || 0).getTime() >= monthFrom).length,
      drillsUsed: new Set(drillIds).size,
    };
  }

  return partial;
}

/**
 * Данни за Coach Dashboard табовете (Днес / Съдържание / Статистика).
 * `sections`: кои табове да зареди — по подразбиране всички (обратна съвместимост).
 */
export async function loadCoachDashboardData({
  userId,
  isHeadCoach,
  headTeamScope = "all",
  monthKey = currentMonthKey(),
  sections = ["today", "content", "stats"],
  includeTrainingStats = true,
} = {}) {
  const myCoachId = Number(userId || 0);
  const scopeMine = isHeadCoach && headTeamScope === "mine";
  const want = new Set(Array.isArray(sections) ? sections : [sections]);

  const out = { monthKey };
  const jobs = [];

  if (want.has("today")) {
    jobs.push(
      loadTodaySection({ isHeadCoach, myCoachId, scopeMine }).then((part) => Object.assign(out, part)),
    );
  }
  if (want.has("content")) {
    jobs.push(loadContentSection().then((part) => Object.assign(out, part)));
  }
  if (want.has("stats")) {
    jobs.push(
      loadStatsSection({
        isHeadCoach,
        myCoachId,
        scopeMine,
        monthKey,
        includeTrainingStats: includeTrainingStats && !want.has("content"),
      }).then((part) => Object.assign(out, part)),
    );
  }

  await Promise.all(jobs);
  return out;
}
