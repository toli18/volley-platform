import { useMemo } from "react";
import {
  ADMIN_NAV_SECTIONS,
  COACH_PRIMARY_NAV,
  GUEST_PRIMARY_NAV,
  MEMBER_EXTRA_NAV,
} from "./navConfig";
import useNavRoles from "./useNavRoles";

function filterChild(item, { isHeadCoachUser, isPlatformAdmin }) {
  if (item.headCoachOnly && !isHeadCoachUser) return false;
  if (item.roles?.length && !item.roles.includes(isPlatformAdmin ? "platform_admin" : "")) return false;
  return true;
}

function filterGroupChildren(children, ctx) {
  return (children || []).filter((c) => filterChild(c, ctx));
}

export default function useNavItems() {
  const { user, isCoachUser, isHeadCoachUser, isPlatformAdmin, isAdminUser } = useNavRoles();

  const primaryNav = useMemo(() => {
    if (!user) return GUEST_PRIMARY_NAV;

    if (isCoachUser) {
      return COACH_PRIMARY_NAV.map((item) => {
        if (item.type !== "group") return item;
        return { ...item, children: filterGroupChildren(item.children, { isHeadCoachUser, isPlatformAdmin }) };
      });
    }

    const links = [
      { type: "link", id: "drills", label: "Упражнения", to: "/drills", icon: "drill" },
      { type: "link", id: "forum", label: "Форум", to: "/forum", icon: "chat", badge: "forumUnread" },
      ...MEMBER_EXTRA_NAV.filter((x) => filterChild(x, { isHeadCoachUser, isPlatformAdmin })).map((x) => ({
        type: "link",
        ...x,
      })),
      { type: "link", id: "articles", label: "Статии", to: "/articles", icon: "article" },
      { type: "link", id: "generator", label: "Генератор", to: "/generator", icon: "sparkles" },
    ];
    return links;
  }, [user, isCoachUser, isHeadCoachUser, isPlatformAdmin]);

  const adminNavSections = useMemo(() => {
    if (!isAdminUser) return [];
    return ADMIN_NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => filterChild(item, { isHeadCoachUser, isPlatformAdmin: isPlatformAdmin })),
    })).filter((s) => s.items.length > 0);
  }, [isAdminUser, isHeadCoachUser, isPlatformAdmin]);

  return { primaryNav, adminNavSections };
}
