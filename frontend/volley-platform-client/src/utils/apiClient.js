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

/** Mirrors utils/auth clearAuth — kept inline to avoid circular imports (auth.js re-exports apiClient). */
function clearAuthStorage() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
}

// attach token
axiosInstance.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const reqUrl = String(error?.config?.url || "");
    const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
    const isAuthLoginCall = reqUrl.includes("/auth/login");
    if (
      status === 401 &&
      getStoredToken() &&
      !isAuthLoginCall &&
      path !== "/login" &&
      typeof window !== "undefined"
    ) {
      clearAuthStorage();
      window.location.replace("/login?session=expired");
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
