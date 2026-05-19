// src/utils/apiClient.js
import axiosLib from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const axiosInstance = axiosLib.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// legacy alias
export const axios = axiosInstance;

function getStoredToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    null
  );
}

function getParentSessionToken() {
  return localStorage.getItem("parent_access_token");
}

/** Mirrors utils/auth clearAuth — kept inline to avoid circular imports (auth.js re-exports apiClient). */
function clearAuthStorage() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
}

// attach token
axiosInstance.interceptors.request.use((config) => {
  const url = String(config.url || "");
  config.headers = config.headers || {};

  if (url.includes("/parent-portal/me")) {
    const parentToken = getParentSessionToken();
    if (parentToken) config.headers.Authorization = `Bearer ${parentToken}`;
    return config;
  }

  if (url.includes("/parent-auth/") || /\/parent-portal\/[^/]+/.test(url)) {
    return config;
  }

  const coachToken = getStoredToken();
  if (coachToken) config.headers.Authorization = `Bearer ${coachToken}`;
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const reqUrl = String(error?.config?.url || "");
    const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
    const isAuthLoginCall = reqUrl.includes("/auth/login");
    const isParentSessionCall = reqUrl.includes("/parent-portal/me");
    const isParentPublicPath = path.startsWith("/parent");
    if (status === 401 && typeof window !== "undefined") {
      if (isParentSessionCall || (isParentPublicPath && getParentSessionToken())) {
        localStorage.removeItem("parent_access_token");
        if (path !== "/parent/login") {
          window.location.replace("/parent/login?session=expired");
        }
      } else if (getStoredToken() && !isAuthLoginCall && path !== "/login") {
        clearAuthStorage();
        window.location.replace("/login?session=expired");
      }
    }
    return Promise.reject(error);
  }
);

export const apiClient = async (path, options = {}) => {
  const method = (options.method || "GET").toUpperCase();
  const res = await axiosInstance.request({
    url: path,
    method,
    params: options.params,
    data: options.data,
    headers: options.headers,
  });
  return res.data;
};

// legacy alias expected in some places
export const apiJson = apiClient;

export default axiosInstance;
