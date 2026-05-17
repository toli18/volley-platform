import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import ParentScheduleViews from "../components/parentPortal/ParentScheduleViews";
import { Card, EmptyState, Input } from "../components/ui";
import { formatMoney } from "../utils/currency";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
import {
  filterAttendanceByPeriod,
  formatCompetitionsMonthLabel,
  formatDaysUntil,
  formatFeeDueLabel,
  formatPaidAtBg,
} from "../utils/parentPortalDates";

const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusBadgeClass = (value) => {
  if (value === "present") return "uiBadge--success";
  if (value === "late") return "uiBadge--warning";
  if (value === "absent") return "uiBadge--danger";
  if (value === "excused") return "uiBadge--secondary";
  return "uiBadge--secondary";
};

const formatMonthKey = (mk) => {
  if (!mk || !String(mk).includes("-")) return mk || "—";
  const [y, m] = String(mk).split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return mk;
  return `${MONTHS_BG[mi]} ${y}`;
};

const formatDateBg = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return iso;
  }
};

const formatShortDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
};

const PARENT_ATTENDANCE_PERIOD_OPTIONS = [
  { value: "3", label: "Последни 3" },
  { value: "6", label: "Последни 6" },
  { value: "12", label: "Последни 12" },
  { value: "30d", label: "Последните 30 дни" },
];

const PARENT_FEES_PERIOD_OPTIONS = [
  { value: "3", label: "Последни 3" },
  { value: "6", label: "Последни 6" },
  { value: "12", label: "Последни 12" },
];

function HighlightEventBlock({ item, variant }) {
  const isComp = variant === "competition" || isCompetitionEvent(item);
  const daysUntil = item ? formatDaysUntil(item.date) : null;
  if (!item) {
    return (
      <p className="parentPortalHighlightMuted parentPortalNextEventEmpty">
        {isComp ? "Няма предстоящо състезание." : "Няма предстояща тренировка."}
      </p>
    );
  }
  return (
    <div className={`parentPortalNextEventBlock${isComp ? " parentPortalNextEventBlock--competition" : ""}`}>
      <p className={`parentPortalHighlightBadge${isComp ? " parentPortalHighlightBadge--competition" : ""}`}>
        <span className="parentPortalEventIcon" aria-hidden="true">
          {isComp ? "🏆" : "🏐"}
        </span>
        {isComp ? competitionKindLabel(item) : "Тренировка"}
      </p>
      <p className="parentPortalHighlightMain">
        <span className="parentPortalEventIcon parentPortalEventIcon--inline" aria-hidden="true">
          📅
        </span>{" "}
        {formatDateBg(item.date)}
        {daysUntil ? <span className="parentPortalDaysUntil">{daysUntil}</span> : null}
      </p>
      <p className="parentPortalHighlightDetail">
        <span className="parentPortalEventIcon parentPortalEventIcon--inline" aria-hidden="true">
          🕐
        </span>{" "}
        {item.start_time} – {item.end_time}
        {item.team_name ? ` · ${item.team_name}` : ""}
      </p>
      {item.location ? (
        <p className="parentPortalHighlightDetail parentPortalHighlightDetail--location" title={item.location}>
          <span className="parentPortalEventIcon parentPortalEventIcon--inline" aria-hidden="true">
            📍
          </span>{" "}
          {item.location}
        </p>
      ) : null}
    </div>
  );
}

function PeriodFilterSelect({ value, onChange, id, options }) {
  const periodOptions = options || PARENT_FEES_PERIOD_OPTIONS;
  return (
    <Input
      as="select"
      id={id}
      className="parentPortalPeriodSelect"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Период"
    >
      {periodOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Input>
  );
}

function ParentPortalShell({ children }) {
  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img src="/bfvb-logo.png" alt="БФВ" className="parentPortalLogo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div>
            <div className="parentPortalBrand">Volley Coach Platform</div>
            <div className="parentPortalBrandSub">Родителски профил</div>
          </div>
        </div>
      </header>
      <main className="parentPortalMain">{children}</main>
      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}


export default function ParentPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [attendancePeriod, setAttendancePeriod] = useState("3");
  const [feesPeriod, setFeesPeriod] = useState("3");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.PARENT_PORTAL_GET(token));
        if (!cancelled) setProfile(res.data || null);
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Линкът е невалиден или изтекъл.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const feeCoach = profile?.fee_coach || {};
  const currentFee = profile?.current_month_fee;
  const nextTraining = profile?.next_training;
  const nextCompetition = profile?.next_competition;
  const summary = profile?.attendance_summary;
  const scheduleMonthKey = profile?.schedule_month_key || new Date().toISOString().slice(0, 7);
  const competitionsMonthLabel = formatCompetitionsMonthLabel(
    profile?.competitions_this_month ?? 0,
    scheduleMonthKey,
  );
  const feeDueDay = currentFee?.due_day ?? profile?.fee_due_day ?? 10;

  const allAttendance = profile?.last_attendance ?? [];
  const allPayments = profile?.monthly_payments ?? [];

  const visibleAttendance = useMemo(() => {
    const n = Number(attendancePeriod) || 3;
    return allAttendance.slice(0, n);
  }, [profile?.last_attendance, attendancePeriod, allAttendance]);

  const visiblePayments = useMemo(() => {
    const n = Number(feesPeriod) || 3;
    return allPayments.slice(0, n);
  }, [profile?.monthly_payments, feesPeriod, allPayments]);

  return (
    <ParentPortalShell>
      <div className="parentPortalPage">
        <header className="parentPortalHero">
          <h1 className="parentPortalHeroTitle">
            {profile ? profile.athlete_name : "Родителски профил"}
          </h1>
          <p className="parentPortalHeroSub">
            Присъствие, график и месечни такси
          </p>
        </header>

        {loading ? (
          <Card title="Зареждане..."><p>Моля, изчакай...</p></Card>
        ) : null}

        {!loading && error ? (
          <EmptyState title="Достъпът е отказан" description={error} />
        ) : null}

        {!loading && !error && profile ? (
          <>
            <div className="parentPortalHighlightGrid">
              <section className="parentPortalHighlightCard parentPortalHighlightCard--schedule">
                <h2 className="parentPortalHighlightTitle">Следващи събития</h2>
                <div className="parentPortalNextEventsStack">
                  <HighlightEventBlock item={nextTraining} variant="training" />
                  <div className="parentPortalNextEventDivider" role="presentation" />
                  <HighlightEventBlock item={nextCompetition} variant="competition" />
                </div>
                {competitionsMonthLabel ? (
                  <p className="parentPortalCompetitionsMonth">
                    <span className="parentPortalEventIcon" aria-hidden="true">🏆</span>{" "}
                    {competitionsMonthLabel}
                  </p>
                ) : null}
              </section>

              <section className={`parentPortalHighlightCard ${currentFee?.paid ? "parentPortalHighlightCard--paid" : "parentPortalHighlightCard--unpaid"}`}>
                <h2 className="parentPortalHighlightTitle">
                  <span className="parentPortalEventIcon" aria-hidden="true">💶</span> Такса — {formatMonthKey(currentFee?.month_key)}
                </h2>
                {currentFee?.paid ? (
                  <>
                    <p className="parentPortalHighlightMain">
                      <span className="parentPortalEventIcon" aria-hidden="true">✓</span> Платена
                    </p>
                    <p className="parentPortalHighlightDetail">
                      {formatMoney(currentFee.amount)}
                      {currentFee.paid_at
                        ? ` · ${new Date(currentFee.paid_at).toLocaleDateString("bg-BG")}`
                        : ""}
                    </p>
                    {currentFee.last_paid_at &&
                    currentFee.last_paid_month_key &&
                    currentFee.last_paid_month_key !== currentFee.month_key ? (
                      <p className="parentPortalHighlightDetail parentPortalHighlightDetail--feeMeta">
                        Последно плащане: {formatPaidAtBg(currentFee.last_paid_at)}
                        {currentFee.last_paid_month_key
                          ? ` (${formatMonthKey(currentFee.last_paid_month_key)})`
                          : ""}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="parentPortalHighlightMain">
                      <span className="parentPortalEventIcon" aria-hidden="true">!</span> Неплатена
                    </p>
                    <p className="parentPortalHighlightDetail parentPortalHighlightDetail--feeDue">
                      <span className="parentPortalEventIcon parentPortalEventIcon--inline" aria-hidden="true">
                        ⏳
                      </span>{" "}
                      {formatFeeDueLabel(feeDueDay, currentFee?.month_key)}
                    </p>
                    {currentFee?.last_paid_at ? (
                      <p className="parentPortalHighlightDetail parentPortalHighlightDetail--feeMeta">
                        Последно плащане: {formatPaidAtBg(currentFee.last_paid_at)}
                        {currentFee.last_paid_month_key
                          ? ` (${formatMonthKey(currentFee.last_paid_month_key)})`
                          : ""}
                      </p>
                    ) : null}
                  </>
                )}
                {(feeCoach.name || feeCoach.email || feeCoach.club_phone) ? (
                  <div className="parentPortalContactBox">
                    <div className="parentPortalContactLabel">
                      <span className="parentPortalEventIcon" aria-hidden="true">📞</span> Контакт
                    </div>
                    {feeCoach.name ? <div>{feeCoach.name}</div> : null}
                    {feeCoach.email ? (
                      <a href={`mailto:${feeCoach.email}`} className="parentPortalContactLink">{feeCoach.email}</a>
                    ) : null}
                    {feeCoach.club_name ? <div className="parentPortalHighlightMuted">{feeCoach.club_name}</div> : null}
                    {feeCoach.club_phone ? (
                      <a href={`tel:${feeCoach.club_phone}`} className="parentPortalContactLink">{feeCoach.club_phone}</a>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            <Card title="Обща информация">
              <div className="parentPortalInfoGrid">
                {profile.birth_year ? (
                  <span className="uiBadge">Година на раждане: {profile.birth_year}</span>
                ) : null}
                {(profile.teams || []).map((t) => (
                  <span key={t} className="uiBadge uiBadge--info">Отбор: {t}</span>
                ))}
                {!(profile.teams || []).length ? (
                  <span className="uiBadge">Няма активни отбори</span>
                ) : null}
                {profile.parent_name ? (
                  <span className="uiBadge">Родител: {profile.parent_name}</span>
                ) : null}
                {profile.parent_phone ? (
                  <span className="uiBadge">Телефон: {profile.parent_phone}</span>
                ) : null}
              </div>
              {(profile.teams || []).length > 1 ? (
                <p className="uiHint" style={{ marginTop: 10, marginBottom: 0 }}>
                  Състезателят тренира в няколко групи — използвайте седмичния или месечния изглед по-долу.
                </p>
              ) : null}
            </Card>

            <Card title={`График — ${formatMonthKey(profile.schedule_month_key || new Date().toISOString().slice(0, 7))}`}>
              <ParentScheduleViews
                token={token}
                initialItems={profile.monthly_schedule || []}
                scheduleMonthKey={profile.schedule_month_key}
                formatMonthKey={formatMonthKey}
              />
            </Card>

            <Card
              title="Присъствие"
              subtitle={
                visibleAttendance.length !== allAttendance.length || attendancePeriod === "30d"
                  ? `Показани ${visibleAttendance.length} от ${allAttendance.length} записа`
                  : undefined
              }
              actions={
                <PeriodFilterSelect
                  id="parent-attendance-period"
                  value={attendancePeriod}
                  onChange={setAttendancePeriod}
                  options={PARENT_ATTENDANCE_PERIOD_OPTIONS}
                />
              }
            >
              <div className="parentPortalBadgeRow">
                <span className="uiBadge uiBadge--success">Присъства: {summary?.present || 0}</span>
                <span className="uiBadge uiBadge--warning">Закъсня: {summary?.late || 0}</span>
                <span className="uiBadge uiBadge--danger">Отсъства: {summary?.absent || 0}</span>
                <span className="uiBadge uiBadge--secondary">Извинен: {summary?.excused || 0}</span>
                <span className="uiBadge uiBadge--info">Процент: {summary?.attendance_rate_percent || 0}%</span>
              </div>
              {!summary?.total ? (
                <p className="parentPortalHighlightMuted" style={{ marginTop: 12 }}>
                  Още няма маркирани тренировки — процентът ще се появи след първото присъствие.
                </p>
              ) : null}
              {allAttendance.length === 0 ? (
                <EmptyState title="Няма записани присъствия" description="Ще се показват след маркиране от треньора." />
              ) : visibleAttendance.length === 0 ? (
                <EmptyState
                  title="Няма записи за избрания период"
                  description="Променете филтъра или изчакайте маркиране от треньора."
                />
              ) : (
                <div className="parentPortalCardList">
                  {visibleAttendance.map((row, idx) => (
                    <article key={`${row.date}-${idx}`} className="parentPortalSessionCard">
                      <div className="parentPortalSessionCardDate">{formatShortDate(row.date)}</div>
                      <div className="parentPortalSessionCardBody">
                        {row.team_name ? <div className="parentPortalSessionCardMeta">{row.team_name}</div> : null}
                        <span className={`uiBadge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Такси"
              subtitle={
                allPayments.length > 3
                  ? `Показани ${visiblePayments.length} от ${allPayments.length} месеца`
                  : "История на месечните такси"
              }
              actions={
                <PeriodFilterSelect
                  id="parent-fees-period"
                  value={feesPeriod}
                  onChange={setFeesPeriod}
                  options={PARENT_FEES_PERIOD_OPTIONS}
                />
              }
            >
              <div className="parentPortalDesktopTable parentPortalTableWrap">
                <table className="parentPortalTable">
                  <thead>
                    <tr>
                      <th>Месец</th>
                      <th>Сума</th>
                      <th>Платено</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((row) => (
                      <tr key={row.month_key}>
                        <td>{formatMonthKey(row.month_key)}</td>
                        <td>{row.paid ? formatMoney(row.amount) : "—"}</td>
                        <td>
                          <span className={`uiBadge ${row.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                            {row.paid ? "Да" : "Не"}
                          </span>
                        </td>
                        <td>{row.paid_at ? new Date(row.paid_at).toLocaleString("bg-BG") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="parentPortalCardList parentPortalMobileOnly">
                {visiblePayments.map((row) => (
                  <article key={row.month_key} className="parentPortalSessionCard">
                    <div className="parentPortalSessionCardDate">{formatMonthKey(row.month_key)}</div>
                    <div className="parentPortalSessionCardBody">
                      <span className={`uiBadge ${row.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                        {row.paid ? `Платено · ${formatMoney(row.amount)}` : "Неплатено"}
                      </span>
                      {row.paid_at ? (
                        <div className="parentPortalSessionCardMeta">
                          {new Date(row.paid_at).toLocaleDateString("bg-BG")}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </ParentPortalShell>
  );
}
