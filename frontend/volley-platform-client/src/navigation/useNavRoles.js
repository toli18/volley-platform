import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";

export function normalizeRole(user) {
  const r = user?.role;
  if (r == null) return "";
  if (typeof r === "object" && r !== null && "value" in r) return String(r.value).toLowerCase();
  return String(r).toLowerCase();
}

export default function useNavRoles() {
  const { user, isAdmin, logout } = useAuth();
  const userRoleNorm = useMemo(() => normalizeRole(user), [user]);

  const isCoachUser = userRoleNorm === "coach" || userRoleNorm === "club_head_coach";
  const isHeadCoachUser = userRoleNorm === "club_head_coach";
  const isPlatformAdmin = user?.role === "platform_admin";
  const isAdminUser = Boolean(isAdmin);

  return {
    user,
    userRoleNorm,
    isCoachUser,
    isHeadCoachUser,
    isPlatformAdmin,
    isAdminUser,
    logout,
  };
}
