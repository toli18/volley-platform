import { COACH_MOBILE_TABS } from "./navConfig";

export function coachMobileActiveTab(pathname) {
  if (pathname.startsWith("/coach/chat")) return "chat";
  if (pathname.startsWith("/coach/bvf")) return "bvf";
  if (
    pathname.startsWith("/textbook") ||
    pathname.startsWith("/national-library") ||
    pathname.startsWith("/ai-generator") ||
    pathname.startsWith("/method-guidelines")
  ) {
    return "bvf";
  }
  if (
    pathname.startsWith("/coach/club") ||
    pathname.startsWith("/coach/teams") ||
    pathname.startsWith("/coach/fees") ||
    pathname.startsWith("/coach/athletes") ||
    pathname.startsWith("/coach/assessment") ||
    pathname.startsWith("/coach/group-work") ||
    pathname.startsWith("/coach/program-week") ||
    pathname.startsWith("/coach/enrollments") ||
    pathname.startsWith("/coach/competitions") ||
    pathname.startsWith("/coach/club-profile") ||
    pathname.startsWith("/coach/trainings")
  ) {
    return "club";
  }
  if (
    pathname.startsWith("/teams") ||
    pathname.startsWith("/monthly-fees") ||
    pathname.startsWith("/my-trainings") ||
    pathname.startsWith("/trainings") ||
    pathname.startsWith("/club-head")
  ) {
    return "club";
  }
  if (pathname === "/coach/attendance" || pathname.includes("/attendance-month")) return "club";
  if (pathname.startsWith("/coach/schedule") || pathname === "/teams/schedule") return "schedule";
  if (pathname.startsWith("/coach/menu")) return "more";
  if (
    pathname.startsWith("/articles") ||
    pathname.startsWith("/forum") ||
    pathname.startsWith("/drills") ||
    pathname.startsWith("/my-drills")
  ) {
    return "more";
  }
  if (pathname.startsWith("/coach/today") || pathname === "/coach") return "today";
  return null;
}

export function coachMobileTabById(id) {
  return COACH_MOBILE_TABS.find((t) => t.id === id) || null;
}
