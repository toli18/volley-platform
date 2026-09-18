import { useEffect, useState } from "react";

import SignaturePad from "../parentPortal/SignaturePad";
import { Button, Input } from "../ui";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

export default function SchoolExcuseSettingsCard({ toast }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [annualEnabled, setAnnualEnabled] = useState(false);
  const [chairmanName, setChairmanName] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [annualBodyTemplate, setAnnualBodyTemplate] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [usesBundledSignature, setUsesBundledSignature] = useState(false);
  const [hasStamp, setHasStamp] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [sigInk, setSigInk] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.CLUB_SCHOOL_EXCUSE_SETTINGS);
      const d = res.data || {};
      setEnabled(Boolean(d.enabled));
      setAnnualEnabled(Boolean(d.annual_enabled));
      setChairmanName(d.chairman_name || "");
      setBodyTemplate(d.body_template || d.defaults?.body || "");
      setAnnualBodyTemplate(d.annual_body_template || d.defaults?.annual_body || "");
      setHasSignature(Boolean(d.has_signature));
      setUsesBundledSignature(Boolean(d.uses_bundled_signature));
      setHasStamp(Boolean(d.has_stamp));
      setSmtpConfigured(Boolean(d.smtp_configured));
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на настройките."));
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
      const nextAnnual = overrides.annual_enabled !== undefined ? overrides.annual_enabled : annualEnabled;
      await axiosInstance.put(API_PATHS.CLUB_SCHOOL_EXCUSE_SETTINGS, {
        enabled: nextEnabled,
        annual_enabled: nextAnnual,
        chairman_name: chairmanName.trim() || null,
        body_template: bodyTemplate,
        annual_body_template: annualBodyTemplate,
      });
      if (sigInk && !usesBundledSignature) {
        await axiosInstance.put(API_PATHS.CLUB_SCHOOL_EXCUSE_SIGNATURE, {
          signature_image: sigInk,
        });
        setHasSignature(true);
        setSigInk(null);
      }
      await load();
      toast?.success(
        overrides.enabled === true
          ? "Извинителните бележки за състезания са активирани."
          : overrides.annual_enabled === true
            ? "Годишната бележка за занималня е активирана."
            : overrides.enabled === false || overrides.annual_enabled === false
              ? "Настройката е обновена."
              : "Настройките са записани.",
      );
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const uploadStamp = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append("file", file);
      await axiosInstance.post(API_PATHS.CLUB_SCHOOL_EXCUSE_STAMP, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
      toast?.success("Печатът е качен.");
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно качване на печат."));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const openPreview = async (annual = false) => {
    try {
      setBusy(true);
      const path = annual ? API_PATHS.CLUB_SCHOOL_EXCUSE_ANNUAL_PREVIEW : API_PATHS.CLUB_SCHOOL_EXCUSE_PREVIEW;
      const res = await axiosInstance.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен преглед на PDF."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="uiMuted" style={{ margin: 0 }}>Зареждане…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
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
            Бележки за състезания
            <span style={{ display: "block", fontWeight: 500, fontSize: 12, color: "#475569", marginTop: 4 }}>
              PDF за всеки мач с потвърден пътуващ състав.
            </span>
          </span>
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          padding: 12,
          borderRadius: 10,
          border: `1px solid ${annualEnabled ? "#86efac" : "#fcd34d"}`,
          background: annualEnabled ? "#f0fdf4" : "#fffbeb",
        }}
      >
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={annualEnabled}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.checked;
              setAnnualEnabled(next);
              save({ annual_enabled: next });
            }}
            style={{ marginTop: 3 }}
          />
          <span>
            Годишна бележка за занималня
            <span style={{ display: "block", fontWeight: 500, fontSize: 12, color: "#475569", marginTop: 4 }}>
              Един PDF за цялата година — седмичен график от тренировките (без имейл в тази версия).
            </span>
          </span>
        </label>
      </div>

      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Подпис, печат и председател са общи за двата вида. PDF се генерира при изтегляне от родителя.
      </p>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Име на председателя</span>
        <Input
          placeholder="напр. Веско Митков Василев"
          value={chairmanName}
          disabled={busy}
          onChange={(e) => setChairmanName(e.target.value)}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Текст — състезание (молба)</span>
        <textarea
          className="uiInput"
          rows={8}
          value={bodyTemplate}
          disabled={busy}
          onChange={(e) => setBodyTemplate(e.target.value)}
        />
        <span className="uiMuted" style={{ fontSize: 11 }}>
          Плейсхолдери: <code>{"{student_name}"}</code>, <code>{"{student_class}"}</code>,{" "}
          <code>{"{period_from}"}</code>, <code>{"{period_to}"}</code>, <code>{"{event_description}"}</code>…
        </span>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Текст — занималня (годишна бележка)</span>
        <textarea
          className="uiInput"
          rows={12}
          value={annualBodyTemplate}
          disabled={busy}
          onChange={(e) => setAnnualBodyTemplate(e.target.value)}
        />
        <span className="uiMuted" style={{ fontSize: 11 }}>
          Плейсхолдери: <code>{"{student_name}"}</code>, <code>{"{student_class}"}</code>,{" "}
          <code>{"{sport}"}</code>, <code>{"{schedule_blocks}"}</code> (автоматично: дни + часове, по отбор при нужда).
        </span>
      </label>

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>
          Подпис на председателя {hasSignature ? "· записан" : "· липсва"}
        </p>
        {usesBundledSignature ? (
          <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
            За <strong>Троян</strong> се ползва официалният подпис на председателя от платформата (не canvas).
          </p>
        ) : (
          <SignaturePad label="Подпис" disabled={busy} onChange={setSigInk} />
        )}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          Печат на клуба {hasStamp ? "· качен" : "· липсва"}
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={uploadStamp} />
      </div>

      {!smtpConfigured ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
          Имейл „Изпрати на училище“ (само за състезания) изисква SMTP на сървъра.
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button type="button" size="sm" disabled={busy} onClick={() => save()}>
          Запази
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => openPreview(false)}>
          Преглед PDF — състезание
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => openPreview(true)}>
          Преглед PDF — занималня
        </Button>
      </div>
    </div>
  );
}
