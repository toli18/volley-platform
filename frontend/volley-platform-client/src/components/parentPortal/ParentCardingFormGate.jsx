import { useEffect, useState } from "react";

import { Card } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import CardingFormLiveForm from "./CardingFormLiveForm";

/**
 * Gate — родител попълва Форма 03 / 03-А след отваряне на сезона от главния треньор.
 */
export default function ParentCardingFormGate({ isSession, token, onSigned }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formMeta, setFormMeta] = useState(null);
  const [initialFields, setInitialFields] = useState(null);

  const path = isSession
    ? API_PATHS.PARENT_PORTAL_CARDING_FORM_ME
    : API_PATHS.PARENT_PORTAL_CARDING_FORM_TOKEN(token);

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
          parent1_full_name: pre.parent1_full_name || "",
          parent1_egn: pre.parent1_egn || "",
          parent2_full_name: pre.parent2_full_name || "",
          parent2_egn: pre.parent2_egn || "",
          athlete_first_name: pre.athlete_first_name || "",
          athlete_middle_name: pre.athlete_middle_name || "",
          athlete_last_name: pre.athlete_last_name || "",
          athlete_egn: pre.athlete_egn || "",
          city: pre.city || "",
        });
      } catch (err) {
        if (!cancelled) setError(normalizeError(err, "Неуспешно зареждане на Форма 03."));
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
      setError(normalizeError(err, "Неуспешен подпис на Форма 03."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card title="Форма 03">
        <p>Зареждане…</p>
      </Card>
    );
  }

  if (error && !formMeta) {
    return (
      <Card title="Форма 03">
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </Card>
    );
  }

  return (
    <Card title={formMeta?.form_kind === "03a" ? "Форма 0-3 А" : "Форма 0-3"}>
      <CardingFormLiveForm
        meta={formMeta}
        initialFields={initialFields}
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
