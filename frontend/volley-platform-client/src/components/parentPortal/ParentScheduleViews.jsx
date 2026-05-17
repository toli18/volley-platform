import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, EmptyState } from "../ui";
import ParentDayDetailModal from "./ParentDayDetailModal";
import {
  WEEKDAY_HEADERS,
  addDaysIso,
  buildMonthCells,
  formatParentDayLabel,
  formatWeekRangeLabel,
  groupItemsByDate,
  itemsInWeek,
  itemsOnDate,
  mondayOfWeek,
  shiftMonthKey,
  slotKey,
  abbreviateTeamName,
  teamColorForName,
  timeSlotsForWeek,
} from "../../utils/parentPortalSchedule";
import { competitionBlockStyle, competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";

function weekdayShortForDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return WEEKDAY_HEADERS[(d.getDay() + 6) % 7];
}

function formatAgendaDayLabel(isoDate) {
  const [, m, d] = String(isoDate).split("-");
  return `${weekdayShortForDate(isoDate)} · ${d}.${m}`;
}

function eventTitle(row) {
  if (row.is_cancelled) return "Отменена";
  if (isCompetitionEvent(row)) return competitionKindLabel(row);
  return row.team_name || "Отбор";
}

function gridCellLabel(row) {
  if (row.is_cancelled) return "Отм.";
  if (isCompetitionEvent(row)) {
    const k = competitionKindLabel(row);
    return k.length > 6 ? `${k.slice(0, 5)}.` : k;
  }
  return abbreviateTeamName(row.team_name);
}

function gridCellTooltip(row) {
  const parts = [eventTitle(row)];
  if (row.start_time) parts.push(`${row.start_time} – ${row.end_time || ""}`);
  if (row.location) parts.push(row.location);
  return parts.filter(Boolean).join(" · ");
}

function SessionBlock({ row, variant = "card" }) {
  const isComp = isCompetitionEvent(row);
  const cancelled = Boolean(row.is_cancelled);
  const colors = isComp ? null : teamColorForName(row.team_name);
  const time = `${row.start_time || "—"} – ${row.end_time || "—"}`;
  const title = eventTitle(row);

  if (variant === "grid") {
    return (
      <div
        className={`parentPortalSchedBlock parentPortalSchedBlock--grid${isComp ? " parentPortalSchedBlock--competition" : ""}${cancelled ? " parentPortalSchedBlock--cancelled" : ""}`}
        style={
          isComp
            ? competitionBlockStyle
            : { borderColor: colors.border, background: colors.bg, color: colors.text }
        }
        title={gridCellTooltip(row)}
      >
        <span className="parentPortalSchedBlockAbbrev">{gridCellLabel(row)}</span>
        {row.location ? <span className="parentPortalSchedBlockLoc">{row.location}</span> : null}
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div
        className={`parentPortalSchedRow${cancelled ? " is-cancelled" : ""}${isComp ? " is-competition" : ""}`}
        style={
          isComp
            ? { ...competitionBlockStyle, borderLeftWidth: 3, borderLeftStyle: "solid" }
            : { borderLeftColor: colors.border, background: colors.bg, color: colors.text }
        }
      >
        <span className="parentPortalSchedRowTime">{time}</span>
        <span className="parentPortalSchedRowMain">
          <span className="parentPortalSchedRowTitle">{title}</span>
          {row.location ? <span className="parentPortalSchedRowLoc"> · {row.location}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`parentPortalSchedBlock${variant === "compact" ? " parentPortalSchedBlock--compact" : ""}${isComp ? " parentPortalSchedBlock--competition" : ""}${cancelled ? " parentPortalSchedBlock--cancelled" : ""}`}
      style={
        isComp
          ? competitionBlockStyle
          : { borderColor: colors.border, background: colors.bg, color: colors.text }
      }
    >
      <div className="parentPortalSchedBlockTime">{time}</div>
      <div className="parentPortalSchedBlockTeam">{title}</div>
      {row.location ? (
        <div className="parentPortalSchedBlockMeta">{variant === "compact" ? row.location : `Място: ${row.location}`}</div>
      ) : null}
    </div>
  );
}

function DayAgendaList({ days, getItemsForDate, selectedDate, onDayClick, emptyHint = "Няма събития" }) {
  return (
    <div className="parentPortalAgendaList">
      {days.map(({ date, label }) => {
        const dayItems = (getItemsForDate(date) || []).sort((a, b) =>
          String(a.start_time).localeCompare(String(b.start_time)),
        );
        const isSelected = selectedDate === date;
        return (
          <button
            key={date}
            type="button"
            className={`parentPortalAgendaDay${isSelected ? " is-selected" : ""}${dayItems.length === 0 ? " parentPortalAgendaDay--empty" : ""}`}
            onClick={() => onDayClick(date)}
          >
            <div className="parentPortalAgendaDayHead">
              <span className="parentPortalAgendaDayLabel">{label || formatAgendaDayLabel(date)}</span>
              {dayItems.length > 0 ? <span className="parentPortalAgendaDayCount">{dayItems.length}</span> : null}
            </div>
            {dayItems.length === 0 ? (
              <p className="parentPortalAgendaEmpty">{emptyHint}</p>
            ) : (
              <div className="parentPortalAgendaEvents">
                {dayItems.map((row, i) => (
                  <SessionBlock key={`${date}-${row.start_time}-${i}`} row={row} variant="row" />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function WeekMobileList({ items, weekStart, selectedDate, onDayClick }) {
  const inWeek = useMemo(() => itemsInWeek(items, weekStart), [items, weekStart]);
  const days = useMemo(
    () =>
      WEEKDAY_HEADERS.map((_, dayIdx) => {
        const date = addDaysIso(weekStart, dayIdx);
        return { date, label: formatAgendaDayLabel(date) };
      }),
    [weekStart],
  );

  return (
    <DayAgendaList
      days={days}
      getItemsForDate={(date) => inWeek.filter((it) => it.date === date)}
      selectedDate={selectedDate}
      onDayClick={onDayClick}
    />
  );
}

function MonthMobileList({ items, monthKey, selectedDate, onDayClick }) {
  const cells = useMemo(() => buildMonthCells(monthKey).filter((c) => c.isCurrentMonth), [monthKey]);
  const byDate = useMemo(() => groupItemsByDate(items), [items]);
  const days = useMemo(
    () =>
      cells
        .filter((cell) => (byDate.get(cell.date) || []).length > 0)
        .map((cell) => ({ date: cell.date, label: formatAgendaDayLabel(cell.date) })),
    [cells, byDate],
  );

  return (
    <DayAgendaList
      days={days}
      getItemsForDate={(date) => byDate.get(date) || []}
      selectedDate={selectedDate}
      onDayClick={onDayClick}
    />
  );
}

function WeekGrid({ items, weekStart, selectedDate, onDayClick }) {
  const slots = useMemo(() => timeSlotsForWeek(items, weekStart), [items, weekStart]);
  const inWeek = useMemo(() => itemsInWeek(items, weekStart), [items, weekStart]);
  const byDate = useMemo(() => groupItemsByDate(inWeek), [inWeek]);

  if (slots.length === 0) {
    return (
      <EmptyState
        title="Няма събития тази седмица"
        description="Избери друга седмица или прегледай месечния изглед."
      />
    );
  }

  return (
    <div className="parentPortalWeekWrap">
      <p className="uiHint parentPortalScheduleHint">
        Отбор и зала в клетката. Клик за пълен списък със събитията за деня.
      </p>
      <div className="parentPortalWeekGrid">
        <div className="parentPortalWeekCorner" />
        {WEEKDAY_HEADERS.map((name, dayIdx) => {
          const date = addDaysIso(weekStart, dayIdx);
          const count = (byDate.get(date) || []).length;
          return (
            <button
              key={name}
              type="button"
              className={`parentPortalWeekDayHead parentPortalWeekDayHead--btn${selectedDate === date ? " is-selected" : ""}`}
              onClick={() => onDayClick(date)}
            >
              {name}
              {count ? <span className="parentPortalWeekDayCount">{count}</span> : null}
            </button>
          );
        })}

        {slots.map((slot) => (
          <Fragment key={slot.key}>
            <div className="parentPortalWeekTime">
              {slot.start_time}
              <span className="parentPortalWeekTimeEnd"> – {slot.end_time}</span>
            </div>
            {WEEKDAY_HEADERS.map((_, dayIdx) => {
              const date = addDaysIso(weekStart, dayIdx);
              const cellItems = inWeek.filter((it) => it.date === date && slotKey(it) === slot.key);
              return (
                <div
                  key={`${slot.key}-${date}`}
                  className={`parentPortalWeekCell${selectedDate === date ? " parentPortalWeekCell--selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onDayClick(date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onDayClick(date);
                    }
                  }}
                >
                  {cellItems.map((row, i) => (
                    <SessionBlock key={`${date}-${slot.key}-${i}`} row={row} variant="grid" />
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ items, monthKey, selectedDate, onDayClick }) {
  const cells = useMemo(() => buildMonthCells(monthKey), [monthKey]);
  const byDate = useMemo(() => groupItemsByDate(items), [items]);

  return (
    <div className="parentPortalMonthWrap">
      <p className="uiHint parentPortalScheduleHint">Кликнете върху ден за пълен списък със събития.</p>
      <div className="parentPortalMonthHeadRow">
        {WEEKDAY_HEADERS.map((name) => (
          <div key={name} className="parentPortalMonthDayLabel">
            {name}
          </div>
        ))}
      </div>
      <div className="parentPortalMonthGrid">
        {cells.map((cell, idx) => {
          if (!cell.isCurrentMonth) {
            return <div key={`e-${idx}`} className="parentPortalMonthCell parentPortalMonthCell--empty" />;
          }
          const dayItems = byDate.get(cell.date) || [];
          return (
            <button
              key={cell.date}
              type="button"
              className={`parentPortalMonthCell parentPortalMonthCell--btn${selectedDate === cell.date ? " is-selected" : ""}`}
              onClick={() => onDayClick(cell.date)}
            >
              <div className="parentPortalMonthCellDay">{cell.day}</div>
              <div className="parentPortalMonthCellBody">
                {dayItems.map((row, i) => (
                  <SessionBlock key={`${cell.date}-${i}`} row={row} variant="grid" />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ParentScheduleViews({ token, initialItems, scheduleMonthKey, formatMonthKey }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultMonth = scheduleMonthKey || (initialItems?.[0]?.date ? String(initialItems[0].date).slice(0, 7) : today.slice(0, 7));

  const [view, setView] = useState("week");
  const [monthKey, setMonthKey] = useState(defaultMonth);
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today));
  const [cache, setCache] = useState(() => ({ [defaultMonth]: initialItems || [] }));
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [hiddenTeams, setHiddenTeams] = useState(() => new Set());
  const loadedMonthsRef = useRef(new Set([defaultMonth]));

  const toggleTeamFilter = (teamName) => {
    setHiddenTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) next.delete(teamName);
      else next.add(teamName);
      return next;
    });
  };

  const weekMonths = useMemo(() => {
    const end = addDaysIso(weekStart, 6);
    const m0 = weekStart.slice(0, 7);
    const m1 = end.slice(0, 7);
    return m0 === m1 ? [m0] : [m0, m1];
  }, [weekStart]);

  useEffect(() => {
    if (!token) return;
    const needed = view === "month" ? [monthKey] : weekMonths;
    const toFetch = needed.filter((mk) => !loadedMonthsRef.current.has(mk));
    if (!toFetch.length) return;

    let cancelled = false;
    (async () => {
      setLoadingMonth(true);
      try {
        for (const mk of toFetch) {
          loadedMonthsRef.current.add(mk);
          try {
            const res = await axiosInstance.get(API_PATHS.PARENT_PORTAL_SCHEDULE(token), { params: { month: mk } });
            const rows = Array.isArray(res.data) ? res.data : [];
            if (!cancelled) setCache((prev) => ({ ...prev, [mk]: rows }));
          } catch {
            if (!cancelled) setCache((prev) => ({ ...prev, [mk]: [] }));
          }
        }
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, monthKey, weekMonths, view]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setSelectedDate("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedDate]);

  const monthItems = cache[monthKey] || [];

  const weekItems = useMemo(() => {
    const merged = [];
    for (const mk of weekMonths) {
      for (const row of cache[mk] || []) merged.push(row);
    }
    return merged;
  }, [cache, weekMonths]);

  const activeItems = view === "week" ? weekItems : monthItems;
  const hasCompetitions = useMemo(() => activeItems.some((it) => isCompetitionEvent(it)), [activeItems]);

  const teamsLegend = useMemo(() => {
    return [...new Set(activeItems.map((it) => it.team_name).filter(Boolean))];
  }, [activeItems]);

  const visibleItems = useMemo(() => {
    if (!hiddenTeams.size) return activeItems;
    return activeItems.filter((it) => !it.team_name || !hiddenTeams.has(it.team_name));
  }, [activeItems, hiddenTeams]);

  const filteredWeekItems = view === "week" ? visibleItems : weekItems;
  const filteredMonthItems = view === "month" ? visibleItems : monthItems;

  const selectedDayItems = useMemo(() => {
    if (!selectedDate) return [];
    if (view === "week") return itemsOnDate(weekItems, selectedDate);
    return itemsOnDate(monthItems, selectedDate);
  }, [selectedDate, view, weekItems, monthItems]);

  const openDay = (date) => setSelectedDate(date);

  if (!initialItems?.length && !loadingMonth) {
    return <EmptyState title="Няма събития за този месец" description="Когато треньорът добави график, ще го виждате тук." />;
  }

  return (
    <div className="parentPortalScheduleViews">
      <div className="parentPortalScheduleToolbar">
        <div className="parentPortalScheduleViewToggle">
          <button
            type="button"
            className={`parentPortalScheduleViewBtn${view === "week" ? " is-active" : ""}`}
            onClick={() => {
              setView("week");
              setSelectedDate("");
            }}
          >
            Седмица
          </button>
          <button
            type="button"
            className={`parentPortalScheduleViewBtn${view === "month" ? " is-active" : ""}`}
            onClick={() => {
              setView("month");
              setSelectedDate("");
            }}
          >
            Месец
          </button>
        </div>

        {view === "week" ? (
          <div className="parentPortalScheduleNav">
            <Button size="sm" variant="secondary" onClick={() => setWeekStart((w) => addDaysIso(w, -7))}>
              ← Предишна
            </Button>
            <span className="parentPortalScheduleNavLabel">{formatWeekRangeLabel(weekStart)}</span>
            <Button size="sm" variant="secondary" onClick={() => setWeekStart((w) => addDaysIso(w, 7))}>
              Следваща →
            </Button>
          </div>
        ) : (
          <div className="parentPortalScheduleNav">
            <Button size="sm" variant="secondary" onClick={() => setMonthKey((m) => shiftMonthKey(m, -1))}>
              ← Предишен
            </Button>
            <span className="parentPortalScheduleNavLabel">{formatMonthKey(monthKey)}</span>
            <Button size="sm" variant="secondary" onClick={() => setMonthKey((m) => shiftMonthKey(m, 1))}>
              Следващ →
            </Button>
          </div>
        )}
      </div>

      <p className="uiHint parentPortalScheduleHint parentPortalScheduleHint--mobile">
        Всички събития за деня — с час, отбор и място. Докоснете ред за детайли.
      </p>

      <div className="parentPortalScheduleLegend">
        <span className="parentPortalScheduleLegendItem parentPortalScheduleLegendItem--training">Тренировка</span>
        {hasCompetitions ? (
          <span className="parentPortalScheduleLegendItem parentPortalScheduleLegendItem--competition">Състезание</span>
        ) : null}
        {teamsLegend.length > 1 ? (
          <div className="parentPortalScheduleLegendTeams" role="group" aria-label="Филтър по отбор">
            {teamsLegend.map((name) => {
              const c = teamColorForName(name);
              const off = hiddenTeams.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`parentPortalScheduleLegendChip${off ? " is-off" : ""}`}
                  style={{ borderColor: c.border, background: off ? "#f1f5f9" : c.bg, color: off ? "#94a3b8" : c.text }}
                  title={off ? `Покажи: ${name}` : `Скрий: ${name}`}
                  onClick={() => toggleTeamFilter(name)}
                >
                  {abbreviateTeamName(name)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {loadingMonth ? <p className="uiHint">Зареждане на график...</p> : null}

      {view === "week" ? (
        <>
          <div className="parentPortalWeekDesktop">
            <WeekGrid items={filteredWeekItems} weekStart={weekStart} selectedDate={selectedDate} onDayClick={openDay} />
          </div>
          <WeekMobileList items={filteredWeekItems} weekStart={weekStart} selectedDate={selectedDate} onDayClick={openDay} />
        </>
      ) : monthItems.length === 0 && !loadingMonth ? (
        <EmptyState title="Няма събития" description={`За ${formatMonthKey(monthKey)} няма записани събития.`} />
      ) : (
        <>
          <div className="parentPortalMonthDesktop">
            <MonthGrid items={filteredMonthItems} monthKey={monthKey} selectedDate={selectedDate} onDayClick={openDay} />
          </div>
          <MonthMobileList items={filteredMonthItems} monthKey={monthKey} selectedDate={selectedDate} onDayClick={openDay} />
        </>
      )}

      <ParentDayDetailModal
        date={selectedDate}
        items={selectedDayItems}
        formatDateLabel={formatParentDayLabel}
        onClose={() => setSelectedDate("")}
      />
    </div>
  );
}
