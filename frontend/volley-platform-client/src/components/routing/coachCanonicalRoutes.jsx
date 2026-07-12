import { Navigate, useLocation } from "react-router-dom";

import useMediaQuery from "../../utils/useMediaQuery";

/** Coach mobile shell breakpoint — matches useIsCoachMobileShell. */
export const COACH_MOBILE_BREAKPOINT = "(max-width: 767px)";

/**
 * Permanent redirect that keeps query string (bookmarks, ?athlete_id=, etc.).
 */
export function RedirectPreserveSearch({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/**
 * On narrow viewports send coaches to the canonical /coach/* route.
 * On desktop render the legacy page unchanged.
 */
export function CoachMobileCanonicalRedirect({ to, children }) {
  const isMobile = useMediaQuery(COACH_MOBILE_BREAKPOINT);
  const { search } = useLocation();
  if (isMobile) {
    return <Navigate to={`${to}${search}`} replace />;
  }
  return children;
}
