const TEAM_COLORS = [
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
  { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#78350f" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d" },
  { bg: "#cffafe", border: "#67e8f9", text: "#164e63" },
];

export const WEEKDAY_HEADERS = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"];
export const WEEKDAY_HEADERS_FULL = [
  "Понеделник",
  "Вторник",
  "Сряда",
  "Четвъртък",
  "Петък",
  "Събота",
  "Неделя",
];

export function teamColorForName(teamName) {
  const s = String(teamName || "");
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash + s.charCodeAt(i) * 17) % TEAM_COLORS.length;
  return TEAM_COLORS[hash];
}

export function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOfWeek(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function slotKey(row) {
  return `${row.start_time}|${row.end_time}`;
}

export function groupItemsByDate(items) {
  const map = new Map();
  for (const it of items || []) {
    const arr = map.get(it.date) || [];
    arr.push(it);
    map.set(it.date, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }
  return map;
}

export function buildMonthCells(monthKey) {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
  const first = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const firstWeekdayMonday0 = (first.getDay() + 6) % 7;
  const total = Math.ceil((firstWeekdayMonday0 + lastDate) / 7) * 7;
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const dayNum = i - firstWeekdayMonday0 + 1;
    if (dayNum < 1 || dayNum > lastDate) {
      cells.push({ isCurrentMonth: false, date: "", day: "" });
      continue;
    }
    const date = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    cells.push({ isCurrentMonth: true, date, day: dayNum });
  }
  return cells;
}

export function itemsInWeek(items, weekStart) {
  const weekEnd = addDaysIso(weekStart, 6);
  return (items || []).filter((it) => it.date >= weekStart && it.date <= weekEnd);
}

export function timeSlotsForWeek(items, weekStart) {
  const inWeek = itemsInWeek(items, weekStart);
  const map = new Map();
  for (const it of inWeek) {
    const k = slotKey(it);
    if (!map.has(k)) map.set(k, { key: k, start_time: it.start_time, end_time: it.end_time });
  }
  return [...map.values()].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

export function formatWeekRangeLabel(weekStart) {
  const end = addDaysIso(weekStart, 6);
  const d0 = new Date(`${weekStart}T12:00:00`);
  const d1 = new Date(`${end}T12:00:00`);
  const opts = { day: "numeric", month: "short" };
  return `${d0.toLocaleDateString("bg-BG", opts)} – ${d1.toLocaleDateString("bg-BG", { ...opts, year: "numeric" })}`;
}

export function shiftMonthKey(monthKey, delta) {
  const [y, m] = String(monthKey).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
