import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { useToast } from "../ToastProvider";
import { teamRoomLoginPath, teamRoomLoginUrl } from "../../utils/teamRoomAuth";
import TeamPortalCoachChat from "./TeamPortalCoachChat";
import TeamPortalCoachNews from "./TeamPortalCoachNews";
import { Button, Card, Input, Modal } from "../ui";
import { normalizeError } from "../../utils/normalizeError";

export function useTeamPortalCoach(teamId) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [textOpen, setTextOpen] = useState(false);
  const [textBody, setTextBody] = useState("");

  const load = useCallback(async () => {
    if (!teamId || Number.isNaN(Number(teamId))) return;
    const itemsRes = await axiosInstance.get(API_PATHS.TEAM_PORTAL_ITEMS_LIST(teamId));
    setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err, "Неуспешно зареждане на публикациите."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, load, toast]);

  const postText = async () => {
    const body = textBody.trim();
    if (!body) {
      toast.error("Въведете текст.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.TEAM_PORTAL_TEXT_CREATE(teamId), { body });
      setTextBody("");
      setTextOpen(false);
      await load();
      toast.success("Обявлението е публикувано.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = () => fileRef.current?.click();

  const onImageSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.TEAM_PORTAL_IMAGE_CREATE(teamId), fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
      toast.success("Снимката е качена.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно качване на снимка."));
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm("Изтриване на публикацията?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.TEAM_PORTAL_ITEM_DELETE(teamId, itemId));
      await load();
      toast.success("Премахнато.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    items,
    textOpen,
    setTextOpen,
    textBody,
    setTextBody,
    fileRef,
    postText,
    onPickImage,
    onImageSelected,
    deleteItem,
  };
}

export function TeamPortalHeroActions({ coach }) {
  const { busy, setTextOpen, onPickImage } = coach;

  return (
    <div className="heroActionsWrap teamPortalHeroActions">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setTextOpen(true)}>
        + Текст
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onPickImage}>
        + Снимка
      </Button>
    </div>
  );
}

export default function TeamPortalCoachPanel({ teamId, teamName, coach }) {
  const {
    busy,
    items,
    textOpen,
    setTextOpen,
    textBody,
    setTextBody,
    fileRef,
    postText,
    onImageSelected,
    deleteItem,
  } = coach;

  return (
    <>
      <Card
        title="Новини и комуникация"
        subtitle={teamName ? `За отбор ${teamName}` : "Обявления за състезатели и родители"}
      >
        <p className="uiHint" style={{ margin: "0 0 12px", fontSize: 12 }}>
          Състезателите влизат с телефон и година на раждане:{" "}
          <Link to={teamRoomLoginPath()} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
            {teamRoomLoginUrl()}
          </Link>
          . Родителите — от{" "}
          <Link to="/parent/login">родителския портал</Link>.
        </p>

        <TeamPortalCoachNews items={items} busy={busy} deleteItem={deleteItem} />
      </Card>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onImageSelected} />

      <TeamPortalTextModal
        open={textOpen}
        busy={busy}
        textBody={textBody}
        setTextBody={setTextBody}
        postText={postText}
        setTextOpen={setTextOpen}
      />

      <TeamPortalCoachChat teamId={teamId} />
    </>
  );
}

export function TeamPortalTextModal({ open, busy, textBody, setTextBody, postText, setTextOpen }) {
  return (
    <Modal
      open={open}
      onClose={() => setTextOpen(false)}
      dismissable={!busy}
      title="Ново обявление"
      size="compact"
    >
      <Input
        as="textarea"
        rows={5}
        placeholder="Текст за отбора (тренировка, събиране, турнир...)"
        value={textBody}
        onChange={(e) => setTextBody(e.target.value)}
      />
      <div className="uiModalActions" style={{ marginTop: 10 }}>
        <Button disabled={busy} onClick={postText}>
          Публикувай
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setTextOpen(false)}>
          Отказ
        </Button>
      </div>
    </Modal>
  );
}
