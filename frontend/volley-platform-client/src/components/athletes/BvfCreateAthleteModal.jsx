import { useEffect, useMemo, useState } from "react";

import { Button, Input, Modal } from "../ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

/**
 * Създава състезател в db.bvf.bg от локалния профил (снимка + FirstCoach).
 * FirstCoach се взима автоматично от мапинга на треньора / клубен default;
 * ръчен избор остава като override.
 * Снимката по подразбиране е портретът от профила; качване е само override.
 */
export default function BvfCreateAthleteModal({
  open,
  onClose,
  athleteId,
  athleteName,
  initialEgn = "",
  missing = [],
  hasPhoto = false,
  onCreated,
  toast,
}) {
  const { permanent, tokenBody, appendToken } = useClubBvfLink({ enabled: open });
  const [token, setToken] = useState("");
  const [egn, setEgn] = useState(initialEgn || "");
  const [coachId, setCoachId] = useState("");
  const [coaches, setCoaches] = useState([]);
  const [resolved, setResolved] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [loadingResolved, setLoadingResolved] = useState(false);

  const canUseProfilePhoto = useMemo(() => {
    if (hasPhoto) return true;
    const miss = Array.isArray(missing) ? missing : [];
    return !miss.some((m) => String(m).toLowerCase().includes("снимка"));
  }, [hasPhoto, missing]);

  useEffect(() => {
    if (!open) return;
    setEgn(initialEgn || "");
    setPhoto(null);
    setCoachId("");
    setCoaches([]);
    setResolved(null);
    setToken("");
  }, [open, initialEgn, athleteId]);

  useEffect(() => {
    if (!open || !athleteId) return;
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingResolved(true);
        const form = new FormData();
        form.append("athlete_id", String(athleteId));
        const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_RESOLVE_FIRST_COACH, form);
        if (cancelled) return;
        setResolved(res.data || null);
        if (res.data?.first_coach_id) {
          setCoachId(String(res.data.first_coach_id));
        }
      } catch {
        if (!cancelled) setResolved(null);
      } finally {
        if (!cancelled) setLoadingResolved(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, athleteId]);

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
      if (!coachId && list.length === 1) setCoachId(String(list[0].id));
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
    if (!coachId && !resolved?.ready) {
      toast?.error("Няма FirstCoach — задай разпознаване в Админ → Треньори или избери ръчно.");
      return;
    }
    if (!photo && !canUseProfilePhoto) {
      toast?.error("Качи портретна снимка (JPG/PNG) или запази снимка в профила.");
      return;
    }
    const form = new FormData();
    form.append("athlete_id", String(athleteId));
    appendToken(form, token);
    if (coachId) form.append("first_coach_id", String(coachId));
    form.append("egn", egn.trim());
    if (photo) form.append("file", photo);
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CREATE_FROM_ATHLETE, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast?.success(`Създаден в СЕК · № ${res.data?.bvf_player_number || res.data?.bvf_player_id}`);
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      toast?.error(normalizeError(err, "Неуспешно създаване в СЕК."));
    } finally {
      setBusy(false);
    }
  };

  const blockers = (missing || []).filter((m) => {
    const s = String(m).toLowerCase();
    return s !== "егн" && !s.includes("снимка");
  });
  const sourceLabel =
    resolved?.source === "coach_self"
      ? "от треньора (СЕК)"
      : resolved?.source === "coach_proxy"
        ? "прокси на треньора"
        : resolved?.source === "club_default"
          ? "клубен default"
          : null;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} dismissable={!busy} title="Създай в СЕК" size="compact">
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

        {loadingResolved ? (
          <p className="uiMuted" style={{ margin: 0, fontSize: 12 }}>Определяне на FirstCoach…</p>
        ) : resolved?.ready ? (
          <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>
            FirstCoach: {resolved.first_coach_name || `#${resolved.first_coach_id}`}
            {sourceLabel ? ` (${sourceLabel})` : ""}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>
            Няма автоматичен FirstCoach. Задай разпознаване в Админ → Треньори или избери ръчно по-долу.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" size="sm" variant="secondary" disabled={busy || loadingCoaches || !canCallBvf} onClick={loadCoaches}>
            {loadingCoaches ? "Зареждане…" : "Зареди / смени треньор"}
          </Button>
        </div>

        {coaches.length > 0 ? (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Първи треньор (БФВ)</span>
            <select className="uiInput" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Избери</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН *</span>
          <Input value={egn} onChange={(e) => setEgn(e.target.value)} maxLength={10} placeholder="10 цифри" />
        </label>

        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            Портретна снимка{canUseProfilePhoto ? "" : " *"}
          </span>
          {canUseProfilePhoto && !photo ? (
            <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>
              Ще се използва снимката от профила. Качи друг файл само ако искаш да я смениш.
            </p>
          ) : null}
          {!canUseProfilePhoto && !photo ? (
            <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>
              Няма снимка в профила — качи JPG/PNG.
            </p>
          ) : null}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/bmp,.jpg,.jpeg,.png"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
          {photo ? <span className="uiMuted" style={{ fontSize: 12 }}>Нов файл: {photo.name}</span> : null}
        </div>

        <div className="uiModalActions">
          <Button type="button" disabled={busy || blockers.length > 0} onClick={submit}>
            {busy ? "Изпращане…" : "Създай в СЕК"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Отказ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
