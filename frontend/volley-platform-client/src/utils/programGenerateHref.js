/**
 * Линк към AI генератора с контекст от програмната седмица / конспекта.
 * Използва се от „Генерирай сега“ на програмната седмица и от присъствието.
 */
export function buildProgramGenerateHref(day, ctx = {}) {
  const themeForDay = day?.has_program_day ? day.theme : ctx.weekTheme;
  const params = new URLSearchParams();
  if (ctx.teamId) params.set("team_id", String(ctx.teamId));
  if (day?.date) params.set("date", day.date);
  const title = themeForDay || ctx.fallbackTitle;
  if (title) params.set("title", title);
  if (day?.has_program_day && Array.isArray(day.focus) && day.focus.length) {
    params.set("focus", day.focus.join(","));
  }
  if (ctx.ageBand) params.set("ageBand", ctx.ageBand);
  if (day?.textbook_slug) params.set("textbookSlug", day.textbook_slug);
  return `/ai-generator?${params.toString()}`;
}

/** Понеделник на ISO седмицата (Mon=0) като Date в локално пладне. */
function mondayOf(date) {
  const x = new Date(date);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

/** week_offset спрямо текущата седмица за дадена ISO дата (YYYY-MM-DD). */
export function weekOffsetForDate(dateIso) {
  if (!dateIso) return 0;
  const todayMon = mondayOf(new Date());
  const targetMon = mondayOf(new Date(`${dateIso}T12:00:00`));
  return Math.round((targetMon.getTime() - todayMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
}
