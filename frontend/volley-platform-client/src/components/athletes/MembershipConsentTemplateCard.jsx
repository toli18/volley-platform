import { useEffect, useState } from "react";

import { Button, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Конфиг на клубното заявление — само главен треньор (в Администрация БФВ).
 * По подразбиране е ИЗКЛЮЧЕНО — gate за родители не се прилага, докато не се активира.
 */
export default function MembershipConsentTemplateCard({ toast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [addressee, setAddressee] = useState("");
  const [body, setBody] = useState("");
  const [gdpr, setGdpr] = useState("");
  const [feeAmount, setFeeAmount] = useState("30");
  const [feeDueDay, setFeeDueDay] = useState("10");
  const [preview, setPreview] = useState(null);
  const [blankTab, setBlankTab] = useState("club");

  const load = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_MEMBERSHIP_CONSENT_TEMPLATE);
      const d = res.data || {};
      setEnabled(Boolean(d.enabled));
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

  const save = async (overrides = {}) => {
    try {
      setBusy(true);
      const nextEnabled = overrides.enabled !== undefined ? overrides.enabled : enabled;
      const res = await axiosInstance.put(API_PATHS.BVF_ADMIN_MEMBERSHIP_CONSENT_TEMPLATE, {
        enabled: nextEnabled,
        addressee_template: addressee,
        body_template: body,
        gdpr_template: gdpr,
        fee_amount: Number(feeAmount) || 30,
        fee_due_day: Number(feeDueDay) || 10,
      });
      setPreview(res.data);
      setEnabled(Boolean(res.data?.enabled));
      toast?.success(
        overrides.enabled === true
          ? "Заявлението е активирано — родителите ще го виждат при вход."
          : overrides.enabled === false
            ? "Заявлението е деактивирано — порталът работи без gate."
            : "Текстът на заявлението е записан.",
      );
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
      setEnabled(Boolean(d.enabled));
      setPreview(d);
      toast?.success("Възстановени са стандартните текстове (активацията не е променена).");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен reset."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="uiMuted" style={{ margin: 0 }}>Зареждане…</p>;
  }

  const clubName = preview?.club_name || "Име на клуба";
  const season = "2026 / 2027";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gap: 8,
          padding: 12,
          borderRadius: 10,
          border: `1px solid ${enabled ? "#86efac" : "#fcd34d"}`,
          background: enabled ? "#f0fdf4" : "#fffbeb",
        }}
      >
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              save({ enabled: next });
            }}
            style={{ marginTop: 3 }}
          />
          <span>
            Активирай клубното заявление за родителите
            <span style={{ display: "block", fontWeight: 500, fontSize: 12, color: "#475569", marginTop: 4 }}>
              {enabled
                ? "Включено: без подпис родителският портал показва само заявлението."
                : "Изключено (по подразбиране): нищо не се прилага за родители, докато не активираш."}
            </span>
          </span>
        </label>
      </div>

      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Един текст за целия клуб. Плейсхолдери: <code>{"{club_name}"}</code>, <code>{"{fee_amount}"}</code>,{" "}
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
        <Button type="button" size="sm" disabled={busy} onClick={() => save()}>
          Запази текста
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={resetDefaults}>
          Стандартни текстове
        </Button>
      </div>

      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 13 }}>Преглед на бланките</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {[
            { id: "club", label: "1. Клубно заявление" },
            { id: "f03", label: "2. Форма 0-3 (<14)" },
            { id: "f03a", label: "3. Форма 0-3 А (14+)" },
          ].map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={blankTab === t.id ? "primary" : "secondary"}
              onClick={() => setBlankTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            padding: 16,
            background: "#fff",
            fontSize: 13,
            lineHeight: 1.45,
            maxHeight: 480,
            overflow: "auto",
          }}
        >
          {blankTab === "club" ? (
            <ClubBlankPreview
              clubName={clubName}
              addressee={preview?.addressee}
              body={preview?.body_text}
              gdpr={preview?.gdpr_text}
              feeAmount={preview?.fee_amount ?? feeAmount}
              feeDueDay={preview?.fee_due_day ?? feeDueDay}
            />
          ) : null}
          {blankTab === "f03" ? <Form03BlankPreview clubName={clubName} season={season} /> : null}
          {blankTab === "f03a" ? <Form03ABlankPreview clubName={clubName} season={season} /> : null}
        </div>
        {blankTab !== "club" ? (
          <p className="uiMuted" style={{ margin: "8px 0 0", fontSize: 12 }}>
            Форма 0-3 / 0-3 А са за фаза 2 (изпращане от главния треньор). Тук е визуален макет на бланката.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FieldLine({ label, wide }) {
  return (
    <p style={{ margin: "6px 0", borderBottom: "1px dotted #94a3b8", minHeight: 22 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ display: "inline-block", minWidth: wide ? "70%" : 120 }}>&nbsp;</span>
    </p>
  );
}

function ClubBlankPreview({ clubName, addressee, body, gdpr, feeAmount, feeDueDay }) {
  return (
    <div>
      <p style={{ textAlign: "center", fontWeight: 800, fontSize: 18, textDecoration: "underline", marginTop: 0 }}>
        ЗАЯВЛЕНИЕ
      </p>
      <p style={{ fontWeight: 700, whiteSpace: "pre-wrap" }}>
        {addressee || `ДО УПРАВИТЕЛНИЯ СЪВЕТ НА СДРУЖЕНИЕ ВОЛЕЙБОЛЕН КЛУБ „${clubName}“`}
      </p>
      <FieldLine label="От: " wide />
      <FieldLine label="ЕГН: " />
      <FieldLine label="Адрес гр./с.: " wide />
      <FieldLine label="тел.: " />
      <p style={{ margin: "10px 0 4px" }}>в качеството си на родител /настойник/ на сина/дъщеря ми</p>
      <FieldLine label="" wide />
      <FieldLine label="ЕГН: " />
      <FieldLine label="Адрес гр./с.: " wide />
      <FieldLine label="тел.: " />
      <div style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
        {body ||
          `Желая синът/дъщерята ми да бъде приет/а като състезател във ${clubName}… Такса ${feeAmount} лв. до ${feeDueDay}-то число.`}
      </div>
      <p style={{ fontWeight: 700, marginTop: 16 }}>Съгласие за обработка на лични данни</p>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 120, overflow: "auto", color: "#334155" }}>
        {gdpr || "…"}
      </div>
      <p style={{ marginTop: 12 }}>☐ Съгласен/на съм с обработката на личните данни</p>
      <p>Дата: ______________ &nbsp;&nbsp; Подпис: ______________</p>
    </div>
  );
}

function Form03BlankPreview({ clubName, season }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 48, height: 48, border: "1px solid #94a3b8", borderRadius: 4, fontSize: 10, display: "grid", placeItems: "center", color: "#64748b" }}>
          БФВ
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Българска федерация по Волейбол</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Форма 0-3</span>
      </div>
      <p style={{ textAlign: "center", fontWeight: 800, fontSize: 18, margin: "16px 0" }}>ЗАЯВЛЕНИЕ</p>
      <p>Долуподписаните:</p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, marginBottom: 8, display: "flex", gap: 8 }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (родител 1)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <p style={{ textAlign: "center", margin: "4px 0" }}>и</p>
      <div style={{ border: "1px solid #cbd5e1", padding: 8, marginBottom: 8, display: "flex", gap: 8, background: "#f8fafc" }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (родител 2 — по желание)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <p>родители/настойници на:</p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, marginBottom: 12, display: "flex", gap: 8 }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (дете)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <p>
        с настоящото заявяваме, че желаем детето ни да бъде картотекирано в
      </p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, margin: "8px 0" }}>{clubName}</div>
      <p>
        за сезон <strong>20</strong> {season} <strong>г.</strong>
      </p>
      <p style={{ fontSize: 11, color: "#475569", marginTop: 12 }}>
        С подписване на настоящата форма /заявление декларирам, че съм запознат/а и се задължавам да спазвам устава,
        правилниците и наредбите на БФВ…
      </p>
      <p style={{ marginTop: 16 }}>Дата: ________ &nbsp; Град: ________</p>
      <p style={{ fontWeight: 700 }}>Родители/настойници:</p>
      <p>1. ______________ &nbsp;&nbsp; 2. ______________ <span style={{ color: "#94a3b8" }}>(по желание)</span></p>
    </div>
  );
}

function Form03ABlankPreview({ clubName, season }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 48, height: 48, border: "1px solid #94a3b8", borderRadius: 4, fontSize: 10, display: "grid", placeItems: "center", color: "#64748b" }}>
          БФВ
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Българска федерация по Волейбол</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Форма 0-3 А</span>
      </div>
      <p style={{ textAlign: "center", fontWeight: 800, fontSize: 18, margin: "16px 0" }}>ЗАЯВЛЕНИЕ</p>
      <p>Долуподписаният/ата:</p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, marginBottom: 8, display: "flex", gap: 8 }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (състезател 14+)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <p>със съгласието на родителите/попечителите си:</p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, marginBottom: 6, display: "flex", gap: 8 }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (родител 1)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <div style={{ border: "1px solid #cbd5e1", padding: 8, marginBottom: 12, display: "flex", gap: 8, background: "#f8fafc" }}>
        <span style={{ flex: 1, color: "#94a3b8" }}>три имена (родител 2 — по желание)</span>
        <span style={{ width: 140, color: "#94a3b8" }}>ЕГН:</span>
      </div>
      <p>с настоящото заявявам, че желая да бъда картотекиран/а в</p>
      <div style={{ border: "1px solid #94a3b8", padding: 8, margin: "8px 0" }}>{clubName}</div>
      <p>
        за сезон <strong>20</strong> {season} <strong>г.</strong>
      </p>
      <p style={{ fontSize: 11, color: "#475569", marginTop: 12 }}>
        С подписване на настоящата форма /заявление декларирам, че съм запознат/а и се задължавам да спазвам устава,
        правилниците и наредбите на БФВ…
      </p>
      <p style={{ marginTop: 16 }}>Дата: ________ &nbsp; Град: ________</p>
      <p>
        <strong>Състезател:</strong> ______________
      </p>
      <p style={{ fontWeight: 700 }}>Родители/попечители:</p>
      <p>1. ______________ &nbsp;&nbsp; 2. ______________ <span style={{ color: "#94a3b8" }}>(по желание)</span></p>
    </div>
  );
}
