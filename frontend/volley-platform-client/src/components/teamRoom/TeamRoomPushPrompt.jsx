import { useEffect, useRef, useState } from "react";

import { Button } from "../ui";
import { IconBell } from "../parentPortal/parentPortalIcons";
import PushIosSetupCard from "../shared/PushIosSetupCard";
import {
  disableTeamRoomPushNotifications,
  enableTeamRoomPushNotifications,
  fetchTeamRoomPushStatus,
  pushSetupHint,
  pushSupported,
  sendTeamRoomPushTest,
} from "../../utils/teamRoomPush";
import { isIosDevice, isStandalonePwa } from "../../utils/parentPush";
import { markTeamRoomPushHintSeen, shouldAutoOpenTeamRoomPushHint } from "../../utils/teamRoomPortalPushHint";

function mapPushError(raw) {
  const msg = String(raw || "");
  if (/VAPID|not configured/i.test(msg)) {
    return "Известията не са конфигурирани на сървъра (липсват VAPID ключове).";
  }
  return msg || "Неуспешна операция с известията.";
}

export default function TeamRoomPushPrompt() {
  const [status, setStatus] = useState({ subscribed: false, push_available: false, loading: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [expanded, setExpanded] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setStatus({ subscribed: false, push_available: false, loading: false });
        return;
      }
      const data = await fetchTeamRoomPushStatus();
      if (!cancelled) setStatus({ ...data, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status.loading || status.subscribed || autoOpenedRef.current) return;
    const needsIosHelp = isIosDevice() && !isStandalonePwa();
    if (!needsIosHelp && !shouldAutoOpenTeamRoomPushHint()) return;
    autoOpenedRef.current = true;
    setExpanded(true);
    markTeamRoomPushHintSeen();
  }, [status.loading, status.subscribed]);

  const setupHint = pushSetupHint();
  if (status.loading) return null;

  if (!pushSupported()) {
    return (
      <div className="parentPortalDetails parentPortalPushDetails parentPortalPushDetails--static">
        <p className="parentPushPromptText" style={{ margin: 0 }}>
          Този браузър не поддържа известия. На iPhone ползвайте Safari + икона на началния екран.
        </p>
      </div>
    );
  }

  if (!status.push_available) {
    return (
      <div className="parentPortalDetails parentPortalPushDetails parentPortalPushDetails--static">
        <p className="parentPushPromptText" style={{ margin: 0 }}>
          Известията още не са включени на сървъра (липсват VAPID ключове). След настройка тук ще можете да ги
          активирате и да изпратите тест.
        </p>
      </div>
    );
  }

  const onEnable = async () => {
    try {
      setBusy(true);
      setError("");
      await enableTeamRoomPushNotifications();
      setStatus((s) => ({ ...s, subscribed: true }));
      setTestMsg("Включени. Натиснете „Тестово известие“, за да проверите телефона.");
    } catch (err) {
      setError(mapPushError(err?.message) || "Неуспешно включване на известията.");
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    try {
      setBusy(true);
      setError("");
      await disableTeamRoomPushNotifications();
      setStatus((s) => ({ ...s, subscribed: false }));
      setTestMsg("");
    } catch (err) {
      setError(mapPushError(err?.message) || "Неуспешно изключване.");
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    try {
      setBusy(true);
      setTestMsg("");
      setError("");
      const data = await sendTeamRoomPushTest();
      if (data.sent > 0) {
        setTestMsg("Тестовото известие е изпратено — проверете телефона (и центъра за известия).");
      } else {
        setError(mapPushError(data.errors?.[0]) || "Изпращането не успя.");
      }
    } catch (err) {
      setError(mapPushError(err?.message) || "Тестът не успя.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="parentPortalDetails parentPortalPushDetails teamRoomPushDetails"
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
        <PushIosSetupCard />
        {status.subscribed ? (
          <>
            <p className="parentPushPromptText">
              Получавате известия за график, такси, новини и <strong>чат</strong> в отборната стая.
            </p>
            <div className="parentPortalPushActions">
              <Button type="button" size="sm" disabled={busy} onClick={onTest} block className="parentPortalTouchBtn">
                Тестово известие
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onDisable} block className="parentPortalTouchBtn">
                Изключи известията
              </Button>
            </div>
            {testMsg ? <p className="uiHint parentPushPromptHint">{testMsg}</p> : null}
          </>
        ) : (
          <>
            <p className="parentPushPromptText">
              Включете известия за график, новини, такси и чат. После изпратете тестово известие.
            </p>
            {setupHint ? <p className="uiHint parentPushPromptHint parentPushPromptHint--warn">{setupHint}</p> : null}
            <Button type="button" size="sm" disabled={busy} onClick={onEnable} block className="parentPortalTouchBtn">
              {busy ? "Моля, изчакайте..." : "Включи известия"}
            </Button>
          </>
        )}
        {error ? <p className="uiErrorText parentPushPromptError">{error}</p> : null}
      </div>
    </details>
  );
}
