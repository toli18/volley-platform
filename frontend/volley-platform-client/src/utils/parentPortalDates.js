const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

const parseLocalDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const startOfToday = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};

/** „Днес“, „Утре“, „След 2 дни“ */
export function formatDaysUntil(isoDate) {
  const target = parseLocalDate(isoDate);
  if (!target) return null;
  const diff = Math.round((target - startOfToday()) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return "Днес";
  if (diff === 1) return "Утре";
  if (diff === 2) return "След 2 дни";
  if (diff <= 7) return `След ${diff} дни`;
  if (diff <= 30) return `След ${diff} дни`;
  const weeks = Math.round(diff / 7);
  if (weeks < 8) return `След ${weeks} седмици`;
  return `След ${diff} дни`;
}

export function monthNameFromKey(monthKey) {
  if (!monthKey || !String(monthKey).includes("-")) return "";
  const m = Number(String(monthKey).split("-")[1]) - 1;
  return MONTHS_BG[m] || "";
}

/** „2 състезания през май“ */
export function formatCompetitionsMonthLabel(count, monthKey) {
  const month = monthNameFromKey(monthKey);
  if (!month) return "";
  const n = Number(count) || 0;
  if (n === 0) return `Няма състезания през ${month}`;
  const word = n === 1 ? "състезание" : "състезания";
  return `${n} ${word} през ${month}`;
}

/** „Срок до 10-и, май 2026“ */
export function formatFeeDueLabel(dueDay, monthKey) {
  const day = Number(dueDay) || 10;
  const month = monthNameFromKey(monthKey);
  const year = monthKey ? String(monthKey).split("-")[0] : "";
  if (!month) return `Срок до ${day}-и`;
  return `Срок до ${day}-и, ${month}${year ? ` ${year}` : ""}`;
}

export function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const attendanceCutoffIso = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function normalizeIsoDate(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (s.length >= 10 && s[4] === "-" && s[7] === "-") return s.slice(0, 10);
  return s;
}

/** Filter attendance rows for parent portal period (3/6/12 records or 30d). */
export function filterAttendanceByPeriod(rows, period) {
  const list = Array.isArray(rows) ? rows : [];
  if (period === "30d") {
    const cutoff = attendanceCutoffIso(30);
    const today = todayIsoLocal();
    return list.filter((r) => {
      const d = normalizeIsoDate(r?.date);
      return d && d >= cutoff && d <= today;
    });
  }
  const n = Number(period) || 3;
  return list.slice(0, n);
}

/** Summary badges for the currently visible attendance rows. */
export function summarizeAttendanceRows(rows) {
  const active = (rows || []).filter((r) => !r?.is_cancelled);
  const present = active.filter((r) => r.status === "present").length;
  const late = active.filter((r) => r.status === "late").length;
  const absent = active.filter((r) => r.status === "absent").length;
  const excused = active.filter((r) => r.status === "excused").length;
  const total = active.length;
  const attendance_rate_percent = total
    ? Math.round(((present + late) / total) * 1000) / 10
    : 0;
  return { present, late, absent, excused, total, attendance_rate_percent };
}

export function formatPaidAtBg(isoOrDate) {
  if (!isoOrDate) return null;
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return null;
  }
}
