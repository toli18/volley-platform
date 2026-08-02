import { useEffect, useState } from "react";

import { Card } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import MembershipConsentLiveForm from "./MembershipConsentLiveForm";

/**
 * Gate форма — родител попълва и подписва клубното заявление.
 */
export default function ParentMembershipConsentGate({ isSession, token, onSigned }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formMeta, setFormMeta] = useState(null);
  const [initialFields, setInitialFields] = useState(null);

  const path = isSession
    ? API_PATHS.PARENT_PORTAL_MEMBERSHIP_CONSENT_ME
    : API_PATHS.PARENT_PORTAL_MEMBERSHIP_CONSENT_TOKEN(token);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(path);
        if (cancelled) return;
        const d = res.data || {};
        setFormMeta(d);
        const pre = d.prefill || {};
        setInitialFields({
          parent_full_name: pre.parent_full_name || "",
          parent_phone: pre.parent_phone || "",
          child_full_name: pre.child_full_name || "",
          child_egn: pre.child_egn || "",
          child_phone: pre.child_phone || "",
        });
      } catch (err) {
        if (!cancelled) setError(normalizeError(err, "Неуспешно зареждане на заявлението."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const handleSubmit = async (payload) => {
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(path, payload);
      onSigned?.();
    } catch (err) {
      setError(normalizeError(err, "Неуспешен подпис."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card title="Заявление">
        <p>Зареждане…</p>
      </Card>
    );
  }

  if (error && !formMeta) {
    return (
      <Card title="Заявление">
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </Card>
    );
  }

  return (
    <MembershipConsentLiveForm
      mode="live"
      meta={formMeta}
      initialFields={initialFields}
      busy={busy}
      error={error}
      onSubmit={handleSubmit}
    />
  );
}
