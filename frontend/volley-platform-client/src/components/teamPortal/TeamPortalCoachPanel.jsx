import { useCallback, useEffect, useRef, useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { resolveStaticUrl } from "../../utils/staticUrl";
import { useToast } from "../ToastProvider";
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
  const [access, setAccess] = useState({ has_active_token: false, team_url: null, token_preview: null });
  const [items, setItems] = useState([]);
  const [textOpen, setTextOpen] = useState(false);
  const [textBody, setTextBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const load = useCallback(async () => {
    if (!teamId || Number.isNaN(Number(teamId))) return;
    const [accessRes, itemsRes] = await Promise.all([
      axiosInstance.get(API_PATHS.TEAM_ACCESS_GET(teamId)),
      axiosInstance.get(API_PATHS.TEAM_PORTAL_ITEMS_LIST(teamId)),
    ]);
    setAccess(accessRes.data || { has_active_token: false });
    setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err, "Неуспешно зареждане на отборната стая."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, load, toast]);

  const createLink = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_ACCESS_CREATE(teamId), {});
      const url = res.data?.team_url || "";
      setLinkUrl(url);
      setAccess({
        has_active_token: true,
        team_url: url,
        token_preview: res.data?.token_preview || null,
      });
      toast.success("Отборният линк е създаден.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване на линк."));
    } finally {
      setBusy(false);
    }
  };

  const rotateLink = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_ACCESS_ROTATE(teamId), {});
      const url = res.data?.team_url || "";
      setLinkUrl(url);
      setAccess({ has_active_token: true, team_url: url, token_preview: res.data?.token_preview || null });
      toast.success("Линкът е обновен.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const revokeLink = async () => {
    if (!window.confirm("Сигурни ли сте, че искате да спрете отборния достъп?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.TEAM_ACCESS_REVOKE(teamId));
      setAccess({ has_active_token: false, team_url: null, token_preview: null });
      setLinkUrl("");
      toast.success("Отборният достъп е спрян.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    const url = linkUrl || access.team_url;
    if (!url) {
      toast.error("Първо създайте линк.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Линкът е копиран.");
    } catch {
      toast.error("Копирането не успя.");
    }
  };

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

  const onLinkClick = () => {
    if (access.has_active_token) copyLink();
    else createLink();
  };

  return {
    busy,
    access,
    items,
    textOpen,
    setTextOpen,
    textBody,
    setTextBody,
    fileRef,
    linkUrl,
    createLink,
    rotateLink,
    revokeLink,
    copyLink,
    postText,
    onPickImage,
    onImageSelected,
    deleteItem,
    onLinkClick,
  };
}

export function TeamPortalHeroActions({ coach }) {
  const { busy, access, onLinkClick, setTextOpen, onPickImage } = coach;
  return (
    <div className="heroActionsWrap teamPortalHeroActions">
      <Button size="sm" variant="secondary" disabled={busy} onClick={onLinkClick}>
        {access.has_active_token ? "Копирай отборен линк" : "Отборен линк"}
      </Button>
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
    access,
    items,
    textOpen,
    setTextOpen,
    textBody,
    setTextBody,
    fileRef,
    linkUrl,
    rotateLink,
    revokeLink,
    copyLink,
    postText,
    onImageSelected,
    deleteItem,
  } = coach;

  const activeUrl = linkUrl || access.team_url;

  return (
    <>
      <Card
        title="Отборна стая"
        subtitle={teamName ? `Публикации за ${teamName}` : "Обявления и снимки"}
      >
        {access.has_active_token && activeUrl ? (
          <p className="uiHint" style={{ margin: "0 0 10px" }}>
            Активен отборен линк — споделете в групата.{" "}
            <button type="button" className="teamPortalInlineLink" disabled={busy} onClick={copyLink}>
              Копирай
            </button>
            {" · "}
            <button type="button" className="teamPortalInlineLink" disabled={busy} onClick={rotateLink}>
              Нов линк
            </button>
            {" · "}
            <button type="button" className="teamPortalInlineLink teamPortalInlineLink--danger" disabled={busy} onClick={revokeLink}>
              Спри
            </button>
          </p>
        ) : (
          <p className="uiHint" style={{ margin: "0 0 10px" }}>
            Създайте отборен линк от зелената лента („Отборен линк“).
          </p>
        )}

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
                <div className="teamPortalCoachFeedMeta">
                  <span className="uiMuted" style={{ fontSize: 12 }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString("bg-BG") : ""}
                  </span>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => deleteItem(item.id)}>
                    Изтрий
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onImageSelected} />

      {textOpen ? (
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
      ) : null}
    </>
  );
}
