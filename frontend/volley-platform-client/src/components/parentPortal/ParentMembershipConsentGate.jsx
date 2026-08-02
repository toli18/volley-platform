import { useEffect, useState } from "react";

import { Button, Card, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Gate форма — родител попълва и подписва клубното заявление.
 */
export default function ParentMembershipConsentGate({ isSession, token, onSigned }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formMeta, setFormMeta] = useState(null);
  const [fields, setFields] = useState({
    parent_full_name: "",
    parent_egn: "",
    parent_address: "",
    parent_phone: "",
    child_full_name: "",
    child_egn: "",
    child_address: "",
    child_phone: "",
    gdpr_accepted: false,
    signature_name: "",
  });

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
        setFields((prev) => ({
          ...prev,
          parent_full_name: pre.parent_full_name || "",
          parent_phone: pre.parent_phone || "",
          child_full_name: pre.child_full_name || "",
          child_egn: pre.child_egn || "",
          child_phone: pre.child_phone || "",
        }));
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

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!fields.gdpr_accepted) {
      setError("Моля, потвърдете съгласието за обработка на личните данни.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(path, {
        ...fields,
        parent_egn: String(fields.parent_egn || "").replace(/\D/g, ""),
        child_egn: String(fields.child_egn || "").replace(/\D/g, ""),
      });
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
    return <Card title="Заявление"><p style={{ color: "#b91c1c" }}>{error}</p></Card>;
  }

  return (
    <Card title="Заявление за прием">
      <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
        Преди да ползвате портала е необходимо да попълните и подпишете заявлението към клуба.
      </p>
      {formMeta?.addressee ? (
        <p style={{ fontWeight: 700, fontSize: 14, whiteSpace: "pre-wrap" }}>{formMeta.addressee}</p>
      ) : null}

      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Данни на родителя / настойника</h3>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Три имена</span>
          <Input
            required
            value={fields.parent_full_name}
            onChange={(e) => setField("parent_full_name", e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН</span>
          <Input
            required
            inputMode="numeric"
            maxLength={10}
            value={fields.parent_egn}
            onChange={(e) => setField("parent_egn", e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Адрес</span>
          <Input
            required
            value={fields.parent_address}
            onChange={(e) => setField("parent_address", e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Телефон</span>
          <Input
            required
            value={fields.parent_phone}
            onChange={(e) => setField("parent_phone", e.target.value)}
          />
        </label>

        <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Данни на детето / състезателя</h3>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Три имена</span>
          <Input
            required
            value={fields.child_full_name}
            onChange={(e) => setField("child_full_name", e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН</span>
          <Input
            required
            inputMode="numeric"
            maxLength={10}
            value={fields.child_egn}
            onChange={(e) => setField("child_egn", e.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Адрес (по желание)</span>
          <Input value={fields.child_address} onChange={(e) => setField("child_address", e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Телефон (по желание)</span>
          <Input value={fields.child_phone} onChange={(e) => setField("child_phone", e.target.value)} />
        </label>

        {formMeta?.body_text ? (
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.45,
              padding: 12,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            {formMeta.body_text}
          </div>
        ) : null}

        <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Лични данни</h3>
        {formMeta?.gdpr_text ? (
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              lineHeight: 1.4,
              maxHeight: 220,
              overflow: "auto",
              padding: 12,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            {formMeta.gdpr_text}
          </div>
        ) : null}

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={fields.gdpr_accepted}
            onChange={(e) => setField("gdpr_accepted", e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>Съгласен/на съм с обработката на личните данни, описана по-горе.</span>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Подпис (име и фамилия)</span>
          <Input
            required
            value={fields.signature_name}
            onChange={(e) => setField("signature_name", e.target.value)}
            placeholder="Както е в личната карта"
          />
        </label>

        {error ? <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p> : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Запис…" : "Подпиши заявлението"}
        </Button>
      </form>
    </Card>
  );
}
