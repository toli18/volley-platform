const PARENT_TOKEN_KEY = "parent_access_token";

export function getParentToken() {
  return localStorage.getItem(PARENT_TOKEN_KEY);
}

export function setParentToken(token) {
  if (token) localStorage.setItem(PARENT_TOKEN_KEY, token);
  else localStorage.removeItem(PARENT_TOKEN_KEY);
}

export function clearParentToken() {
  localStorage.removeItem(PARENT_TOKEN_KEY);
}

export function parentLoginPath() {
  return "/parent/login";
}

export function parentPortalPath() {
  return "/parent/portal";
}

export function parentLoginUrl() {
  if (typeof window === "undefined") return parentLoginPath();
  return `${window.location.origin}${parentLoginPath()}`;
}
