import { useLocation } from "react-router-dom";

import useMediaQuery from "../utils/useMediaQuery";

export function isCoachShellPath(pathname) {
  return pathname === "/coach" || pathname.startsWith("/coach/");
}

export default function useIsCoachMobileShell() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { pathname } = useLocation();
  return isMobile && isCoachShellPath(pathname);
}
