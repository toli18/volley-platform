import { useState } from "react";

import { Button, Card } from "../ui";
import SignaturePad from "./SignaturePad";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Допълва САМО подписа на родител 2 върху вече записана Форма 0-3.
 * Не пипа подписа на родител 1 / състезателя.
 */
export default function ParentCardingParent2Gate({ isSession, token, profile, onSigned }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sig, setSig] = useState(null);

  const cf = profile?.carding_form || {};
  const parent2Name = cf.parent2_full_name || "родител 2";

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!sig) {
      setError("Нужен е екранен подпис на родител 2.");
      return;
    }
    const path = isSession
      ? API_PATHS.PARENT_PORTAL_CARDING_PARENT2_ME
      : API_PATHS.PARENT_PORTAL_CARDING_PARENT2_TOKEN(token);
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(path, {
        signature_parent2_image: sig,
        signature_parent2: parent2Name,
      });
      onSigned?.();
    } catch (err) {
      setError(normalizeError(err, "Неуспешен запис на подписа."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Липсва подпис на родител 2">
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
          Форма 0-3 за {profile?.athlete_name || "състезателя"} вече е подписана от{" "}
          <strong>родител 1</strong>. СЕК изисква и двамата родители да се подпишат.
          Добавете само подписа на <strong>{parent2Name}</strong> — другите подписи се запазват.
        </p>
        {cf.season_label ? (
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Сезон {cf.season_label}
            {cf.club_name ? ` · ${cf.club_name}` : ""}
          </p>
        ) : null}
        <SignaturePad label={`Екранен подпис — ${parent2Name}`} required disabled={busy} onChange={setSig} />
        {error ? <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Запис…" : "Добави подпис на родител 2"}
        </Button>
      </form>
    </Card>
  );
}
