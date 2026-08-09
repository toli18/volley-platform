const COACH_FOREIGN_PREFIXES = [
  "/articles",
  "/forum",
  "/drills",
  "/my-drills",
  "/ai-generator",
  "/textbook",
  "/national-library",
  "/my-trainings",
  "/trainings",
  "/teams",
  "/club-head",
  "/method-guidelines",
];

const FOREIGN_TITLES = [
  ["/articles/my", "Моите статии"],
  ["/articles/new", "Нова статия"],
  ["/articles", "Статии"],
  ["/forum", "Форум"],
  ["/my-drills", "Моите упражнения"],
  ["/drills/new", "Ново упражнение"],
  ["/drills", "Упражнения"],
  ["/ai-generator", "AI помощник"],
  ["/textbook", "Учебник БФВ"],
  ["/national-library", "Годишна програма"],
  ["/my-trainings", "Моите тренировки"],
  ["/teams", "Тренировъчни групи"],
  ["/club-head", "Клубен преглед"],
  ["/method-guidelines", "Методически насоки"],
];

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isCoachForeignChromePath(pathname, search = "") {
  if (!pathname || pathname.startsWith("/coach")) return false;
  if (pathname.startsWith("/admin") || pathname.startsWith("/parent") || pathname.startsWith("/room")) return false;
  if (pathname === "/login" || pathname === "/coach-board") return false;
  if (/^\/trainings\/\d+\/?$/.test(pathname) && new URLSearchParams(search).get("mode") === "field") return false;
  return COACH_FOREIGN_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function coachForeignPageTitle(pathname) {
  for (const [prefix, title] of FOREIGN_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "Volley Coach";
}

export function coachForeignBackTarget(pathname) {
  if (
    pathname.startsWith("/textbook") ||
    pathname.startsWith("/national-library") ||
    pathname.startsWith("/method-guidelines") ||
    pathname === "/drills" ||
    pathname.startsWith("/drills/")
  ) {
    return "/coach/learning";
  }
  if (pathname.startsWith("/my-drills") || pathname.startsWith("/articles/my")) {
    return "/coach/my-content";
  }
  if (pathname.startsWith("/ai-generator")) {
    return "/coach/bvf";
  }
  if (pathname.startsWith("/club-head")) {
    return "/coach/bvf";
  }
  if (
    pathname.startsWith("/teams") ||
    pathname.startsWith("/my-trainings") ||
    pathname.startsWith("/trainings")
  ) {
    return "/coach/club";
  }
  if (pathname.startsWith("/articles") || pathname.startsWith("/forum")) {
    return "/coach/menu";
  }
  return "/coach/today";
}
