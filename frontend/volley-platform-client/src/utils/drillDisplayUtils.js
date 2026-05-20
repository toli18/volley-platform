export const DRILL_EMPTY = "Няма данни";

export function displayValue(value) {
  if (value === 0 || value === "0") return "0";
  if (value === null || value === undefined) return DRILL_EMPTY;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "няма данни" || s.toLowerCase() === "n/a") return DRILL_EMPTY;
  return s;
}

export function fmtDateShort(value) {
  if (!value) return DRILL_EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("bg-BG");
}

export function fmtDateTime(value) {
  if (!value) return DRILL_EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("bg-BG");
}

export function mapDrillStatus(status) {
  const s = String(status || "").toLowerCase();
  const map = {
    draft: "Чернова",
    pending: "Чака одобрение",
    approved: "Одобрено",
    rejected: "Отхвърлено",
  };
  return map[s] || displayValue(status);
}

export function drillStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "uiBadge uiBadge--success";
  if (s === "rejected") return "uiBadge uiBadge--danger";
  if (s === "pending") return "uiBadge";
  return "uiBadge";
}

export function drillHasVideo(drill) {
  const v = drill?.video_urls;
  if (Array.isArray(v)) return v.some((x) => String(x || "").trim());
  return Boolean(String(v || "").trim());
}

export function drillFirstImageUrl(drill) {
  const raw = drill?.image_urls;
  if (Array.isArray(raw) && raw.length > 0) return String(raw.find(Boolean) || "").trim();
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}

export function drillFirstVideoUrl(drill) {
  const raw = drill?.video_urls;
  if (Array.isArray(raw) && raw.length > 0) return String(raw.find(Boolean) || "").trim();
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}

export function truncateText(text, max = 120) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export function tagBg(t) {
  const x = String(t || "").trim();
  if (!x) return "";
  const k = x.toLowerCase();
  const dict = {
    serve: "сервис",
    service: "сервис",
    receive: "посрещане",
    reception: "посрещане",
    setting: "разпределение",
    set: "разпределение",
    attack: "атака",
    block: "блокада",
    defense: "защита",
    transition: "преход",
    pass: "пас",
    spike: "нападение",
    hit: "нападение",
    dig: "защита (диг)",
    technique: "техника",
    tactics: "тактика",
    communication: "комуникация",
    psychology: "психология",
    physical: "физическа подготовка",
    coordination: "координация",
  };
  return dict[k] || x;
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map((x) => String(x).trim()))].sort((a, b) =>
    a.localeCompare(b, "bg")
  );
}
