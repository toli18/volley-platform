import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { clearParentToken, getParentToken, parentLoginPath } from "../utils/parentAuth";
import ParentPortalBottomNav from "../components/parentPortal/ParentPortalBottomNav";
import ParentPortalLayout from "../components/parentPortal/ParentPortalLayout";
import ParentPortalProfileContent from "../components/parentPortal/ParentPortalProfileContent";
import ParentMembershipConsentGate from "../components/parentPortal/ParentMembershipConsentGate";
import ParentCardingFormGate from "../components/parentPortal/ParentCardingFormGate";
import { IconRefresh } from "../components/parentPortal/parentPortalIcons";
import { Button, Card, EmptyState } from "../components/ui";
import {
  ackParentPortalChange,
  patchProfileAfterScheduleAck,
} from "../utils/parentPortalAck";
import { consumeSwRefreshSearchParam, listenParentPortalRefresh } from "../utils/parentPortalRefresh";

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

export default function ParentPortal() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isSession = location.pathname === "/parent/portal";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [attendancePeriod, setAttendancePeriod] = useState("3");
  const [feesPeriod, setFeesPeriod] = useState("3");
  const [activeTab, setActiveTab] = useState("home");

  const highlightDates = useMemo(
    () => new Set(profile?.pending_schedule_dates || []),
    [profile?.pending_schedule_dates],
  );

  const fetchScheduleMonth = useCallback(async (mk) => {
    const res = await axiosInstance.get(API_PATHS.PARENT_PORTAL_ME_SCHEDULE, { params: { month: mk } });
    return res.data || [];
  }, []);

  const handleLogout = () => {
    clearParentToken();
    navigate(parentLoginPath(), { replace: true });
  };

  const loadProfile = useCallback(
    async ({ silent = false } = {}) => {
      if (isSession && !getParentToken()) {
        navigate(parentLoginPath(), { replace: true });
        return;
      }
      if (!isSession && !token) {
        setLoading(false);
        setError("Линкът е невалиден или изтекъл.");
        return;
      }

      try {
        if (!silent) setLoading(true);
        setRefreshing(true);
        setError("");
        const path = isSession ? API_PATHS.PARENT_PORTAL_ME : API_PATHS.PARENT_PORTAL_GET(token);
        const res = await axiosInstance.get(path);
        setProfile(res.data || null);
        setScheduleRefreshKey((k) => k + 1);
      } catch (err) {
        const detail = err?.response?.data?.detail;
        setError(
          typeof detail === "string"
            ? detail
            : isSession
              ? "Сесията е изтекла. Влезте отново."
              : "Линкът е невалиден или изтекъл.",
        );
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [isSession, token, navigate],
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return listenParentPortalRefresh(() => loadProfile({ silent: true }));
  }, [loadProfile]);

  useEffect(() => {
    const nextSearch = consumeSwRefreshSearchParam(location.search, () => loadProfile({ silent: true }));
    if (nextSearch === null) return;
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
  }, [location.search, location.pathname, loadProfile, navigate]);

  const handleAckScheduleChange = useCallback(
    async (payload) => {
      try {
        await ackParentPortalChange({ isSession, token, ...payload });
      } catch {
        /* ignore */
      }
      setProfile((prev) => patchProfileAfterScheduleAck(prev, payload));
    },
    [isSession, token],
  );

  const handleAckFeeHighlight = useCallback(async () => {
    if (!profile?.fee_change_highlight) return;
    try {
      await ackParentPortalChange({ isSession, token, scope: "fee" });
    } catch {
      /* ignore */
    }
    setProfile((prev) => (prev ? { ...prev, fee_change_highlight: false } : prev));
  }, [isSession, token, profile?.fee_change_highlight]);

  const hasUnreadChanges = useMemo(() => {
    if (!profile) return false;
    if (profile.fee_change_highlight) return true;
    if ((profile.pending_schedule_dates?.length ?? 0) > 0) return true;
    if (profile.monthly_schedule?.some((i) => i.highlight_change)) return true;
    if (profile.next_training?.highlight_change || profile.next_competition?.highlight_change) return true;
    return false;
  }, [profile]);

  const handleRefresh = () => loadProfile({ silent: Boolean(profile) });

  const headerActions = (
    <div className="parentPortalHeaderActions">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={`parentPortalRefreshBtn parentPortalHeaderRefresh${refreshing ? " is-spinning" : ""}`}
        onClick={handleRefresh}
        disabled={refreshing || loading}
        aria-label="Обнови страницата"
        title="Обнови данните"
      >
        <span className="parentPortalRefreshBtnWrap">
          <IconRefresh className="parentPortalRefreshIcon" size={18} />
          {hasUnreadChanges ? <span className="parentPortalUnreadDot" aria-label="Има нови промени" /> : null}
        </span>
        <span className="parentPortalHeaderRefreshLabel">{refreshing ? "Обновяване…" : "Обнови"}</span>
      </Button>
      {isSession ? (
        <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
          Изход
        </Button>
      ) : null}
    </div>
  );

  const needsConsent = Boolean(profile?.membership_consent?.needs_consent);
  const needsCardingForm = !needsConsent && Boolean(profile?.carding_form?.needs_form);
  const gated = needsConsent || needsCardingForm;

  const fab = profile && !gated ? (
    <button
      type="button"
      className={`parentPortalFab${refreshing ? " is-spinning" : ""}`}
      onClick={handleRefresh}
      disabled={refreshing || loading}
      aria-label="Обнови данните"
    >
      <IconRefresh size={24} />
      {hasUnreadChanges ? <span className="parentPortalUnreadDot parentPortalUnreadDot--fab" aria-hidden /> : null}
    </button>
  ) : null;

  const bottomNav = profile && !gated ? (
    <ParentPortalBottomNav activeTab={activeTab} onChange={setActiveTab} scheduleDot={hasUnreadChanges} />
  ) : null;

  return (
    <ParentPortalLayout
      headerActions={headerActions}
      fab={fab}
      bottomNav={bottomNav}
      clubLogoUrl={profile?.club_logo_url}
      clubName={profile?.club_name || profile?.fee_coach?.club_name}
    >
      <div className="parentPortalPage">
        <header className="parentPortalHero">
          <h1 className="parentPortalHeroTitle">{profile ? profile.athlete_name : "Родителски профил"}</h1>
          <p className="parentPortalHeroSub">
            {needsConsent
              ? "Необходимо е клубно заявление"
              : needsCardingForm
                ? "Необходима е Форма 03 / 03-А за картотекиране"
                : "Присъствие, график и месечни такси"}
          </p>
        </header>

        {loading ? (
          <Card title="Зареждане...">
            <p>Моля, изчакай...</p>
          </Card>
        ) : null}

        {!loading && error ? <EmptyState title="Достъпът е отказан" description={error} /> : null}

        {!loading && !error && profile && needsConsent ? (
          <ParentMembershipConsentGate
            isSession={isSession}
            token={token}
            onSigned={() => loadProfile({ silent: false })}
          />
        ) : null}

        {!loading && !error && profile && needsCardingForm ? (
          <ParentCardingFormGate
            isSession={isSession}
            token={token}
            onSigned={() => loadProfile({ silent: false })}
          />
        ) : null}

        {!loading && !error && profile && !gated ? (
          <ParentPortalProfileContent
            profile={profile}
            activeTab={activeTab}
            isSession={isSession}
            token={token}
            scheduleRefreshKey={scheduleRefreshKey}
            highlightDates={highlightDates}
            fetchScheduleMonth={fetchScheduleMonth}
            formatMonthKey={formatMonthKey}
            formatDateBg={formatDateBg}
            formatShortDate={formatShortDate}
            onAckScheduleChange={handleAckScheduleChange}
            onAckFeeHighlight={handleAckFeeHighlight}
            attendancePeriod={attendancePeriod}
            setAttendancePeriod={setAttendancePeriod}
            feesPeriod={feesPeriod}
            setFeesPeriod={setFeesPeriod}
            attendanceOptions={PARENT_ATTENDANCE_PERIOD_OPTIONS}
            feesOptions={PARENT_FEES_PERIOD_OPTIONS}
            statusLabel={statusLabel}
            statusBadgeClass={statusBadgeClass}
            onSwitchTab={setActiveTab}
            onProfileRefresh={() => loadProfile({ silent: true })}
          />
        ) : null}
      </div>
    </ParentPortalLayout>
  );
}
