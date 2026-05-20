import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useHorizontalSwipeTabs } from "../../hooks/useHorizontalSwipeTabs";
import { parentLoginPath } from "../../utils/parentAuth";
import { formatMoney } from "../../utils/currency";
import { Button, EmptyState } from "../../components/ui";

const TABS = [
  { id: "overview", label: "Преглед" },
  { id: "attendance", label: "Присъствие" },
  { id: "fees", label: "Такси" },
  { id: "history", label: "История" },
];

const HISTORY_FILTERS = [
  { id: "all", label: "Всички" },
  { id: "attendance", label: "Присъствие" },
  { id: "payment", label: "Плащания" },
  { id: "system", label: "Система" },
];

const SYSTEM_KINDS = new Set(["created", "profile_update", "team_join"]);

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabelBg = (monthKey) => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "";
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("bg-BG", { month: "long", year: "numeric" });
};

const shortenTeamName = (name) => {
  const s = String(name || "").trim();
  if (!s) return "—";
  const m = s.match(/под\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  if (s.length > 12) return `${s.slice(0, 12)}…`;
  return s;
};

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusShort = (value) => {
  if (value === "present") return "✓";
  if (value === "late") return "З";
  if (value === "absent") return "—";
  if (value === "excused") return "И";
  return "·";
};

const genderShort = (g) => {
  if (g === "male") return "М";
  if (g === "female") return "Ж";
  return "—";
};

const formatDay = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (s.length >= 10) return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return s;
};

const paymentPaid = (row) => {
  if (row.paid === false) return false;
  if (row.paid === true) return true;
  return Boolean(row.paid_at);
};

function MoreMenu({ open, onClose, onHistory, onCopyParent, onBack }) {
  if (!open) return null;
  return (
    <div className="uiModalOverlay" onClick={onClose} role="presentation">
      <section className="uiModal uiModal--compact athleteProfileMoreSheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3 className="uiModalTitle">Още</h3>
        <div className="athleteProfileMoreBtns">
          <Button type="button" variant="secondary" block onClick={() => { onHistory(); onClose(); }}>
            История
          </Button>
          <Button type="button" variant="secondary" block as={Link} to={parentLoginPath()} target="_blank" rel="noreferrer" onClick={onClose}>
            Родителски вход
          </Button>
          <Button type="button" variant="secondary" block onClick={() => { onCopyParent(); onClose(); }}>
            Копирай линк
          </Button>
          <Button type="button" variant="ghost" block onClick={() => { onBack(); onClose(); }}>
            Назад
          </Button>
        </div>
        <Button type="button" variant="ghost" block onClick={onClose}>
          Затвори
        </Button>
      </section>
    </div>
  );
}

function TeamsPicker({ teams, selectedTeamIds, saving, onToggle, onSave, hasChanges }) {
  if (!teams.length) {
    return <p className="coachMobileMuted">Няма отбори за управление.</p>;
  }
  return (
    <>
      <p className="coachMobileMuted athleteProfileTeamsHint">
        Изберете в кои отбори участва състезателят. Натиснете „Запази отбори“, за да приложите промените.
      </p>
      <ul className="coachMobileTeamPickList">
        {teams.map((team) => (
          <li key={team.id}>
            <label className="coachMobileTeamPickRow">
              <input
                type="checkbox"
                checked={selectedTeamIds.has(team.id)}
                onChange={() => onToggle(team.id)}
                disabled={saving}
              />
              <span>
                <span className="coachMobileMenuLabel">{team.name}</span>
                {team.age_group ? (
                  <span className="coachMobileMuted coachMobileMenuHint">{team.age_group}</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" disabled={saving || !hasChanges} onClick={onSave} block style={{ marginTop: 8 }}>
        {saving ? "Запазване..." : "Запази отбори"}
      </Button>
    </>
  );
}

export default function AthleteProfileCoachMobile({
  profile,
  tab,
  setTab,
  from,
  feesPayHref,
  feesEditHref,
  feesAllHref,
  coachTeams,
  selectedTeamIds,
  savingTeams,
  hasTeamChanges,
  onToggleTeam,
  onSaveTeams,
  onCopyParentUrl,
  onBack,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(true);
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyLimit, setHistoryLimit] = useState(15);
  const [feesMonth, setFeesMonth] = useState(currentMonthKey);

  const swipeHandlers = useHorizontalSwipeTabs(tab, setTab, TABS.map((t) => t.id));

  const summary = profile.attendance_summary || {};
  const teamsShort = (profile.teams || []).map(shortenTeamName).join(", ") || "—";

  const currentPayment = useMemo(() => {
    const rows = profile.monthly_payments || [];
    return rows.find((r) => r.month_key === feesMonth) || rows.find((r) => r.month_key === currentMonthKey());
  }, [profile.monthly_payments, feesMonth]);

  const currentMonthPaid = currentPayment ? paymentPaid(currentPayment) : false;

  const attendanceRows = profile.last_attendance || [];
  const visibleAttendance = showAllAttendance ? attendanceRows : attendanceRows.slice(0, 8);

  const filteredTimeline = useMemo(() => {
    const list = profile.timeline || [];
    if (historyFilter === "all") return list;
    if (historyFilter === "attendance") return list.filter((e) => e.kind === "attendance");
    if (historyFilter === "payment") return list.filter((e) => e.kind === "payment");
    return list.filter((e) => SYSTEM_KINDS.has(e.kind));
  }, [profile.timeline, historyFilter]);

  const visibleTimeline = filteredTimeline.slice(0, historyLimit);

  const goHistoryTab = () => setTab("history");

  return (
    <div className="coachMobilePage athleteProfileCoachPage">
      <header className="athleteProfileHead">
        <div className="athleteProfileHeadTop">
          <Link to={from} className="athleteProfileBackLink" aria-label="Назад">
            ←
          </Link>
          <div className="athleteProfileHeadText">
            <h2 className="athleteProfileHeadName">{profile.athlete_name}</h2>
            <p className="athleteProfileHeadMeta">
              {profile.birth_year || "—"} · {genderShort(profile.gender)} ·{" "}
              {profile.is_active ? "Активен" : "Неактивен"}
              {teamsShort !== "—" ? ` · ${teamsShort}` : ""}
            </p>
          </div>
        </div>
        <div className="athleteProfileHeadActions">
          <Button as={Link} to={feesPayHref} size="sm">
            Плати
          </Button>
          <Button as={Link} to={feesEditHref} size="sm" variant="secondary">
            Редактирай
          </Button>
          <button type="button" className="athleteProfileMenuBtn" aria-label="Още" onClick={() => setMoreOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <nav className="coachMobileSubNav" aria-label="Профил секции">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`coachMobileSubNavBtn${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="athleteProfileSwipeArea" {...swipeHandlers}>
        {tab === "overview" ? (
          <div className="athleteProfileTab">
            <section className="athleteProfileCard">
              <h3 className="athleteProfileCardTitle">Накратко</h3>
              <p className="athleteProfileSummaryLine">
                Присъства {summary.present ?? 0} · {summary.attendance_rate_percent ?? 0}% ·{" "}
                {(summary.absent ?? 0) === 0 ? "0 отсъствия" : `${summary.absent} отсъствия`}
              </p>
              <span className={`uiBadge ${currentMonthPaid ? "uiBadge--success" : "uiBadge--danger"}`}>
                {monthLabelBg(feesMonth)}: {currentMonthPaid ? "Платено" : "Дължи"}
              </span>
            </section>

            <section className="athleteProfileCard">
              <button type="button" className="athleteProfileCollapseHead" onClick={() => setTeamsOpen((v) => !v)}>
                <span>Отбори</span>
                <span aria-hidden>{teamsOpen ? "▾" : "▸"}</span>
              </button>
              {teamsOpen ? (
                <div className="athleteProfileCollapseBody">
                  <TeamsPicker
                    teams={coachTeams}
                    selectedTeamIds={selectedTeamIds}
                    saving={savingTeams}
                    onToggle={onToggleTeam}
                    onSave={onSaveTeams}
                    hasChanges={hasTeamChanges}
                  />
                </div>
              ) : null}
            </section>

            <section className="athleteProfileCard">
              <button type="button" className="athleteProfileCollapseHead" onClick={() => setContactOpen((v) => !v)}>
                <span>Контакт</span>
                <span aria-hidden>{contactOpen ? "▾" : "▸"}</span>
              </button>
              {contactOpen ? (
                <div className="athleteProfileCollapseBody">
                  {profile.parent_phone ? (
                    <a href={`tel:${profile.parent_phone}`} className="athleteProfileContactRow">
                      Родител: {profile.parent_name || "—"} · {profile.parent_phone}
                    </a>
                  ) : (
                    <p className="coachMobileMuted">Родител: {profile.parent_name || "—"}</p>
                  )}
                  {profile.athlete_phone ? (
                    <a href={`tel:${profile.athlete_phone}`} className="athleteProfileContactRow">
                      Състезател: {profile.athlete_phone}
                    </a>
                  ) : (
                    <p className="coachMobileMuted">Тел. състезател: —</p>
                  )}
                </div>
              ) : null}
            </section>

            <section className="athleteProfileCard athleteProfileCard--compact">
              <h3 className="athleteProfileCardTitle">Родителски портал</h3>
              <p className="coachMobileMuted athleteProfilePortalHint">
                Вход с телефон и година на раждане на детето.
              </p>
              <div className="athleteProfileInlineActions">
                <Button as={Link} to={parentLoginPath()} size="sm" target="_blank" rel="noreferrer">
                  Отвори
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onCopyParentUrl}>
                  Копирай
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "attendance" ? (
          <div className="athleteProfileTab">
            <div className="athleteProfileBadgeGrid">
              <span className="uiBadge uiBadge--success">Присъства: {summary.present ?? 0}</span>
              <span className="uiBadge uiBadge--warning">Закъсня: {summary.late ?? 0}</span>
              <span className="uiBadge uiBadge--danger">Отсъства: {summary.absent ?? 0}</span>
              <span className="uiBadge uiBadge--secondary">Извинен: {summary.excused ?? 0}</span>
              <span className="uiBadge uiBadge--info">Процент: {summary.attendance_rate_percent ?? 0}%</span>
            </div>
            {attendanceRows.length === 0 ? (
              <EmptyState title="Няма присъствия" description="Все още няма записани тренировки." />
            ) : (
              <ul className="athleteProfileAttList">
                {visibleAttendance.map((row, idx) => (
                  <li key={`${row.date}-${idx}`} className="athleteProfileAttRow">
                    <span className="athleteProfileAttDate">{formatDay(row.date)}</span>
                    <span className="athleteProfileAttTeam">{shortenTeamName(row.team_name)}</span>
                    <span className={`athleteProfileAttStatus ${statusLabel(row.status) === "Присъства" ? "is-ok" : ""}`}>
                      {statusShort(row.status)} {statusLabel(row.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {attendanceRows.length > 8 && !showAllAttendance ? (
              <Button type="button" variant="secondary" size="sm" block onClick={() => setShowAllAttendance(true)}>
                Виж всички ({attendanceRows.length})
              </Button>
            ) : null}
          </div>
        ) : null}

        {tab === "fees" ? (
          <div className="athleteProfileTab athleteProfileTab--fees">
            <div className="athleteProfileFeesSticky">
              <InputMonth value={feesMonth} onChange={setFeesMonth} />
              <Button
                as={Link}
                to={`${feesPayHref}&month_key=${encodeURIComponent(feesMonth)}`}
                size="sm"
              >
                Добави плащане
              </Button>
            </div>
            <ul className="athleteProfileFeesList">
              {(profile.monthly_payments || []).map((row) => {
                const paid = paymentPaid(row);
                return (
                  <li key={row.month_key} className="athleteProfileFeesRow">
                    <span className="athleteProfileFeesMonth">{row.month_key}</span>
                    <span className={`uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {paid ? `Платено ${formatMoney(row.amount)}` : "Дължи"}
                    </span>
                    {!paid ? (
                      <Button
                        as={Link}
                        to={`${feesPayHref}&month_key=${encodeURIComponent(row.month_key)}`}
                        size="sm"
                        variant="secondary"
                      >
                        Плати
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {(profile.monthly_payments || []).length === 0 ? (
              <EmptyState title="Няма данни" description="Няма месечни записи." />
            ) : null}
            <Link to={feesAllHref} className="athleteProfileFeesAllLink">
              Всички такси
            </Link>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="athleteProfileTab">
            <div className="athleteProfileHistoryFilters">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`athleteProfileFilterChip${historyFilter === f.id ? " is-active" : ""}`}
                  onClick={() => {
                    setHistoryFilter(f.id);
                    setHistoryLimit(15);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {visibleTimeline.length === 0 ? (
              <EmptyState title="Няма събития" description="Няма записи за избрания филтър." />
            ) : (
              <ul className="athleteProfileTimeline">
                {visibleTimeline.map((ev, i) => (
                  <li key={`${ev.kind}-${ev.at}-${i}`} className="athleteProfileTimelineCard">
                    <div className="athleteProfileTimelineWhen">
                      {ev.at ? new Date(ev.at).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                    <div className="athleteProfileTimelineLabel">{ev.label || ev.kind}</div>
                    {(ev.detail || ev.actor_name) && (
                      <div className="athleteProfileTimelineMeta">
                        {[ev.detail, ev.actor_name].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {filteredTimeline.length > historyLimit ? (
              <Button type="button" variant="secondary" size="sm" block onClick={() => setHistoryLimit((n) => n + 15)}>
                Зареди още
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onHistory={goHistoryTab}
        onCopyParent={onCopyParentUrl}
        onBack={onBack}
      />
    </div>
  );
}

function InputMonth({ value, onChange }) {
  return (
    <input
      type="month"
      className="uiInput athleteProfileMonthInput"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Месец"
    />
  );
}
