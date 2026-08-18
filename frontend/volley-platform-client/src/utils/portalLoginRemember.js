const STORAGE_PREFIX = "vp_login_remember_";

export function loadRememberedLogin(kind) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${kind}`);
    if (!raw) return { remember: false, phone: "", birthYear: "" };
    const data = JSON.parse(raw);
    const phone = String(data?.phone || "").trim();
    const birthYear = String(data?.birthYear || "").trim();
    if (!phone || !birthYear) return { remember: false, phone: "", birthYear: "" };
    return { remember: true, phone, birthYear };
  } catch {
    return { remember: false, phone: "", birthYear: "" };
  }
}

export function saveRememberedLogin(kind, { phone, birthYear }) {
  const parent_phone = String(phone || "").trim();
  const year = String(birthYear || "").trim();
  if (!parent_phone || !year) return;
  localStorage.setItem(
    `${STORAGE_PREFIX}${kind}`,
    JSON.stringify({ phone: parent_phone, birthYear: year }),
  );
}

export function clearRememberedLogin(kind) {
  localStorage.removeItem(`${STORAGE_PREFIX}${kind}`);
}
