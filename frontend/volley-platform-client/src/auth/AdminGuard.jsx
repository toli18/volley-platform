// src/auth/AdminGuard.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isAdmin } from "../utils/auth";

export default function AdminGuard() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 16 }}>Проверка на достъп…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin()) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Нямаш права за достъп</h2>
        <p>Тази секция е само за администратори.</p>
      </div>
    );
  }

  // ✅ Това е ключът: пуска child routes да се рендерират
  return <Outlet />;
}
