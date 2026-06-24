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
      { id: "assessment", label: "Диагностика", to: "/coach/assessment", icon: "check" },
      { id: "scouting", label: "Скаут таблица", to: "/coach/assessment/scouting", icon: "teams" },
      { id: "battery", label: "Тестова батерия", to: "/coach/assessment/battery", icon: "book" },
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
  { type: "link", id: "chat", label: "Чат", to: "/chat", icon: "chat" },
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
    items: [{ id: "admin-home", label: "Админ табло", to: "/admin", icon: "home" }],
  },
  {
    id: "federation",
    label: "Федерация",
    items: [
      { id: "admin-federation", label: "Федеративно табло", to: "/admin/federation", icon: "shield" },
      { id: "admin-national-norms", label: "Национални норми", to: "/admin/national-norms", icon: "check" },
      { id: "admin-battery", label: "Тестова батерия", to: "/admin/assessment-battery", icon: "calendar" },
    ],
  },
  {
    // Ежедневната работа — одобряване. Брояч на чакащите се показва на групата.
    id: "moderation",
    label: "Модерация",
    showPendingBadge: true,
    items: [
      { id: "admin-pending", label: "Чакащи упражнения", to: "/admin/pending", icon: "tasks" },
      { id: "admin-articles-pending", label: "Чакащи статии", to: "/admin/articles/pending", icon: "tasks", roles: ["platform_admin"] },
    ],
  },
  {
    id: "content",
    label: "Съдържание",
    items: [
      { id: "admin-drills", label: "Всички упражнения", to: "/admin/drills", icon: "drill" },
      { id: "admin-articles", label: "Всички статии", to: "/admin/articles", icon: "article", roles: ["platform_admin"] },
      { id: "admin-bvf", label: "Библиотека БФВ", to: "/admin/national-library", icon: "book" },
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
];

/** @type {{ id: string, path: string, label: string, icon: string }[]} */
export const COACH_MOBILE_TABS = [
  { id: "today", path: "/coach/today", label: "Днес", icon: "home" },
  { id: "club", path: "/coach/club", label: "Клуб", icon: "teams" },
  { id: "chat", path: "/coach/chat", label: "Чат", icon: "chat" },
  { id: "schedule", path: "/coach/schedule", label: "График", icon: "calendar" },
  { id: "bvf", path: "/coach/bvf", label: "БФВ", icon: "book" },
  { id: "more", path: "/coach/menu", label: "Още", icon: "menu" },
];

/** @type {NavLinkItem[]} */
export const COACH_CLUB_HUB_LINKS = [
  { id: "teams", label: "Отбори", to: "/coach/teams", icon: "teams", hint: "Списък и детайли" },
  { id: "schedule", label: "Месечен график", to: "/coach/schedule", icon: "calendar", hint: "Календар на тренировки" },
  { id: "fees", label: "Месечни такси", to: "/coach/fees", icon: "fees" },
  { id: "trainings", label: "Моите тренировки", to: "/coach/trainings", icon: "training", hint: "Списък и нова тренировка" },
  { id: "attendance", label: "Присъствие", to: "/coach/attendance", icon: "check", hint: "По отбори" },
  { id: "assessment", label: "Диагностика", to: "/coach/assessment", icon: "check", hint: "Сесии и развитие" },
  { id: "scouting", label: "Скаут таблица", to: "/coach/assessment/scouting", icon: "teams", hint: "Деца × тестове · сравнения" },
  { id: "battery", label: "Тестова батерия", to: "/coach/assessment/battery", icon: "book", hint: "Каталог с протоколи" },
  { id: "club-head", label: "Клубен преглед", to: "/club-head", icon: "shield", headCoachOnly: true, hint: "Главен треньор" },
];

/** @type {NavLinkItem[]} */
export const COACH_BVF_HUB_LINKS = [
  { id: "textbook", label: "Учебник БФВ", to: "/textbook", icon: "book", hint: "Методика и конспекти" },
  { id: "national-library", label: "Годишна програма", to: "/national-library", icon: "calendar", hint: "Мезоцикли и планиране" },
  { id: "ai", label: "AI Помощник", to: "/ai-generator", icon: "sparkles", hint: "Генериране на тренировки", accent: true },
];

/** @type {NavLinkItem[]} */
export const COACH_MORE_QUICK_LINKS = [
  { id: "forum", label: "Форум", to: "/forum", icon: "chat" },
  { id: "ai", label: "AI", to: "/ai-generator", icon: "sparkles", accent: true },
  { id: "coach-board", label: "Дъска", to: "/coach-board", icon: "training" },
];

/** @type {{ title: string, links: NavLinkItem[] }[]} */
export const COACH_MORE_MENU_SECTIONS = [
  {
    title: "Съдържание",
    links: [
      { id: "articles", label: "Статии", to: "/articles", icon: "article" },
      { id: "my-articles", label: "Моите статии", to: "/articles/my", icon: "article" },
      { id: "forum", label: "Форум", to: "/forum", icon: "chat" },
      { id: "drills", label: "Упражнения", to: "/drills", icon: "drill" },
      { id: "my-drills", label: "Моите упражнения", to: "/my-drills", icon: "drill" },
    ],
  },
  {
    title: "Инструменти",
    links: [{ id: "coach-board", label: "Тактическа дъска", to: "/coach-board", icon: "training", accent: true }],
  },
  {
    title: "Друго",
    links: [{ id: "desktop-home", label: "Пълен dashboard", to: "/", icon: "home", hint: "Класическо начало (десктоп)" }],
  },
];
