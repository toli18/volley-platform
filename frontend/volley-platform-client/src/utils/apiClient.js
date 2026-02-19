// src/utils/apiClient.js
import axiosLib from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const axiosInstance = axiosLib.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// legacy alias
export const axios = axiosInstance;

// attach token
axiosInstance.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("access_token") || localStorage.getItem("token");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
