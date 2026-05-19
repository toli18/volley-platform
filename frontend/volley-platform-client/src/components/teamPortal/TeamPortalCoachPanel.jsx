import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { resolveStaticUrl } from "../../utils/staticUrl";
import { useToast } from "../ToastProvider";
import { teamRoomLoginPath, teamRoomLoginUrl } from "../../utils/teamRoomAuth";
import TeamPortalCoachChat from "./TeamPortalCoachChat";
import { Button, Card, EmptyState, Input } from "../ui";

const normalizeError = (err, fallback = "Грешка.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  return fallback;
};

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

        <CoachFeed items={items} busy={busy} deleteItem={deleteItem} />
      </Card>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onImageSelected} />

      {textOpen ? (
        <TextModal
          busy={busy}
          textBody={textBody}
          setTextBody={setTextBody}
          postText={postText}
          setTextOpen={setTextOpen}
        />
      ) : null}

      <TeamPortalCoachChat teamId={teamId} />
    </>
  );
}

function CoachFeed({ items, busy, deleteItem }) {
  return (
    <div className="teamPortalCoachFeed">
      {items.length === 0 ? (
        <EmptyState title="Няма публикации" description="Добавете текст или снимка от бутоните в лентата." />
      ) : (
        items.map((item) => (
          <article key={item.id} className="teamPortalCoachFeedItem">
            {item.kind === "image" && item.url ? (
              <a href={resolveStaticUrl(item.url)} target="_blank" rel="noreferrer">
                <img src={resolveStaticUrl(item.url)} alt={item.file_name || "Снимка"} className="teamPortalCoachFeedImg" />
              </a>
            ) : (
              <p className="teamPortalCoachFeedText">{item.body}</p>
            )}
            <FeedMeta item={item} busy={busy} deleteItem={deleteItem} />
          </article>
        ))
      )}
    </div>
  );
}

function FeedMeta({ item, busy, deleteItem }) {
  return (
    <div className="teamPortalCoachFeedMeta">
      <span className="uiMuted" style={{ fontSize: 12 }}>
        {item.created_at ? new Date(item.created_at).toLocaleString("bg-BG") : ""}
      </span>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => deleteItem(item.id)}>
        Изтрий
      </Button>
    </div>
  );
}

function TextModal({ busy, textBody, setTextBody, postText, setTextOpen }) {
  return (
    <div className="uiModalOverlay" onClick={() => !busy && setTextOpen(false)} role="presentation">
      <section className="uiModal uiModal--compact" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3 className="uiModalTitle">Ново обявление</h3>
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
      </section>
    </div>
  );
}
