import { useEffect, useState } from "react";

import { Button, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Конфиг на клубното заявление — само главен треньор (в Администрация БФВ).
 */
export default function MembershipConsentTemplateCard({ toast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addressee, setAddressee] = useState("");
  const [body, setBody] = useState("");
  const [gdpr, setGdpr] = useState("");
  const [feeAmount, setFeeAmount] = useState("30");
  const [feeDueDay, setFeeDueDay] = useState("10");
  const [preview, setPreview] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_MEMBERSHIP_CONSENT_TEMPLATE);
      const d = res.data || {};
      setAddressee(d.addressee_template || d.defaults?.addressee || "");
      setBody(d.body_template || d.defaults?.body || "");
      setGdpr(d.gdpr_template || d.defaults?.gdpr || "");
      setFeeAmount(String(d.fee_amount ?? d.defaults?.fee_amount ?? 30));
      setFeeDueDay(String(d.fee_due_day ?? d.defaults?.fee_due_day ?? 10));
      setPreview(d);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на заявлението."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.BVF_ADMIN_MEMBERSHIP_CONSENT_TEMPLATE, {
        addressee_template: addressee,
        body_template: body,
        gdpr_template: gdpr,
        fee_amount: Number(feeAmount) || 30,
        fee_due_day: Number(feeDueDay) || 10,
      });
      setPreview(res.data);
      toast?.success("Текстът на заявлението е записан.");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.BVF_ADMIN_MEMBERSHIP_CONSENT_TEMPLATE, {
        reset_to_defaults: true,
      });
      const d = res.data || {};
      setAddressee(d.defaults?.addressee || "");
      setBody(d.defaults?.body || "");
      setGdpr(d.defaults?.gdpr || "");
      setFeeAmount(String(d.defaults?.fee_amount ?? 30));
      setFeeDueDay(String(d.defaults?.fee_due_day ?? 10));
      setPreview(d);
      toast?.success("Възстановени са стандартните текстове.");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен reset."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="uiMuted" style={{ margin: 0 }}>Зареждане…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Един текст за целия клуб. Родителите го виждат при първи вход и подписват веднъж.
        Плейсхолдери: <code>{"{club_name}"}</code>, <code>{"{fee_amount}"}</code>,{" "}
        <code>{"{fee_due_day}"}</code>.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Месечна такса (лв.)</span>
          <Input value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} style={{ width: 100 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Срок (ден от месеца)</span>
          <Input value={feeDueDay} onChange={(e) => setFeeDueDay(e.target.value)} style={{ width: 100 }} />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Обръщение</span>
        <textarea className="uiInput" rows={2} value={addressee} onChange={(e) => setAddressee(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Текст на заявлението</span>
        <textarea className="uiInput" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Съгласие за лични данни (GDPR)</span>
        <textarea className="uiInput" rows={10} value={gdpr} onChange={(e) => setGdpr(e.target.value)} />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          Запази
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={resetDefaults}>
          Стандартни текстове
        </Button>
      </div>

      {preview?.addressee ? (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Преглед (попълнени плейсхолдери)</summary>
          <div style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap", color: "#334155" }}>
            <p style={{ fontWeight: 700 }}>{preview.addressee}</p>
            <p>{preview.body_text}</p>
            <p style={{ marginTop: 12, fontWeight: 700 }}>Лични данни</p>
            <p>{preview.gdpr_text}</p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
