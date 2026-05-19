import { useEffect, useRef, useState } from "react";

import { Button } from "../ui";
import {
  disableParentPushNotifications,
  enableParentPushNotifications,
  fetchParentPushStatus,
  pushSetupHint,
  pushSupported,
  sendParentPushTest,
} from "../../utils/parentPush";
import { markPushHintSeen, shouldAutoOpenPushHint } from "../../utils/parentPortalPushHint";
import { IconBell } from "./parentPortalIcons";

export default function ParentPushPrompt({ isSession, legacyToken }) {
  const [status, setStatus] = useState({ subscribed: false, push_available: false, loading: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [expanded, setExpanded] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!pushSupported()) {
        if (!cancelled) setStatus({ subscribed: false, push_available: false, loading: false });
        return;
      }
      const data = await fetchParentPushStatus(isSession, legacyToken);
      if (!cancelled) setStatus({ ...data, loading: false });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isSession, legacyToken]);

  useEffect(() => {
    if (status.loading || status.subscribed || autoOpenedRef.current) return;
    if (!shouldAutoOpenPushHint(isSession, legacyToken)) return;
    autoOpenedRef.current = true;
    setExpanded(true);
    markPushHintSeen(isSession, legacyToken);
  }, [status.loading, status.subscribed, isSession, legacyToken]);

  const setupHint = pushSetupHint();

  if (status.loading || !pushSupported()) return null;
  if (!status.push_available) return null;

  const onEnable = async () => {
    try {
      setBusy(true);
      setError("");
      await enableParentPushNotifications(isSession, legacyToken);
      setStatus((s) => ({ ...s, subscribed: true }));
    } catch (err) {
      setError(err?.message || "Неуспешно включване на известията.");
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    try {
      setBusy(true);
      setError("");
      await disableParentPushNotifications(isSession, legacyToken);
      setStatus((s) => ({ ...s, subscribed: false }));
    } catch (err) {
      setError(err?.message || "Неуспешно изключване.");
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    try {
      setBusy(true);
      setTestMsg("");
      setError("");
      const data = await sendParentPushTest(isSession, legacyToken);
      if (data.sent > 0) {
        setTestMsg("Тестовото известие е изпратено — проверете телефона.");
      } else {
        setError(
          data.errors?.[0] || "Изпращането не успя. Натиснете „Изключи“, после „Включи“ отново.",
        );
      }
    } catch (err) {
      setError(err?.message || "Тестът не успя.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="parentPortalDetails parentPortalPushDetails"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="parentPortalDetailsSummary parentPortalPushSummary">
        <span className="parentPortalPushSummaryLead">
          <IconBell className="parentPortalPushIconSvg" />
          <span>Известия на телефона</span>
        </span>
        <span className={`uiBadge ${status.subscribed ? "uiBadge--success" : "uiBadge--warning"}`}>
          {status.subscribed ? "Включени" : "Изключени"}
        </span>
      </summary>

      <div className="parentPortalDetailsBody parentPortalPushBody">
        {status.subscribed ? (
          <>
            <p className="parentPushPromptText">
              Ще получавате известие при отменена или променена тренировка, състезание или платена такса.
            </p>
            <div className="parentPortalPushActions">
              <Button type="button" size="sm" disabled={busy} onClick={onTest} block className="parentPortalTouchBtn">
                Тестово известие
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={onDisable}
                block
                className="parentPortalTouchBtn"
              >
                Изключи известията
              </Button>
            </div>
            {testMsg ? <p className="uiHint parentPushPromptHint">{testMsg}</p> : null}
          </>
        ) : (
          <>
            <p className="parentPushPromptText">
              Включете известия, за да научавате веднага при промяна или отмяна на тренировка.
            </p>
            {setupHint ? (
              <p className="uiHint parentPushPromptHint parentPushPromptHint--warn">{setupHint}</p>
            ) : null}
            <Button type="button" size="sm" disabled={busy} onClick={onEnable} block className="parentPortalTouchBtn">
              {busy ? "Моля, изчакайте..." : "Включи известия"}
            </Button>
          </>
        )}
        {error ? <p className="uiErrorText parentPushPromptError">{error}</p> : null}
        {!setupHint ? (
          <p className="uiHint parentPushPromptHint">
            На iPhone: Safari → Сподели → „Добави на началния екран“, после включете известия от иконата.
          </p>
        ) : null}
      </div>
    </details>
  );
}
