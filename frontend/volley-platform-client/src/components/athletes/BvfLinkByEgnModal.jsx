import { useEffect, useState } from "react";

import { Button, Input, Modal } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

export default function BvfLinkByEgnModal({ open, onClose, athleteId, athleteName, initialEgn = "", onLinked, toast }) {
  const { permanent, tokenBody } = useClubBvfLink({ enabled: open });
  const [token, setToken] = useState("");
  const [egn, setEgn] = useState(initialEgn || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEgn(String(initialEgn || "").trim());
    setToken("");
  }, [open, initialEgn, athleteId]);

  const canCallBvf = permanent || Boolean(token.trim());

  const submit = async () => {
    if (!canCallBvf) {
      toast?.error("Първо оторизирай клуба в Администрация БФВ или постави token.");
      return;
    }
    if ((egn || "").trim().length !== 10) {
      toast?.error("ЕГН трябва да е 10 символа.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_LINK_BY_EGN, {
        ...tokenBody(token),
        athlete_id: athleteId,
        egn: egn.trim(),
      });
      toast?.success(`Свързан · БФВ № ${res.data?.bvf_player_number || res.data?.bvf_player_id}`);
      onLinked?.(res.data);
      onClose?.();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно свързване."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} dismissable={!busy} title="Свържи съществуващ в БФВ" size="compact">
      <div style={{ display: "grid", gap: 10 }}>
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          {athleteName} — търси по ЕГН в играчите на клуба в db.bvf.bg и записва id.
        </p>
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
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
          </label>
        )}
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН</span>
          <Input
            value={egn}
            onChange={(e) => setEgn(e.target.value.replace(/\D/g, "").slice(0, 10))}
            maxLength={10}
            placeholder="10 цифри"
            inputMode="numeric"
          />
        </label>
        <div className="uiModalActions">
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? "Търсене…" : "Свържи"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Отказ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
