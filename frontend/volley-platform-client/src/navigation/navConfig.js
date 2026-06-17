/**
 * Single source of truth for app navigation (desktop flyouts, mobile drawer, future coach tabs).
 * Filter children with `roles` / `headCoachOnly` at runtime via useNavItems.
 */

/** @typedef {{ id: string, label: string, to: string, icon?: string, hint?: string, roles?: string[], headCoachOnly?: boolean, accent?: boolean }} NavLinkItem */
/** @typedef {{ id: string, label: string, icon?: string, children: NavLinkItem[] }} NavGroupItem */
/** @typedef {{ type: "link", id: string, label: string, to: string, icon?: string, accent?: boolean, badge?: string }} NavPrimaryLink */
/** @typedef {{ type: "group", id: string, label: string, icon?: string, children: NavLinkItem[] }} NavPrimaryGroup */

/** @type {NavPrimaryLink[]} */
export const GUEST_PRIMARY_NAV = [
  { type: "link", id: "home", label: "Начало", to: "/", icon: "home" },
  { type: "link", id: "drills", label: "Упражнения", to: "/drills", icon: "drill" },
  { type: "link", id: "generator", label: "Генератор", to: "/generator", icon: "sparkles" },
];

/** @type {(NavPrimaryLink | NavPrimaryGroup)[]} */
export const COACH_PRIMARY_NAV = [
  { type: "link", id: "home", label: "Начало", to: "/", icon: "home" },
  {
    type: "group",
    id: "club",
    label: "Клуб & Отбори",
    icon: "teams",
    children: [
      { id: "teams", label: "Отбори", to: "/teams", icon: "teams" },
      { id: "schedule", label: "Месечен график", to: "/teams/schedule", icon: "calendar" },
      { id: "fees", label: "Месечни такси", to: "/monthly-fees", icon: "fees" },
      { id: "trainings", label: "Моите тренировки", to: "/my-trainings", icon: "training" },
      { id: "attendance", label: "Присъствие", to: "/coach/attendance", icon: "check" },
      {
        id: "club-head",
        label: "Клубен преглед",
        to: "/club-head",
        icon: "shield",
        headCoachOnly: true,
      },
    ],
  },
  {
    type: "group",
    id: "learning",
    label: "Обучение & Ресурси",
    icon: "book",
    children: [
      { id: "textbook", label: "Учебник БФВ", to: "/textbook", icon: "book" },
      { id: "national-library", label: "Годишна програма", to: "/national-library", icon: "calendar" },
      { id: "ai", label: "AI Помощник", to: "/ai-generator", icon: "sparkles", accent: true },
      { id: "articles", label: "Статии", to: "/articles", icon: "article" },
      { id: "drills", label: "Упражнения", to: "/drills", icon: "drill" },
      { id: "my-drills", label: "Моите упражнения", to: "/my-drills", icon: "drill" },
      { id: "my-articles", label: "Моите статии", to: "/articles/my", icon: "article" },
    ],
  },
  { type: "link", id: "ai", label: "AI", to: "/ai-generator", icon: "sparkles", accent: true },
  { type: "link", id: "forum", label: "Форум", to: "/forum", icon: "chat", badge: "forumUnread" },
];

/** @type {NavLinkItem[]} */
export const MEMBER_EXTRA_NAV = [
  { id: "club-head", label: "Главен треньор", to: "/club-head", icon: "shield", headCoachOnly: true },
];

/** @type {{ id: string, label: string, items: NavLinkItem[] }[]} */
export const ADMIN_NAV_SECTIONS = [
  {
    id: "overview",
    label: "Табло",
    items: [{ id: "admin-home", label: "Админ табло", to: "/admin", icon: "shield" }],
  },
  {
    id: "bvf",
    label: "БФВ",
    items: [{ id: "admin-bvf", label: "Библиотека БФВ", to: "/admin/national-library", icon: "book" }],
  },
  {
    id: "drills",
    label: "Упражнения",
    items: [
      { id: "admin-drills", label: "Всички упражнения", to: "/admin/drills", icon: "drill" },
      { id: "admin-pending", label: "Чакащи упражнения", to: "/admin/pending", icon: "check" },
    ],
  },
  {
    id: "org",
    label: "Организация",
    items: [
      { id: "admin-coaches", label: "Треньори", to: "/admin/coaches", icon: "teams" },
      { id: "admin-clubs", label: "Клубове", to: "/admin/clubs", icon: "shield" },
    ],
  },
  {
    id: "articles",
    label: "Статии",
    items: [
      { id: "admin-articles-pending", label: "Чакащи статии", to: "/admin/articles/pending", icon: "article", roles: ["platform_admin"] },
      { id: "admin-articles", label: "Всички статии", to: "/admin/articles", icon: "article", roles: ["platform_admin"] },
    ],
  },
];
