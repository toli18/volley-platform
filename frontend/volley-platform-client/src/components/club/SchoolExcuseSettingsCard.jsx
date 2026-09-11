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
  const [chairmanName, setChairmanName] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [hasStamp, setHasStamp] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [sigInk, setSigInk] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.CLUB_SCHOOL_EXCUSE_SETTINGS);
      const d = res.data || {};
      setEnabled(Boolean(d.enabled));
      setChairmanName(d.chairman_name || "");
      setBodyTemplate(d.body_template || d.defaults?.body || "");
      setHasSignature(Boolean(d.has_signature));
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
      await axiosInstance.put(API_PATHS.CLUB_SCHOOL_EXCUSE_SETTINGS, {
        enabled: nextEnabled,
        chairman_name: chairmanName.trim() || null,
        body_template: bodyTemplate,
      });
      if (sigInk) {
        await axiosInstance.put(API_PATHS.CLUB_SCHOOL_EXCUSE_SIGNATURE, {
          signature_image: sigInk,
        });
        setHasSignature(true);
        setSigInk(null);
      }
      await load();
      toast?.success(
        overrides.enabled === true
          ? "Извинителните бележки са активирани за родителите."
          : overrides.enabled === false
            ? "Извинителните бележки са изключени."
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

  const openPreview = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.CLUB_SCHOOL_EXCUSE_PREVIEW, { responseType: "blob" });
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
            Активирай извинителни бележки за родителите
            <span style={{ display: "block", fontWeight: 500, fontSize: 12, color: "#475569", marginTop: 4 }}>
              {enabled
                ? "Родителите виждат раздел в профила и могат да изтеглят PDF за всяко състезание."
                : "Изключено — родителите няма да виждат бележките, докато не активираш."}
            </span>
          </span>
        </label>
      </div>

      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        PDF се генерира <strong>при изтегляне</strong> от родителя — без предварително архивиране.
        Плейсхолдери:{" "}
        <code>{"{student_name}"}</code>, <code>{"{school_name}"}</code>, <code>{"{period_from}"}</code>,{" "}
        <code>{"{period_to}"}</code>, <code>{"{event_city}"}</code>, <code>{"{event_description}"}</code>.
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
        <span style={{ fontSize: 12, fontWeight: 700 }}>Текст на молбата (основна част)</span>
        <textarea
          className="uiInput"
          rows={10}
          value={bodyTemplate}
          disabled={busy}
          onChange={(e) => setBodyTemplate(e.target.value)}
        />
      </label>

      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>
          Подпис на председателя {hasSignature ? "· записан" : "· липсва"}
        </p>
        <SignaturePad label="Подпис" disabled={busy} onChange={setSigInk} />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          Печат на клуба {hasStamp ? "· качен" : "· липсва"}
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={uploadStamp} />
        <span className="uiMuted" style={{ fontSize: 12 }}>
          PNG/JPG с прозрачен фон — ще се показва върху всяка бележка.
        </span>
      </div>

      {!smtpConfigured ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
          Имейл „Изпрати на училище“ изисква SMTP на сървъра (SMTP_HOST). Изтегляне на PDF работи винаги.
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button type="button" size="sm" disabled={busy} onClick={() => save()}>
          Запази
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={openPreview}>
          Преглед PDF (пример)
        </Button>
      </div>
    </div>
  );
}
