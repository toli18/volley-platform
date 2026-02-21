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
};
