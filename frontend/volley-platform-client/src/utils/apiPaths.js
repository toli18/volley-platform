// src/utils/apiPaths.js
export const API_PATHS = {
  // Clubs
  CLUBS_LIST: "/clubs/clubs/",
  CLUBS_CREATE: "/clubs/clubs/",
  CLUB_UPDATE: (id) => `/clubs/clubs/${id}`,
  CLUB_DELETE: (id) => `/clubs/clubs/${id}`,
  CLUB_TOGGLE_ACCESS: (id) => `/clubs/clubs/${id}/toggle-access`,

  // Users / Coaches
  COACHES_LIST: "/users/users/coaches",
  COACH_GET: (id) => `/users/users/coaches/${id}`,
  COACH_CREATE: "/users/users/create-coach",
  COACH_UPDATE: (id) => `/users/users/coaches/${id}`,
  COACH_DELETE: (id) => `/users/users/coaches/${id}`,
  CLUB_HEAD_COACH_ASSIGN: (clubId) => `/users/users/clubs/${clubId}/head-coach`,

  // Drills (public lists)
  DRILLS_LIST: "/drills",
  DRILLS_LIST_ALIAS: "/drills/drills",

  // Coach
  DRILLS_MY: "/drills/my",
  DRILLS_MY_ALIAS: "/drills/drills/my",

  // Admin - pending
  DRILLS_PENDING: "/drills/drills/admin/pending",
  DRILLS_PENDING_ALIAS: "/drills/admin/pending",

  // Admin - decision
  DRILL_DECISION: (id) => `/drills/admin/${id}/decision`,
  DRILL_DECISION_ALIAS: (id) => `/drills/drills/admin/${id}/decision`,

  // Single drill (GET)
  DRILL_GET: (id) => `/drills/${id}`,
  DRILL_GET_ALIAS: (id) => `/drills/drills/${id}`,

  // Admin update/delete
  DRILL_UPDATE: (id) => `/drills/${id}`,
  DRILL_DELETE: (id) => `/drills/${id}`,

  // ✅ Trainings (Swagger: POST /trainings/)
  TRAININGS_CREATE: "/trainings/",
  TRAININGS_LIST_MY: "/trainings/my", // ако имаш такъв endpoint – ако не, махни

  // AI training generator
  AI_TRAINING_GENERATE: "/api/ai/training/generate",
  AI_TRAINING_GENERATE_AND_SAVE: "/api/ai/training/generate-and-save",

  // Articles
  ARTICLES_LIST: "/api/articles",
  ARTICLE_MINE: "/api/articles/mine",
  ARTICLE_GET: (id) => `/api/articles/${id}`,
  ARTICLE_CREATE: "/api/articles",
  ARTICLE_UPDATE: (id) => `/api/articles/${id}`,
  ARTICLE_MEDIA_UPLOAD: (id) => `/api/articles/${id}/media`,
  ARTICLE_MEDIA_DELETE: (id, mediaId) => `/api/articles/${id}/media/${mediaId}`,
  ARTICLE_LINK_CREATE: (id) => `/api/articles/${id}/links`,
  ARTICLE_LINK_DELETE: (id, linkId) => `/api/articles/${id}/links/${linkId}`,

  ADMIN_ARTICLES_LIST: "/api/admin/articles",
  ADMIN_ARTICLES_LIST_ALL: "/api/admin/articles",
  ADMIN_ARTICLE_APPROVE: (id) => `/api/admin/articles/${id}/approve`,
  ADMIN_ARTICLE_REJECT: (id) => `/api/admin/articles/${id}/reject`,
  ADMIN_ARTICLE_NEEDS_EDIT: (id) => `/api/admin/articles/${id}/needs-edit`,
  ADMIN_ARTICLE_UPDATE: (id) => `/api/admin/articles/${id}`,
  ADMIN_ARTICLE_DELETE: (id) => `/api/admin/articles/${id}`,
  ADMIN_ANALYTICS_OVERVIEW: "/api/admin/analytics/overview",

  // Forum
  FORUM_POSTS_LIST: "/api/forum/posts",
  FORUM_POST_CREATE: "/api/forum/posts",
  FORUM_POST_GET: (id) => `/api/forum/posts/${id}`,
  FORUM_POST_UPDATE: (id) => `/api/forum/posts/${id}`,
  FORUM_POST_DELETE: (id) => `/api/forum/posts/${id}`,
  FORUM_POST_MODERATION: (id) => `/api/forum/posts/${id}/moderation`,
  FORUM_POST_MEDIA_UPLOAD: (id) => `/api/forum/posts/${id}/media`,
  FORUM_POST_MEDIA_DELETE: (id, mediaId) => `/api/forum/posts/${id}/media/${mediaId}`,
  FORUM_POST_FOLLOW: (id) => `/api/forum/posts/${id}/follow`,
  FORUM_CATEGORIES: "/api/forum/categories",
  FORUM_TAGS: "/api/forum/tags",
  FORUM_NOTIFICATIONS: "/api/forum/notifications",
  FORUM_NOTIFICATION_READ: (notificationId) => `/api/forum/notifications/${notificationId}/read`,
  FORUM_NOTIFICATIONS_READ_ALL: "/api/forum/notifications/read-all",
  FORUM_REPLY_CREATE: (postId) => `/api/forum/posts/${postId}/replies`,
  FORUM_REPLY_UPDATE: (postId, replyId) => `/api/forum/posts/${postId}/replies/${replyId}`,
  FORUM_REPLY_DELETE: (postId, replyId) => `/api/forum/posts/${postId}/replies/${replyId}`,

  // Monthly fees
  FEES_ATHLETES_LIST: "/api/fees/athletes",
  FEES_ATHLETE_CREATE: "/api/fees/athletes",
  FEES_ATHLETES_IMPORT: "/api/fees/athletes/import",
  FEES_ATHLETES_IMPORT_TEMPLATE: "/api/fees/athletes/import-template",
  FEES_COACHES_LIST: "/api/fees/coaches",
  FEES_ATHLETE_UPDATE: (athleteId) => `/api/fees/athletes/${athleteId}`,
  FEES_ATHLETE_DELETE: (athleteId) => `/api/fees/athletes/${athleteId}`,
  FEES_ATHLETE_TRANSFER: (athleteId) => `/api/fees/athletes/${athleteId}/transfer`,
  FEES_PAYMENT_SAVE: (athleteId) => `/api/fees/athletes/${athleteId}/payments`,
  FEES_ATHLETE_REPORT: (athleteId) => `/api/fees/athletes/${athleteId}/payments`,
  FEES_PERIOD_REPORT: "/api/fees/reports/period",
  FEES_PAYMENT_RECEIPT: (paymentId) => `/api/fees/payments/${paymentId}/receipt.pdf`,
  FEES_PAYMENT_ACTIVITY: "/api/fees/payments/activity",

  // Teams
  TEAMS_LIST: "/api/teams",
  TEAM_CREATE: "/api/teams",
  TEAM_UPDATE: (teamId) => `/api/teams/${teamId}`,
  TEAM_DELETE: (teamId) => `/api/teams/${teamId}`,
  TEAM_MEMBERS_GET: (teamId) => `/api/teams/${teamId}/members`,
  TEAM_MEMBERS_SET: (teamId) => `/api/teams/${teamId}/members`,
  TEAM_ATTENDANCE_GET: (teamId) => `/api/teams/${teamId}/attendance`,
  TEAM_ATTENDANCE_SAVE: (teamId) => `/api/teams/${teamId}/attendance`,
  TEAM_ATTENDANCE_REPORT: (teamId) => `/api/teams/${teamId}/attendance/report`,
  TEAM_ATHLETE_PROFILE: (athleteId) => `/api/teams/athletes/${athleteId}/profile`,

  // Club head coach
  CLUB_OVERVIEW: "/api/club/overview",
  CLUB_ATHLETES: "/api/club/athletes",
  CLUB_FEES_SUMMARY: "/api/club/fees/summary",
  CLUB_ATTENDANCE_SUMMARY: "/api/club/attendance/summary",
  CLUB_TRAININGS: "/api/club/trainings",

  // Training assignments
  CLUB_TRAINING_ASSIGNMENTS_LIST: "/api/club/training-assignments",
  CLUB_TRAINING_ASSIGNMENTS_CREATE: "/api/club/training-assignments",
  MY_TRAINING_ASSIGNMENTS: "/api/trainings/assignments/my",
  TRAINING_ASSIGNMENT_UPDATE: (assignmentId) => `/api/trainings/assignments/${assignmentId}`,
};
