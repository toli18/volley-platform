import { Navigate } from "react-router-dom";
import { isAuthenticated, isFederationAdmin, isAdmin, isCoach } from "../utils/auth";

export default function ProtectedRoute({ children, requireRole = null }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Admin role check (federation_admin is the admin role in this system)
  if ((requireRole === "federation_admin" || requireRole === "admin") && !isFederationAdmin() && !isAdmin()) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole === "coach" && !isCoach()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

