import { useEffect, useState } from "react";

import { Button, Input, Modal } from "../ui";
import SignaturePad from "../parentPortal/SignaturePad";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import { useAuth } from "../../auth/AuthContext";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

/**
 * Локални документи на състезателя (заявление, Форма 03) с преглед и изтриване.
 * За пълнолетни: подпис на Форма 0-3 B пред треньора или линк за отдалечен подпис.
 */
export default function AthleteLocalDocumentsPanel({ athleteId, toast }) {
  const { user } = useAuth();
  const role = normalizeRole(user);
  const canRevokeConsent =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";
  const canDeleteCarding =
    role === "coach" ||
    role === "club_head_coach" ||
    role === "platform_admin" ||
    role === "federation_admin";
  const canSign03b = canDeleteCarding;

  const [docs, setDocs] = useState([]);
  const [active, setActive] = useState(false);
  const [carding03b, setCarding03b] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [fullName, setFullName] = useState("");
  const [egn, setEgn] = useState("");
  const [city, setCity] = useState("");
  const [rules, setRules] = useState(false);
  const [sig, setSig] = useState(null);
  const [signError, setSignError] = useState("");

  const load = async () => {
    if (!athleteId) return;
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.ATHLETE_DOCUMENTS(athleteId));
      setDocs(res.data?.documents || []);
      setActive(Boolean(res.data?.membership_consent_active));
      setCarding03b(res.data?.carding_03b || null);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на документи."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [athleteId]);

  const openSignModal = () => {
    const pre = carding03b?.prefill || {};
    const composed = [pre.athlete_first_name, pre.athlete_middle_name, pre.athlete_last_name]
      .filter(Boolean)
      .join(" ");
    setFullName(composed);
    setEgn(pre.athlete_egn || "");
    setCity(pre.city || "");
    setRules(false);
    setSig(null);
    setSignError("");
    setInviteUrl("");
    setSignOpen(true);
  };

  const openPreview = async (doc) => {
    try {
      const path =
        doc.doc_type === "carding_form"
          ? API_PATHS.ATHLETE_DOCUMENT_CARDING_PREVIEW(athleteId, doc.id)
          : API_PATHS.ATHLETE_DOCUMENT_CONSENT_PREVIEW(athleteId, doc.id);
      const res = await axiosInstance.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен преглед."));
    }
  };

  const revokeConsent = async (consentId) => {
    if (!window.confirm("Оттегляне на клубното заявление? Родителят ще трябва да подпише отново.")) return;
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.ATHLETE_DOCUMENT_CONSENT_REVOKE(athleteId, consentId), {
        note: "Оттеглено от главен треньор",
      });
      toast?.success("Заявлението е оттеглено.");
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно оттегляне."));
    } finally {
      setBusy(false);
    }
  };

  const deleteCarding = async (formId, formKind) => {
    const isAdult = formKind === "03b";
    if (
      !window.confirm(
        isAdult
          ? "Изтриване на Форма 0-3 B? Състезателят ще трябва да я подпише отново (с рисунка)."
          : "Изтриване на Форма 03? Родителят ще получи нова форма при влизане — с място за подпис с рисунка.",
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.ATHLETE_DOCUMENT_CARDING_DELETE(athleteId, formId));
      toast?.success(
        isAdult
          ? "Форма 0-3 B е изтрита."
          : "Форма 03 е изтрита — родителят ще я попълни отново.",
      );
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно изтриване на формата."));
    } finally {
      setBusy(false);
    }
  };

  const submitSign = async () => {
    if (!rules) {
      setSignError("Потвърди приемането на правилата на БФВ.");
      return;
    }
    if (!sig) {
      setSignError("Нарисувай подписа на състезателя.");
      return;
    }
    try {
      setBusy(true);
      setSignError("");
      await axiosInstance.post(API_PATHS.ATHLETE_DOCUMENT_CARDING_03B_SIGN(athleteId), {
        city: city.trim() || null,
        rules_accepted: true,
        signature_athlete_image: sig,
        athlete_full_name: fullName.trim() || null,
        athlete_egn: egn.trim() || null,
      });
      toast?.success("Форма 0-3 B е подписана.");
      setSignOpen(false);
      await load();
    } catch (err) {
      setSignError(normalizeError(err, "Неуспешен подпис."));
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    try {
      setBusy(true);
      setSignError("");
      const res = await axiosInstance.post(API_PATHS.ATHLETE_DOCUMENT_CARDING_03B_INVITE(athleteId));
      const url = res.data?.url || "";
      setInviteUrl(url);
      if (url && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          toast?.success("Линкът е копиран (валиден 72 ч).");
        } catch {
          toast?.success("Линкът е готов — копирай го ръчно.");
        }
      } else {
        toast?.success("Линкът е готов.");
      }
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно създаване на линк."));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (doc) => {
    if (doc.status === "active") return "Активно";
    if (doc.status === "revoked") {
      return doc.doc_type === "carding_form" ? "Неактивно" : "Оттеглено";
    }
    return doc.status;
  };

  const needs03b = Boolean(carding03b?.needs_sign);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Клубно заявление:{" "}
        <strong style={{ color: active ? "#166534" : "#92400e" }}>
          {active ? "подписано" : "липсва / оттеглено"}
        </strong>
      </p>

      {needs03b && canSign03b ? (
        <div
          style={{
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 8,
            background: "rgba(146, 64, 14, 0.08)",
            border: "1px solid rgba(146, 64, 14, 0.25)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13 }}>
            Форма 0-3 B ({carding03b?.season_label || "сезон"}) — очаква подпис на състезателя
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button type="button" size="sm" disabled={busy} onClick={openSignModal}>
              Подпиши пред мен
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={createInvite}>
              Изпрати линк
            </Button>
          </div>
          {inviteUrl ? (
            <p style={{ margin: 0, fontSize: 11, wordBreak: "break-all" }} className="uiMuted">
              {inviteUrl}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={load}>
        Обнови
      </Button>
      {docs.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 8 }}>
          {docs.map((d) => (
            <li key={`${d.doc_type}-${d.id}`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span>
                  {d.title}
                  {d.signed_at ? ` · ${new Date(d.signed_at).toLocaleDateString("bg-BG")}` : ""}
                  {" · "}
                  <span className={`uiBadge${d.status === "active" ? " uiBadge--success" : " uiBadge--secondary"}`}>
                    {statusLabel(d)}
                  </span>
                </span>
                {d.has_preview && (d.doc_type === "membership_consent" || d.doc_type === "carding_form") ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => openPreview(d)}>
                    Преглед
                  </Button>
                ) : null}
                {canRevokeConsent && d.status === "active" && d.doc_type === "membership_consent" ? (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => revokeConsent(d.id)}>
                    Оттегли
                  </Button>
                ) : null}
                {canDeleteCarding && d.doc_type === "carding_form" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => deleteCarding(d.id, d.form_kind)}
                  >
                    Изтрий
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>
          Все още няма локални документи.
        </p>
      )}

      <Modal
        open={signOpen}
        onClose={busy ? undefined : () => setSignOpen(false)}
        dismissable={!busy}
        title="Подпис — Форма 0-3 B"
        size="compact"
      >
        <div style={{ display: "grid", gap: 12 }}>
          <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
            Състезателят подписва пред теб на това устройство.
            {carding03b?.season_label ? ` Сезон ${carding03b.season_label}.` : ""}
          </p>
          <Input label="Трите имена" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={busy} />
          <Input
            label="ЕГН"
            value={egn}
            onChange={(e) => setEgn(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            disabled={busy}
          />
          <Input label="Град" value={city} onChange={(e) => setCity(e.target.value)} disabled={busy} />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} disabled={busy} />
            <span>Потвърждавам приемането на правилата на БФВ</span>
          </label>
          <SignaturePad label="Подпис на състезателя" required disabled={busy} onChange={setSig} />
          {signError ? <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{signError}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button type="button" disabled={busy} onClick={submitSign}>
              {busy ? "Запис…" : "Подпиши"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setSignOpen(false)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
