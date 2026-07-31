import { useEffect, useState } from "react";

import { Button, Input, Modal } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Създава състезател в db.bvf.bg от локалния профил (снимка + FirstCoach).
 * Token е нужен само ако клубът няма постоянна връзка.
 */
export default function BvfCreateAthleteModal({
  open,
  onClose,
  athleteId,
  athleteName,
  initialEgn = "",
  missing = [],
  onCreated,
  toast,
}) {
  const { permanent, tokenBody, appendToken } = useClubBvfLink({ enabled: open });
  const [token, setToken] = useState("");
  const [egn, setEgn] = useState(initialEgn || "");
  const [coachId, setCoachId] = useState("");
  const [coaches, setCoaches] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEgn(initialEgn || "");
    setPhoto(null);
    setCoachId("");
    setCoaches([]);
    setToken("");
  }, [open, initialEgn, athleteId]);

  const canCallBvf = permanent || Boolean(token.trim());

  const loadCoaches = async () => {
    if (!canCallBvf) {
      toast?.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    try {
      setLoadingCoaches(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_COACHES_LIST, {
        ...tokenBody(token),
      });
      const list = Array.isArray(res.data?.coaches) ? res.data.coaches : [];
      setCoaches(list);
      if (list.length === 1) setCoachId(String(list[0].id));
      toast?.success(`Заредени ${list.length} треньори от БФВ.`);
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно зареждане на треньори."));
    } finally {
      setLoadingCoaches(false);
    }
  };

  const submit = async () => {
    if (!canCallBvf) {
      toast?.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    if ((egn || "").trim().length !== 10) {
      toast?.error("ЕГН трябва да е 10 символа.");
      return;
    }
    if (!coachId) {
      toast?.error("Избери първи треньор в БФВ.");
      return;
    }
    if (!photo) {
      toast?.error("Качи портретна снимка (JPG/PNG).");
      return;
    }
    const form = new FormData();
    form.append("athlete_id", String(athleteId));
    appendToken(form, token);
    form.append("first_coach_id", String(coachId));
    form.append("egn", egn.trim());
    form.append("file", photo);
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CREATE_FROM_ATHLETE, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast?.success(`Създаден в БФВ · № ${res.data?.bvf_player_number || res.data?.bvf_player_id}`);
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно създаване в БФВ."));
    } finally {
      setBusy(false);
    }
  };

  const blockers = (missing || []).filter((m) => m !== "ЕГН" && m !== "снимка");

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} dismissable={!busy} title="Създай в БФВ" size="compact">
      <div style={{ display: "grid", gap: 10 }}>
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          {athleteName || "Състезател"} — данните се взимат от профила. Нужни са ЕГН, снимка и първи треньор
          {permanent ? "." : "; или token ако клубът още няма постоянна връзка."}
        </p>
        {blockers.length ? (
          <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>
            Първо попълни в профила: {blockers.join(", ")}.
          </p>
        ) : null}

        {permanent ? (
          <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>Постоянна връзка с БФВ — token не е нужен.</p>
        ) : (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>БФВ token</span>
            <textarea
              className="uiInput"
              rows={2}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="или оторизирай клуба в Администрация БФВ"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              autoComplete="off"
            />
          </label>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" size="sm" variant="secondary" disabled={busy || loadingCoaches || !canCallBvf} onClick={loadCoaches}>
            {loadingCoaches ? "Зареждане…" : "Зареди треньори"}
          </Button>
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Първи треньор (БФВ) *</span>
          <select className="uiInput" value={coachId} onChange={(e) => setCoachId(e.target.value)} disabled={!coaches.length}>
            <option value="">{coaches.length ? "Избери" : "Зареди треньори първо"}</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН *</span>
          <Input value={egn} onChange={(e) => setEgn(e.target.value)} maxLength={10} placeholder="10 цифри" />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Портретна снимка *</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/bmp,.jpg,.jpeg,.png"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
          {photo ? <span className="uiMuted" style={{ fontSize: 12 }}>{photo.name}</span> : null}
        </label>

        <div className="uiModalActions">
          <Button type="button" disabled={busy || blockers.length > 0} onClick={submit}>
            {busy ? "Изпращане…" : "Създай в БФВ"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Отказ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
