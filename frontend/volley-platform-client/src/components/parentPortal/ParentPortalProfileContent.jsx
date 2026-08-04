import ParentPushPrompt from "./ParentPushPrompt";
import ParentScheduleViews from "./ParentScheduleViews";
import { ParentPortalTabPanel } from "./ParentPortalLayout";
import ParentCoachContact, { parentHasCoachContact } from "./ParentCoachContact";
import ParentPortalFeed from "./ParentPortalFeed";
import ParentDevelopmentSection from "./ParentDevelopmentSection";
import ParentAbsenceNoticeSection from "./ParentAbsenceNoticeSection";
import { IconCalendar, IconEuro } from "./parentPortalIcons";
import { Button, Card, EmptyState, Input } from "../ui";
import { formatMoney } from "../../utils/currency";
import { competitionKindLabel, isCompetitionEvent } from "../../utils/competitionKinds";
import { abbreviateTeamName } from "../../utils/parentPortalSchedule";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import {
  EventTypeChip,
  IconClock,
  IconLocation,
} from "./parentPortalIcons";
import {
  filterAttendanceByPeriod,
  formatCompetitionsMonthLabel,
  formatDaysUntil,
  formatFeeDueLabel,
  formatPaidAtBg,
  summarizeAttendanceRows,
} from "../../utils/parentPortalDates";

function HighlightEventBlock({ item, variant, onAckChange, formatDateBg }) {
  const isComp = variant === "competition" || isCompetitionEvent(item);
  const daysUntil = item ? formatDaysUntil(item.date) : null;
  if (!item) {
    return (
      <p className="parentPortalHighlightMuted parentPortalNextEventEmpty">
        {isComp ? "Няма предстоящо състезание." : "Няма предстояща тренировка."}
      </p>
    );
  }
  const changeClass = item.highlight_change ? " parentPortalNextEventBlock--change parentPortalNextEventBlock--ackBtn" : "";
  const handleAck = () => {
    if (!item.highlight_change || !onAckChange) return;
    onAckChange({ markerKey: item.change_marker_key || null, date: item.date });
  };
  return (
    <div
      role={item.highlight_change ? "button" : undefined}
      tabIndex={item.highlight_change ? 0 : undefined}
      onClick={item.highlight_change ? handleAck : undefined}
      onKeyDown={
        item.highlight_change
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleAck();
              }
            }
          : undefined
      }
      className={`parentPortalNextEventBlock${isComp ? " parentPortalNextEventBlock--competition" : ""}${changeClass}`}
    >
      <p className="parentPortalHighlightMetaRow">
        <EventTypeChip variant={isComp ? "competition" : "training"} label={isComp ? competitionKindLabel(item) : "Тренировка"} />
        {daysUntil ? <span className="parentPortalDaysUntil">{daysUntil}</span> : null}
      </p>
      <p className="parentPortalHighlightMain">{formatDateBg(item.date)}</p>
      <p className="parentPortalHighlightDetail parentPortalHighlightDetail--iconRow">
        <IconClock className="parentPortalInlineIcon" size={16} />
        <span>
          {item.start_time} – {item.end_time}
          {item.team_name ? (
            <span className="parentPortalHighlightTeam" title={item.team_name}>
              {" "}
              · {abbreviateTeamName(item.team_name)}
            </span>
          ) : null}
        </span>
      </p>
      {item.location ? (
        <p className="parentPortalHighlightDetail parentPortalHighlightDetail--iconRow" title={item.location}>
          <IconLocation className="parentPortalInlineIcon" size={16} />
          <span>{item.location}</span>
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
  return (
    <Input as="select" id={id} className="parentPortalPeriodSelect" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Период">
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Input>
  );
}

function FeeHighlightBody({
  currentFee,
  feeDueDay,
  feeCoach,
  formatMonthKey,
  formatMoney,
  formatPaidAtBg,
  formatFeeDueLabel,
}) {
  return (
    <>
      {currentFee?.paid ? (
        <>
          <p className="parentPortalHighlightMain">
            <span className="uiBadge uiBadge--success">Платена</span>
          </p>
          <p className="parentPortalHighlightDetail">
            {formatMoney(currentFee.amount)}
            {currentFee.paid_at ? ` · ${new Date(currentFee.paid_at).toLocaleDateString("bg-BG")}` : ""}
          </p>
          {currentFee.last_paid_at && currentFee.last_paid_month_key && currentFee.last_paid_month_key !== currentFee.month_key ? (
            <p className="parentPortalHighlightDetail parentPortalHighlightDetail--feeMeta">
              Последно плащане: {formatPaidAtBg(currentFee.last_paid_at)}
              {currentFee.last_paid_month_key ? ` (${formatMonthKey(currentFee.last_paid_month_key)})` : ""}
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
              {currentFee.last_paid_month_key ? ` (${formatMonthKey(currentFee.last_paid_month_key)})` : ""}
            </p>
          ) : null}
        </>
      )}
      {parentHasCoachContact(feeCoach) ? (
        <ParentCoachContact coach={feeCoach} className="parentPortalContactBox--fee" />
      ) : null}
    </>
  );
}

export default function ParentPortalProfileContent({
  profile,
  activeTab,
  isSession,
  token,
  scheduleRefreshKey,
  highlightDates,
  fetchScheduleMonth,
  formatMonthKey,
  formatDateBg,
  formatShortDate,
  onAckScheduleChange,
  onAckFeeHighlight,
  attendancePeriod,
  setAttendancePeriod,
  feesPeriod,
  setFeesPeriod,
  attendanceOptions,
  feesOptions,
  statusLabel,
  statusBadgeClass,
  onSwitchTab,
  onProfileRefresh,
}) {
  const currentFee = profile.current_month_fee;
  const feeCoach = profile.fee_coach || {};
  const attendanceSummary = profile.attendance_summary || {};
  const feeDueDay = currentFee?.due_day ?? profile.fee_due_day ?? 10;
  const scheduleMonthKey = profile.schedule_month_key || new Date().toISOString().slice(0, 7);
  const competitionsMonthLabel = formatCompetitionsMonthLabel(profile.competitions_this_month ?? 0, scheduleMonthKey);

  const allAttendance = profile.last_attendance ?? [];
  const allPayments = profile.monthly_payments ?? [];
  const visibleAttendance = filterAttendanceByPeriod(allAttendance, attendancePeriod);
  const visibleAttendanceSummary = summarizeAttendanceRows(visibleAttendance);
  const visiblePayments = allPayments.slice(0, Number(feesPeriod) || 3);

  const attendanceHomeParts = [];
  if (attendanceSummary.present) attendanceHomeParts.push(`${attendanceSummary.present} присъства`);
  if (attendanceSummary.late) attendanceHomeParts.push(`${attendanceSummary.late} закъсня`);
  if (attendanceSummary.absent) attendanceHomeParts.push(`${attendanceSummary.absent} отсъства`);

  const eventsBlock = (
    <section className="parentPortalHighlightCard parentPortalHighlightCard--schedule">
      <h2 className="parentPortalHighlightTitle parentPortalHighlightTitle--desktop">Следващи събития</h2>
      <div className="parentPortalNextEventsStack">
        <HighlightEventBlock item={profile.next_training} variant="training" onAckChange={onAckScheduleChange} formatDateBg={formatDateBg} />
        <div className="parentPortalNextEventDivider" role="presentation" />
        <HighlightEventBlock item={profile.next_competition} variant="competition" onAckChange={onAckScheduleChange} formatDateBg={formatDateBg} />
      </div>
      {competitionsMonthLabel ? (
        <p className="parentPortalCompetitionsMonth">
          <span className="uiBadge uiBadge--warning">{competitionsMonthLabel}</span>
        </p>
      ) : null}
    </section>
  );

  const feeBlock = (
    <section
      role={profile.fee_change_highlight ? "button" : undefined}
      tabIndex={profile.fee_change_highlight ? 0 : undefined}
      onClick={profile.fee_change_highlight ? onAckFeeHighlight : undefined}
      onKeyDown={
        profile.fee_change_highlight
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAckFeeHighlight();
              }
            }
          : undefined
      }
      className={`parentPortalHighlightCard ${currentFee?.paid ? "parentPortalHighlightCard--paid" : "parentPortalHighlightCard--unpaid"}${profile.fee_change_highlight ? " parentPortalHighlightCard--change parentPortalHighlightCard--ackBtn" : ""}`}
    >
      <h2 className="parentPortalHighlightTitle parentPortalHighlightTitle--desktop">Такса — {formatMonthKey(currentFee?.month_key)}</h2>
      <FeeHighlightBody
        currentFee={currentFee}
        feeDueDay={feeDueDay}
        feeCoach={feeCoach}
        formatMonthKey={formatMonthKey}
        formatMoney={formatMoney}
        formatPaidAtBg={formatPaidAtBg}
        formatFeeDueLabel={formatFeeDueLabel}
      />
    </section>
  );

  return (
    <>
      <ParentPortalTabPanel tabId="home" activeTab={activeTab}>
        <ParentPushPrompt isSession={isSession} legacyToken={isSession ? null : token} />

        <div className="parentPortalHomeStack">
          <Card title="Новини от треньора">
            <ParentPortalFeed items={profile.team_feed || []} />
          </Card>

          <Card title="Присъствие">
            {attendanceSummary.total ? (
              <>
                <p className="parentPortalAttendanceHomeStat">
                  <strong>{attendanceSummary.attendance_rate_percent}%</strong>
                  {attendanceHomeParts.length ? (
                    <span> · {attendanceHomeParts.join(", ")}</span>
                  ) : null}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => onSwitchTab?.("fees")}>
                  Пълен списък
                </Button>
              </>
            ) : (
              <>
                <p className="parentPortalHighlightMuted">
                  Още няма маркирани тренировки — процентът ще се появи след първото присъствие.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => onSwitchTab?.("fees")}>
                  Виж присъствие
                </Button>
              </>
            )}
          </Card>

          <ParentDevelopmentSection isSession={isSession} token={token} />

          {(profile.membership_consent?.has_signed || profile.carding_form?.has_signed) ? (
            <Card title="Документи">
              {profile.membership_consent?.has_signed ? (
                <>
                  <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
                    Клубно заявление — подписано
                    {profile.membership_consent.signed_at
                      ? ` на ${new Date(profile.membership_consent.signed_at).toLocaleDateString("bg-BG")}`
                      : ""}
                    .
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const path = isSession
                          ? API_PATHS.PARENT_PORTAL_MEMBERSHIP_CONSENT_PREVIEW_ME
                          : API_PATHS.PARENT_PORTAL_MEMBERSHIP_CONSENT_PREVIEW_TOKEN(token);
                        const res = await axiosInstance.get(path, { responseType: "blob" });
                        const url = URL.createObjectURL(res.data);
                        window.open(url, "_blank", "noopener,noreferrer");
                        setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Преглед заявление
                  </Button>
                </>
              ) : null}
              {profile.carding_form?.has_signed ? (
                <>
                  <p className="uiMuted" style={{ marginTop: 12, fontSize: 13 }}>
                    {profile.carding_form.form_kind === "03a" ? "Форма 0-3 А" : "Форма 0-3"} — сезон{" "}
                    {profile.carding_form.season_label || profile.carding_form.season_year}
                    {profile.carding_form.signed_at
                      ? ` · ${new Date(profile.carding_form.signed_at).toLocaleDateString("bg-BG")}`
                      : ""}
                    .
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const path = isSession
                          ? API_PATHS.PARENT_PORTAL_CARDING_FORM_PREVIEW_ME
                          : API_PATHS.PARENT_PORTAL_CARDING_FORM_PREVIEW_TOKEN(token);
                        const res = await axiosInstance.get(path, { responseType: "blob" });
                        const url = URL.createObjectURL(res.data);
                        window.open(url, "_blank", "noopener,noreferrer");
                        setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Преглед Форма 03
                  </Button>
                </>
              ) : null}
            </Card>
          ) : null}

          <Card title="Контакт с треньора">
            <ParentCoachContact coach={feeCoach} className="parentPortalContactBox--standalone" />
            {!parentHasCoachContact(feeCoach) ? (
              <p className="parentPortalHighlightMuted">Няма въведен телефон или контакт за треньора.</p>
            ) : null}
          </Card>

          <Card title="Предварително извинение">
            <ParentAbsenceNoticeSection
              notices={profile.absence_notices || []}
              isSession={isSession}
              token={token}
              onChanged={onProfileRefresh}
              formatShortDate={formatShortDate}
            />
          </Card>
        </div>

        <div className="parentPortalHighlightGrid">
          <details className="parentPortalDetails parentPortalHighlightFold" open>
            <summary className="parentPortalDetailsSummary parentPortalHighlightFoldSummary">
              <span className="parentPortalHighlightFoldLead">
                <IconCalendar className="parentPortalInlineIcon" size={20} />
                Следващи събития
              </span>
            </summary>
            <div className="parentPortalDetailsBody">{eventsBlock}</div>
          </details>

          <details className="parentPortalDetails parentPortalHighlightFold">
            <summary className="parentPortalDetailsSummary parentPortalHighlightFoldSummary">
              <span className="parentPortalHighlightFoldLead">
                <IconEuro className="parentPortalInlineIcon" size={20} />
                Такса — {formatMonthKey(currentFee?.month_key)}
                {profile.fee_change_highlight ? (
                  <span className="parentPortalUnreadDot parentPortalUnreadDot--inline" aria-hidden />
                ) : null}
              </span>
              <span className={`uiBadge ${currentFee?.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                {currentFee?.paid ? "Платена" : "Неплатена"}
              </span>
            </summary>
            <div className="parentPortalDetailsBody">{feeBlock}</div>
          </details>

          <div className="parentPortalHighlightDesktopOnly">{eventsBlock}</div>
          <div className="parentPortalHighlightDesktopOnly">{feeBlock}</div>
        </div>
      </ParentPortalTabPanel>

      <ParentPortalTabPanel tabId="schedule" activeTab={activeTab} className="parentPortalTabPanel--schedule">
        <section className="parentPortalScheduleSection">
          <Card title={`График — ${formatMonthKey(scheduleMonthKey)}`}>
            <ParentScheduleViews
              key={scheduleRefreshKey}
              token={isSession ? undefined : token}
              fetchScheduleMonth={isSession ? fetchScheduleMonth : undefined}
              initialItems={profile.monthly_schedule || []}
              scheduleMonthKey={profile.schedule_month_key}
              formatMonthKey={formatMonthKey}
              highlightDates={highlightDates}
              onAckScheduleChange={onAckScheduleChange}
            />
          </Card>
        </section>
      </ParentPortalTabPanel>

      <ParentPortalTabPanel tabId="fees" activeTab={activeTab}>
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
              <PeriodFilterSelect id="parent-attendance-period" value={attendancePeriod} onChange={setAttendancePeriod} options={attendanceOptions} />
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
              <EmptyState title="Няма записи за избрания период" description="Променете филтъра или изчакайте маркиране от треньора." />
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
              <PeriodFilterSelect id="parent-fees-period" value={feesPeriod} onChange={setFeesPeriod} options={feesOptions} />
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
                        ? new Date(row.paid_at).toLocaleDateString("bg-BG", { day: "numeric", month: "short", year: "numeric" })
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
              {profile.birth_year ? <span className="uiBadge">Година на раждане: {profile.birth_year}</span> : null}
              {(profile.teams || []).map((t) => (
                <span key={t} className="uiBadge uiBadge--info">
                  Отбор: {t}
                </span>
              ))}
              {!(profile.teams || []).length ? <span className="uiBadge">Няма активни отбори</span> : null}
              {profile.parent_name ? <span className="uiBadge">Родител: {profile.parent_name}</span> : null}
              {profile.parent_phone ? <span className="uiBadge">Телефон: {profile.parent_phone}</span> : null}
            </div>
            <ParentCoachContact coach={feeCoach} className="parentPortalContactBox--athleteDetails" />
          </div>
        </details>
      </ParentPortalTabPanel>
    </>
  );
}
