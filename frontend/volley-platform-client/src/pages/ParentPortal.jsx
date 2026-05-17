import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import ParentScheduleViews from "../components/parentPortal/ParentScheduleViews";
import { Card, EmptyState, Input } from "../components/ui";
import { formatMoney } from "../utils/currency";
import { competitionKindLabel, isCompetitionEvent } from "../utils/competitionKinds";
import { abbreviateTeamName } from "../utils/parentPortalSchedule";
import {
  filterAttendanceByPeriod,
  formatCompetitionsMonthLabel,
  formatDaysUntil,
  formatFeeDueLabel,
  formatPaidAtBg,
  summarizeAttendanceRows,
} from "../utils/parentPortalDates";

const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

const statusLabel = (value, isCancelled) => {
  if (isCancelled || value === "cancelled") return "Отменена";
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusBadgeClass = (value, isCancelled) => {
  if (isCancelled || value === "cancelled") return "uiBadge--secondary";
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
      <p className="parentPortalHighlightMetaRow">
        <span className={`uiBadge${isComp ? " uiBadge--warning" : " uiBadge--info"}`}>
          {isComp ? competitionKindLabel(item) : "Тренировка"}
        </span>
        {daysUntil ? <span className="parentPortalDaysUntil">{daysUntil}</span> : null}
      </p>
      <p className="parentPortalHighlightMain">{formatDateBg(item.date)}</p>
      <p className="parentPortalHighlightDetail">
        <span className="uiBadge uiBadge--secondary">Час</span>{" "}
        {item.start_time} – {item.end_time}
        {item.team_name ? (
          <span className="parentPortalHighlightTeam" title={item.team_name}>
            {" "}
            · {abbreviateTeamName(item.team_name)}
          </span>
        ) : null}
      </p>
      {item.location ? (
        <p className="parentPortalHighlightDetail parentPortalHighlightDetail--location" title={item.location}>
          <span className="uiBadge uiBadge--secondary">Място</span> {item.location}
        </p>
      ) : null}
    </div>
  );
}

function ParentAgendaRecord({ date, time, meta, metaTitle, badge, badgeClass, cancelled }) {
  return (
    <article className={`parentPortalAgendaRecord${cancelled ? " is-cancelled" : ""}`}>
      <span className="parentPortalAgendaRecordDate">{date}</span>
      {time ? <span className="parentPortalAgendaRecordTime">{time}</span> : null}
      {meta ? (
        <span className="parentPortalAgendaRecordMeta" title={metaTitle || meta}>
          {meta}
        </span>
      ) : null}
      <span className={`uiBadge ${badgeClass}`}>{badge}</span>
    </article>
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
  const scheduleMonthKey = profile?.schedule_month_key || new Date().toISOString().slice(0, 7);
  const competitionsMonthLabel = formatCompetitionsMonthLabel(
    profile?.competitions_this_month ?? 0,
    scheduleMonthKey,
  );
  const feeDueDay = currentFee?.due_day ?? profile?.fee_due_day ?? 10;

  const allAttendance = profile?.last_attendance ?? [];
  const allPayments = profile?.monthly_payments ?? [];

  const visibleAttendance = useMemo(
    () => filterAttendanceByPeriod(allAttendance, attendancePeriod),
    [allAttendance, attendancePeriod],
  );

  const visibleAttendanceSummary = useMemo(
    () => summarizeAttendanceRows(visibleAttendance),
    [visibleAttendance],
  );

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
                    <span className="uiBadge uiBadge--warning">{competitionsMonthLabel}</span>
                  </p>
                ) : null}
              </section>

              <section className={`parentPortalHighlightCard ${currentFee?.paid ? "parentPortalHighlightCard--paid" : "parentPortalHighlightCard--unpaid"}`}>
                <h2 className="parentPortalHighlightTitle">Такса — {formatMonthKey(currentFee?.month_key)}</h2>
                {currentFee?.paid ? (
                  <>
                    <p className="parentPortalHighlightMain">
                      <span className="uiBadge uiBadge--success">Платена</span>
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
                      <span className="uiBadge uiBadge--danger">Неплатена</span>
                    </p>
                    <p className="parentPortalHighlightDetail parentPortalHighlightDetail--feeDue">
                      <span className="uiBadge uiBadge--warning">Срок</span> {formatFeeDueLabel(feeDueDay, currentFee?.month_key)}
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
                    <div className="parentPortalContactLabel">Контакт</div>
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

            <section className="parentPortalScheduleSection">
              <Card title={`График — ${formatMonthKey(profile.schedule_month_key || new Date().toISOString().slice(0, 7))}`}>
                <ParentScheduleViews
                  token={token}
                  initialItems={profile.monthly_schedule || []}
                  scheduleMonthKey={profile.schedule_month_key}
                  formatMonthKey={formatMonthKey}
                />
              </Card>
            </section>

            <div className="parentPortalLowerGrid">
            <Card
              title="Присъствие"
              subtitle={
                attendancePeriod === "30d"
                  ? `Показани ${visibleAttendance.length} записа (последните 30 дни)`
                  : visibleAttendance.length !== allAttendance.length
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
                <span className="uiBadge uiBadge--success">Присъства: {visibleAttendanceSummary.present}</span>
                <span className="uiBadge uiBadge--warning">Закъсня: {visibleAttendanceSummary.late}</span>
                <span className="uiBadge uiBadge--danger">Отсъства: {visibleAttendanceSummary.absent}</span>
                <span className="uiBadge uiBadge--secondary">Извинен: {visibleAttendanceSummary.excused}</span>
                <span className="uiBadge uiBadge--info">Процент: {visibleAttendanceSummary.attendance_rate_percent}%</span>
              </div>
              {!visibleAttendanceSummary.total ? (
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
                <div className="parentPortalAgendaRecords">
                  {visibleAttendance.map((row, idx) => (
                    <ParentAgendaRecord
                      key={`${row.date}-${row.team_id || row.team_name || idx}`}
                      date={formatShortDate(row.date)}
                      meta={row.team_name ? abbreviateTeamName(row.team_name) : null}
                      metaTitle={row.team_name || undefined}
                      badge={statusLabel(row.status, row.is_cancelled)}
                      badgeClass={statusBadgeClass(row.status, row.is_cancelled)}
                      cancelled={row.is_cancelled}
                    />
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
              {visiblePayments.length === 0 ? (
                <EmptyState title="Няма записани такси" description="Историята ще се появи след първото плащане." />
              ) : (
                <div className="parentPortalAgendaRecords">
                  {visiblePayments.map((row) => (
                    <ParentAgendaRecord
                      key={row.month_key}
                      date={formatMonthKey(row.month_key)}
                      time={row.paid ? formatMoney(row.amount) : "—"}
                      meta={
                        row.paid_at
                          ? new Date(row.paid_at).toLocaleDateString("bg-BG", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : null
                      }
                      badge={row.paid ? "Платено" : "Неплатено"}
                      badgeClass={row.paid ? "uiBadge--success" : "uiBadge--danger"}
                    />
                  ))}
                </div>
              )}
            </Card>
            </div>

            <details className="parentPortalDetails">
              <summary className="parentPortalDetailsSummary">Данни за състезателя</summary>
              <div className="parentPortalDetailsBody">
                <div className="parentPortalInfoGrid">
                  {profile.birth_year ? (
                    <span className="uiBadge">Година на раждане: {profile.birth_year}</span>
                  ) : null}
                  {(profile.teams || []).map((t) => (
                    <span key={t} className="uiBadge uiBadge--info">
                      Отбор: {t}
                    </span>
                  ))}
                  {!(profile.teams || []).length ? (
                    <span className="uiBadge">Няма активни отбори</span>
                  ) : null}
                  {profile.parent_name ? <span className="uiBadge">Родител: {profile.parent_name}</span> : null}
                  {profile.parent_phone ? <span className="uiBadge">Телефон: {profile.parent_phone}</span> : null}
                </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </ParentPortalShell>
  );
}
