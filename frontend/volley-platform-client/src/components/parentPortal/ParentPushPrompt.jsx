import { useEffect, useState } from "react";

import { Button, Card } from "../ui";
import {
  disableParentPushNotifications,
  enableParentPushNotifications,
  fetchParentPushStatus,
  pushSupported,
} from "../../utils/parentPush";

export default function ParentPushPrompt({ isSession, legacyToken }) {
  const [status, setStatus] = useState({ subscribed: false, push_available: false, loading: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Card title="Известия на телефона">
      {status.subscribed ? (
        <>
          <p className="parentPushPromptText">
            Ще получавате известие при отменена или променена тренировка (като от Facebook).
          </p>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onDisable}>
            Изключи известията
          </Button>
        </>
      ) : (
        <>
          <p className="parentPushPromptText">
            Включете известия, за да научавате веднага при промяна или отмяна на тренировка.
          </p>
          <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
            {busy ? "Моля, изчакайте..." : "Включи известия"}
          </Button>
        </>
      )}
      {error ? <p className="uiErrorText parentPushPromptError">{error}</p> : null}
      <p className="uiHint parentPushPromptHint">
        На iPhone: отворете в Safari и при нужда „Добави на началния екран“, след това разрешете известията.
      </p>
    </Card>
  );
}
