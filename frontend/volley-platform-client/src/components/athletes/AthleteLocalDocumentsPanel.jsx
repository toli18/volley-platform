import { useEffect, useState } from "react";

import { Button } from "../ui";
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
 * Локални документи на състезателя (заявление, Форма 03) с преглед и връщане.
 */
export default function AthleteLocalDocumentsPanel({ athleteId, toast }) {
  const { user } = useAuth();
  const role = normalizeRole(user);
  const canRevokeConsent =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";
  const canReturnCarding =
    role === "coach" ||
    role === "club_head_coach" ||
    role === "platform_admin" ||
    role === "federation_admin";

  const [docs, setDocs] = useState([]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!athleteId) return;
    try {
      setBusy(true);
      const res = await axiosInstance.get(API_PATHS.ATHLETE_DOCUMENTS(athleteId));
      setDocs(res.data?.documents || []);
      setActive(Boolean(res.data?.membership_consent_active));
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на документи."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [athleteId]);

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

  const returnCarding = async (formId) => {
    if (
      !window.confirm(
        "Връщане на Форма 03? Родителят ще трябва да я попълни и подпише отново в портала.",
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.ATHLETE_DOCUMENT_CARDING_REVOKE(athleteId, formId), {
        note: "Върната от треньор за повторно попълване",
      });
      toast?.success("Форма 03 е върната — родителят може да я попълни отново.");
      await load();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно връщане на формата."));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (doc) => {
    if (doc.status === "active") return "Активно";
    if (doc.status === "revoked") {
      return doc.doc_type === "carding_form" ? "Върнато" : "Оттеглено";
    }
    return doc.status;
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Клубно заявление:{" "}
        <strong style={{ color: active ? "#166534" : "#92400e" }}>
          {active ? "подписано" : "липсва / оттеглено"}
        </strong>
      </p>
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
                {canReturnCarding && d.status === "active" && d.doc_type === "carding_form" ? (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => returnCarding(d.id)}>
                    Върни за попълване
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
    </div>
  );
}
