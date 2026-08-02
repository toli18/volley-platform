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
 * Локални документи на състезателя (заявление и др.) с преглед.
 */
export default function AthleteLocalDocumentsPanel({ athleteId, toast }) {
  const { user } = useAuth();
  const role = normalizeRole(user);
  const canRevoke = role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

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

  const openPreview = async (consentId) => {
    try {
      const res = await axiosInstance.get(API_PATHS.ATHLETE_DOCUMENT_CONSENT_PREVIEW(athleteId, consentId), {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешен преглед."));
    }
  };

  const revoke = async (consentId) => {
    if (!window.confirm("Оттегляне на заявлението? Родителят ще трябва да подпише отново.")) return;
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

  const statusLabel = (s) => (s === "active" ? "Активно" : s === "revoked" ? "Оттеглено" : s);

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
                    {statusLabel(d.status)}
                  </span>
                </span>
                {d.has_preview && d.doc_type === "membership_consent" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => openPreview(d.id)}>
                    Преглед
                  </Button>
                ) : null}
                {canRevoke && d.status === "active" && d.doc_type === "membership_consent" ? (
                  <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => revoke(d.id)}>
                    Оттегли
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
