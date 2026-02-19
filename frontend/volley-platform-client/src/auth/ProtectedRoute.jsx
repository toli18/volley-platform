// src/auth/ProtectedRoute.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isCoach, isAdmin } from "../utils/auth";

export default function ProtectedRoute({ allowRoles }) {
  const { user, loading } = useAuth();

  // Докато се зарежда auth-а
  if (loading) return null; // може и loader

  // Ако не е логнат
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Проверка на роли
  if (allowRoles && allowRoles.length > 0) {
    const userRole = user.role;

    const hasAccess = allowRoles.some((role) => {
      if (role === "coach") return isCoach();
      if (role === "federation_admin" || role === "platform_admin") return isAdmin();
      return userRole === role;
    });

    if (!hasAccess) {
      return <Navigate to="/" replace />;
    }
  }

  // 👇 ВАЖНО: при nested routes се връща Outlet
  return <Outlet />;
}
