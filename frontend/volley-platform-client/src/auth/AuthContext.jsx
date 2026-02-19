// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import axiosInstance from "../utils/apiClient";
import {
  clearAuth,
  getToken,
  getUser,
  isAdmin as checkIsAdmin,
  isAuthenticated as checkIsAuthenticated,
  setToken,
  setUser,
} from "../utils/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUserState] = useState(() => getUser());
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const token = getToken();
    if (!token) {
      setUserState(null);
      setLoading(false);
      return null;
    }

    try {
      const res = await axiosInstance.get("/auth/me");
      const me = res.data;
      setUser(me);
      setUserState(me);
      return me;
    } catch (e) {
      clearAuth();
      setUserState(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ✅ IMPORTANT: backend expects { email, password }
  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await axiosInstance.post("/auth/login", { email, password });

      const token = res.data?.access_token || res.data?.token;
      if (!token) {
        throw new Error("Login response missing token");
      }

      setToken(token);

      // fetch profile
      const meRes = await axiosInstance.get("/auth/me");
      const me = meRes.data;

      setUser(me);
      setUserState(me);

      return me;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
    setUserState(null);
  };

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => {
    return {
      user,
      loading,
      token: getToken(),
      isAuthenticated: checkIsAuthenticated(),
      isAdmin: checkIsAdmin(),
      login,
      logout,
      refreshMe,
      setUser: (u) => {
        setUser(u);
        setUserState(u);
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
