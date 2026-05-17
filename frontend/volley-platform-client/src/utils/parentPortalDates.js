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
