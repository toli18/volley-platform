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
  ARTICLE_RESUBMIT: (id) => `/api/articles/${id}/resubmit`,
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
  TEAM_ASSIGN_COACH: (teamId) => `/api/teams/${teamId}/assign-coach`,
  TEAM_DELETE: (teamId) => `/api/teams/${teamId}`,
  TEAM_MEMBERS_GET: (teamId) => `/api/teams/${teamId}/members`,
  TEAM_MEMBERS_SET: (teamId) => `/api/teams/${teamId}/members`,
  TEAM_ATTENDANCE_GET: (teamId) => `/api/teams/${teamId}/attendance`,
  TEAM_ATTENDANCE_SAVE: (teamId) => `/api/teams/${teamId}/attendance`,
  TEAM_ATTENDANCE_REPORT: (teamId) => `/api/teams/${teamId}/attendance/report`,
  TEAM_ATHLETE_PROFILE: (athleteId) => `/api/teams/athletes/${athleteId}/profile`,
  PARENT_AUTH_LOGIN: "/api/parent-auth/login",
  ATHLETE_ROOM_AUTH_LOGIN: "/api/athlete-room-auth/login",
  ATHLETE_ROOM_ME: "/api/athlete-room/me",
  ATHLETE_ROOM_ME_SCHEDULE: "/api/athlete-room/me/schedule",
  ATHLETE_ROOM_ACK_CHANGE_ME: "/api/athlete-room/me/ack-change",
  ATHLETE_ROOM_PUSH_VAPID: "/api/athlete-room/push/vapid-public-key",
  ATHLETE_ROOM_PUSH_STATUS_ME: "/api/athlete-room/me/push-status",
  ATHLETE_ROOM_PUSH_SUBSCRIBE_ME: "/api/athlete-room/me/push-subscription",
  ATHLETE_ROOM_PUSH_TEST_ME: "/api/athlete-room/me/push-test",
  PARENT_PORTAL_ME: "/api/parent-portal/me",
  PARENT_PORTAL_ME_SCHEDULE: "/api/parent-portal/me/schedule",
  PARENT_PORTAL_ACK_CHANGES_ME: "/api/parent-portal/me/ack-changes",
  PARENT_PORTAL_ACK_CHANGES_TOKEN: (token) => `/api/parent-portal/${token}/ack-changes`,
  PARENT_PORTAL_ACK_CHANGE_ME: "/api/parent-portal/me/ack-change",
  PARENT_PORTAL_ACK_CHANGE_TOKEN: (token) => `/api/parent-portal/${token}/ack-change`,
  FEES_REMIND_UNPAID: "/api/fees/remind-unpaid",
  PARENT_PUSH_VAPID: "/api/parent-portal/push/vapid-public-key",
  PARENT_PUSH_STATUS_ME: "/api/parent-portal/me/push-status",
  PARENT_PUSH_SUBSCRIBE_ME: "/api/parent-portal/me/push-subscription",
  PARENT_PUSH_TEST_ME: "/api/parent-portal/me/push-test",
  PARENT_PUSH_STATUS_TOKEN: (token) => `/api/parent-portal/${token}/push-status`,
  PARENT_PUSH_SUBSCRIBE_TOKEN: (token) => `/api/parent-portal/${token}/push-subscription`,
  PARENT_PUSH_TEST_TOKEN: (token) => `/api/parent-portal/${token}/push-test`,
  PARENT_PORTAL_GET: (token) => `/api/parent-portal/${token}`,
  PARENT_PORTAL_SCHEDULE: (token) => `/api/parent-portal/${token}/schedule`,

  TEAM_ACCESS_GET: (teamId) => `/api/teams/${teamId}/team-access`,
  TEAM_ACCESS_CREATE: (teamId) => `/api/teams/${teamId}/team-access`,
  TEAM_ACCESS_ROTATE: (teamId) => `/api/teams/${teamId}/team-access/rotate`,
  TEAM_ACCESS_REVOKE: (teamId) => `/api/teams/${teamId}/team-access`,
  TEAM_PORTAL_ITEMS_LIST: (teamId) => `/api/teams/${teamId}/team-portal/items`,
  TEAM_PORTAL_TEXT_CREATE: (teamId) => `/api/teams/${teamId}/team-portal/items/text`,
  TEAM_PORTAL_IMAGE_CREATE: (teamId) => `/api/teams/${teamId}/team-portal/items/image`,
  TEAM_PORTAL_ITEM_DELETE: (teamId, itemId) => `/api/teams/${teamId}/team-portal/items/${itemId}`,
  TEAM_PORTAL_GET: (token) => `/api/team-portal/${token}`,
  TEAM_PORTAL_SCHEDULE: (token) => `/api/team-portal/${token}/schedule`,

  // Club head coach
  CLUB_OVERVIEW: "/api/club/overview",
  CLUB_ATHLETES: "/api/club/athletes",
  CLUB_FEES_SUMMARY: "/api/club/fees/summary",
  CLUB_ATTENDANCE_SUMMARY: "/api/club/attendance/summary",
  CLUB_TRAININGS: "/api/club/trainings",
  CLUB_REPORT_FEES_XLSX: "/api/club/reports/fees.xlsx",
  CLUB_REPORT_FEES_PDF: "/api/club/reports/fees.pdf",
  CLUB_REPORT_ATTENDANCE_XLSX: "/api/club/reports/attendance.xlsx",
  CLUB_REPORT_ATTENDANCE_PDF: "/api/club/reports/attendance.pdf",

  // Training assignments
  CLUB_TRAINING_ASSIGNMENTS_LIST: "/api/club/training-assignments",
  CLUB_TRAINING_ASSIGNMENTS_CREATE: "/api/club/training-assignments",
  CLUB_TRAINING_ASSIGNMENTS_ACTIVITY: "/api/club/training-assignments/activity",
  MY_TRAINING_ASSIGNMENTS: "/api/trainings/assignments/my",
  TRAINING_ASSIGNMENT_UPDATE: (assignmentId) => `/api/trainings/assignments/${assignmentId}`,
  TRAINING_ASSIGNMENT_DELETE: (assignmentId) => `/api/trainings/assignments/${assignmentId}`,

  // Training schedule calendar
  SCHEDULE_OCCURRENCES: "/api/schedule",
  SCHEDULE_RULES_LIST: "/api/schedule/rules",
  SCHEDULE_RULES_CREATE: "/api/schedule/rules",
  SCHEDULE_RULE_UPDATE: (ruleId) => `/api/schedule/rules/${ruleId}`,
  SCHEDULE_RULE_DELETE: (ruleId) => `/api/schedule/rules/${ruleId}`,
  SCHEDULE_EXCEPTION_CREATE: (ruleId) => `/api/schedule/rules/${ruleId}/exceptions`,
  SCHEDULE_EXCEPTION_DELETE: (exceptionId) => `/api/schedule/exceptions/${exceptionId}`,
  SCHEDULE_COMPETITIONS_LIST: "/api/schedule/competitions",
  SCHEDULE_COMPETITION_CREATE: "/api/schedule/competitions",
  SCHEDULE_COMPETITION_UPDATE: (eventId) => `/api/schedule/competitions/${eventId}`,
  SCHEDULE_COMPETITION_DELETE: (eventId) => `/api/schedule/competitions/${eventId}`,
};
