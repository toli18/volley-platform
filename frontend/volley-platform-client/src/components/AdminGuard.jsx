import { Navigate } from "react-router-dom";
import { getRole } from "../utils/auth";

export default function AdminGuard({ children }) {
  const role = getRole();
  if (role !== "platform_admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}
