// src/utils/auth.js
// Central auth + role helpers + re-export of apiClient (for legacy imports)

import { apiClient } from "./apiClient";

const TOKEN_KEY = "access_token";
const LEGACY_TOKEN_KEY = "token";
const ROLE_KEY = "role";
const USER_KEY = "user";

/**
 * Re-export apiClient so pages can do:
 *   import { apiClient } from "../utils/auth";
 */
export { apiClient };

/**
 * Token helpers
 */
export const setToken = (token) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
};

export const getToken = () => {
  return (
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(LEGACY_TOKEN_KEY) ||
    null
  );
};

/**
 * Role helpers
 */
export const setRole = (role) => {
  if (!role) {
    localStorage.removeItem(ROLE_KEY);
    return;
  }
  localStorage.setItem(ROLE_KEY, role);
};

export const getRole = () => {
  return localStorage.getItem(ROLE_KEY) || null;
};

/**
 * User helpers
 */
export const setUser = (user) => {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Unified auth setter
 */
export const setAuth = (token, role = null, user = null) => {
  setToken(token);
  if (role) setRole(role);
  if (user) setUser(user);
};

/**
 * Clear auth
 */
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_KEY);
};

/**
 * Status helpers
 */
export const isAuthenticated = () => !!getToken();

/**
 * Internal: role resolve (robust across backend variants)
 */
const resolveRoleRaw = () => {
  const u = getUser();

  // support multiple possible backend fields
  const roleFromUser =
    u?.role ||
    u?.user_role ||
    u?.userRole ||
    u?.type ||
    u?.account_type ||
    null;

  return roleFromUser || getRole();
};

const normalizeRole = (role) => {
  if (!role) return "";
  return String(role).trim().toLowerCase().replace(/\s+/g, "_");
};

/**
 * Role checks
 */
export const isAdmin = () => {
  const role = normalizeRole(resolveRoleRaw());
  if (!role) return false;
  return role.includes("admin");
};

export const isFederationAdmin = () => {
  const role = normalizeRole(resolveRoleRaw());
  if (!role) return false;

  return (
    role.includes("federation_admin") ||
    role.includes("federationadmin") ||
    role === "federation" ||
    role.includes("federation")
  );
};

export const isCoach = () => {
  const role = normalizeRole(resolveRoleRaw());
  if (!role) return false;

  return (
    role === "coach" ||
    role.includes("coach") ||
    role === "trainer" ||
    role.includes("trainer") ||
    role.includes("coaching") ||
    role.includes("треньор")
  );
};
