/**
 * Single source of truth for app navigation (desktop flyouts, mobile drawer, future coach tabs).
 * Filter children with `roles` / `headCoachOnly` at runtime via useNavItems.
 */

/** @typedef {{ id: string, label: string, to: string, icon?: string, hint?: string, roles?: string[], headCoachOnly?: boolean, assignedCardIndexOnly?: boolean, monthlyFeesOnly?: boolean, accent?: boolean }} NavLinkItem */
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
    label: "Клуб & Групи",
    icon: "teams",
    children: [
      { id: "teams", label: "Групи", to: "/coach/teams", icon: "teams", hint: "Тренировъчни групи и състав" },
      { id: "athletes", label: "Състезатели", to: "/coach/athletes", icon: "clipboardCheck", hint: "Профили, СЕК · записвания онлайн" },
      {
        id: "fees",
        label: "Такси",
        to: "/coach/fees",
        icon: "euro",
        hint: "Плащания и напомняния",
        monthlyFeesOnly: true,
      },
      { id: "competitions", label: "Състезания", to: "/coach/competitions", icon: "target", hint: "Мачове, тимов лист, филтри" },
      { id: "schedule", label: "График", to: "/coach/schedule", icon: "calendar", hint: "Месечен календар на тренировки" },
      {
        id: "group-work",
        label: "Работа с групата",
        to: "/coach/group-work",
        icon: "clipboardCheck",
        hint: "Програмна седмица, присъствие, тестирания",
      },
      {
        id: "club-admin",
        label: "Клуб",
        to: "/coach/club-admin",
        icon: "shield",
        headCoachOnly: true,
        hint: "Профил, администрация БФВ и картотека",
      },
      {
        id: "bvf-card-indexes",
        label: "Картотечни отбори",
        to: "/coach/bvf-card-indexes",
        icon: "shield",
        hint: "Сезон × възраст · състав",
        // Видим само за треньор с назначени картотечни отбори в отворен сезон.
        // Главният ползва бутона в „Клуб“.
        assignedCardIndexOnly: true,
      },
    ],
  },
  {
    type: "group",
    id: "learning",
    label: "Обучение & Ресурси",
    icon: "book",
    children: [
      { id: "learning-hub", label: "Обучение", to: "/coach/learning", icon: "book", hint: "Учебник, програма, упражнения" },
      { id: "my-content", label: "Моето съдържание", to: "/coach/my-content", icon: "drill", hint: "Моите упражнения и статии" },
      { id: "ai", label: "AI Помощник", to: "/ai-generator", icon: "sparkles", accent: true, hint: "Генериране на тренировки" },
      { id: "articles", label: "Статии", to: "/articles", icon: "article", hint: "Библиотека със статии" },
    ],
  },
  { type: "link", id: "ai", label: "AI", to: "/ai-generator", icon: "sparkles", accent: true },
  { type: "link", id: "chat", label: "Чат", to: "/chat", icon: "chat" },
  { type: "link", id: "forum", label: "Форум", to: "/forum", icon: "forum", badge: "forumUnread" },
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
      { id: "admin-battery", label: "Тестова батерия", to: "/admin/assessment-battery", icon: "stopwatch" },
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
  { id: "teams", label: "Групи", to: "/coach/teams", icon: "teams", hint: "Тренировъчни групи и състав" },
  { id: "athletes", label: "Състезатели", to: "/coach/athletes", icon: "clipboardCheck", hint: "Профили, СЕК · записвания онлайн" },
  {
    id: "fees",
    label: "Такси",
    to: "/coach/fees",
    icon: "euro",
    hint: "Плащания и напомняния",
    monthlyFeesOnly: true,
  },
  { id: "competitions", label: "Състезания", to: "/coach/competitions", icon: "target", hint: "Мачове, тимов лист, филтри" },
  { id: "schedule", label: "График", to: "/coach/schedule", icon: "calendar", hint: "Месечен календар на тренировки" },
  {
    id: "group-work",
    label: "Работа с групата",
    to: "/coach/group-work",
    icon: "clipboardCheck",
    hint: "Програмна седмица, присъствие, тестирания",
  },
  {
    id: "club-admin",
    label: "Клуб",
    to: "/coach/club-admin",
    icon: "shield",
    headCoachOnly: true,
    hint: "Профил, администрация БФВ и картотека",
  },
  {
    id: "bvf-card-indexes",
    label: "Картотечни отбори",
    to: "/coach/bvf-card-indexes",
    icon: "shield",
    hint: "Сезон × възраст · състав",
    assignedCardIndexOnly: true,
  },
];

/** @type {NavLinkItem[]} */
export const COACH_CLUB_ADMIN_HUB_LINKS = [
  {
    id: "club-profile",
    label: "Профил на клуба",
    to: "/coach/club-profile",
    icon: "shield",
    hint: "Контакти, зали, записване, треньори",
  },
  {
    id: "bvf-admin",
    label: "Администрация БФВ",
    to: "/coach/bvf-admin",
    icon: "shield",
    hint: "Връзка със СЕК, импорт и заявление",
  },
  {
    id: "club-head",
    label: "Клубен преглед",
    to: "/club-head",
    icon: "shield",
    hint: "Обзор, присъствие и методика",
  },
  {
    id: "bvf-card-indexes",
    label: "Картотечни отбори",
    to: "/coach/bvf-card-indexes",
    icon: "shield",
    hint: "Сезон × възраст · Форма 03 · състав",
  },
];

/** @type {NavLinkItem[]} */
export const COACH_GROUP_WORK_HUB_LINKS = [
  {
    id: "program-week",
    label: "Програмна седмица",
    to: "/coach/program-week",
    icon: "target",
    hint: "Текуща позиция, теми и тренировки",
  },
  {
    id: "attendance",
    label: "Присъствие",
    to: "/coach/attendance",
    icon: "clipboardCheck",
    hint: "По групи и месечен преглед",
  },
  {
    id: "testing",
    label: "Тестирания",
    to: "/coach/assessment",
    icon: "chart",
    hint: "Диагностика, скаут и тестова батерия",
  },
];

/** @type {NavLinkItem[]} */
export const COACH_TESTING_HUB_LINKS = [
  {
    id: "assessment-session",
    label: "Диагностика",
    to: "/coach/assessment/session",
    icon: "chart",
    hint: "Сесии, въвеждане на резултати и развитие",
  },
  {
    id: "scouting",
    label: "Скаут таблица",
    to: "/coach/assessment/scouting",
    icon: "table",
    hint: "Деца × тестове · сравнения",
  },
  {
    id: "battery",
    label: "Тестова батерия",
    to: "/coach/assessment/battery",
    icon: "stopwatch",
    hint: "Каталог с протоколи",
  },
];

/** @type {NavLinkItem[]} */
export const COACH_LEARNING_HUB_LINKS = [
  { id: "textbook", label: "Учебник БФВ", to: "/textbook", icon: "book", hint: "Методика и конспекти" },
  { id: "national-library", label: "Годишна програма", to: "/national-library", icon: "layers", hint: "Мезоцикли и планиране" },
  { id: "drills", label: "Упражнения", to: "/drills", icon: "drill", hint: "Каталог с упражнения" },
  {
    id: "club-method",
    label: "Методика БФВ (клуб)",
    to: "/club-head?tab=method",
    icon: "shield",
    headCoachOnly: true,
    hint: "Цикли и задачи към треньорите",
  },
];

/** @type {NavLinkItem[]} */
export const COACH_MY_CONTENT_HUB_LINKS = [
  { id: "my-drills", label: "Моите упражнения", to: "/my-drills", icon: "drill", hint: "Лични и чернови упражнения" },
  { id: "my-articles", label: "Моите статии", to: "/articles/my", icon: "article", hint: "Лични статии" },
];

/** @type {NavLinkItem[]} */
export const COACH_BVF_HUB_LINKS = [
  { id: "learning-hub", label: "Обучение", to: "/coach/learning", icon: "book", hint: "Учебник, програма, упражнения" },
  { id: "my-content", label: "Моето съдържание", to: "/coach/my-content", icon: "drill", hint: "Моите упражнения и статии" },
  {
    id: "bvf-admin",
    label: "Администрация БФВ",
    to: "/coach/bvf-admin",
    icon: "shield",
    headCoachOnly: true,
    hint: "Свързване на клуб и селективен импорт на състезатели",
  },
  {
    id: "club-head",
    label: "Клубен преглед",
    to: "/club-head",
    icon: "shield",
    headCoachOnly: true,
    hint: "Обзор, присъствие и методика на клуба",
  },
  {
    id: "bvf-card-indexes",
    label: "Картотечни отбори",
    to: "/coach/bvf-card-indexes",
    icon: "shield",
    hint: "Сезон × възраст · Форма 03 · заявка към главния",
    assignedCardIndexOnly: true,
  },
  { id: "ai", label: "AI Помощник", to: "/ai-generator", icon: "sparkles", hint: "Генериране на тренировки", accent: true },
];

/** @type {NavLinkItem[]} */
export const COACH_MORE_QUICK_LINKS = [
  { id: "forum", label: "Форум", to: "/forum", icon: "forum" },
  { id: "ai", label: "AI", to: "/ai-generator", icon: "sparkles", accent: true },
  { id: "coach-board", label: "Дъска", to: "/coach-board", icon: "board" },
];

/** @type {{ title: string, links: NavLinkItem[] }[]} */
export const COACH_MORE_MENU_SECTIONS = [
  {
    title: "Клуб",
    links: [
      { id: "competitions", label: "Състезания", to: "/coach/competitions", icon: "target", hint: "Мачове и тимов лист" },
      { id: "group-work", label: "Работа с групата", to: "/coach/group-work", icon: "clipboardCheck", hint: "Програма, присъствие, тестове" },
      { id: "schedule-more", label: "График", to: "/coach/schedule", icon: "calendar" },
    ],
  },
  {
    title: "Съдържание",
    links: [
      { id: "learning-hub", label: "Обучение", to: "/coach/learning", icon: "book" },
      { id: "my-content", label: "Моето съдържание", to: "/coach/my-content", icon: "drill" },
      { id: "articles", label: "Статии", to: "/articles", icon: "article" },
      { id: "forum", label: "Форум", to: "/forum", icon: "forum" },
    ],
  },
  {
    title: "Инструменти",
    links: [{ id: "coach-board", label: "Тактическа дъска", to: "/coach-board", icon: "board", accent: true }],
  },
  {
    title: "Друго",
    links: [{ id: "desktop-home", label: "Пълен dashboard", to: "/", icon: "home", hint: "Класическо начало (десктоп)" }],
  },
];
