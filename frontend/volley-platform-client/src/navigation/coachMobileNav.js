import { COACH_MOBILE_TABS } from "./navConfig";

export function coachMobileActiveTab(pathname) {
  if (pathname.startsWith("/coach/bvf")) return "bvf";
  if (
    pathname.startsWith("/coach/club") ||
    pathname.startsWith("/coach/teams") ||
    pathname.startsWith("/coach/fees") ||
    pathname.startsWith("/coach/athletes/") ||
    pathname.startsWith("/coach/trainings")
  ) {
    return "club";
  }
  if (pathname === "/coach/attendance" || pathname.includes("/attendance-month")) return "club";
  if (pathname.startsWith("/coach/schedule")) return "schedule";
  if (pathname.startsWith("/coach/menu")) return "more";
  if (pathname.startsWith("/coach/today") || pathname === "/coach") return "today";
  return null;
}

export function coachMobileTabById(id) {
  return COACH_MOBILE_TABS.find((t) => t.id === id) || null;
}
