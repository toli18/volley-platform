import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { resolveMediaUrl } from "../components/articles/articleUtils";
import RichTextToolbar from "../components/RichTextToolbar";
import { Button, Card, EmptyState, Input } from "../components/ui";
import { toDisplayHtml } from "../utils/richText";

const QUICK_EMOJIS = ["🏐", "🔥", "💪", "🎯", "📈", "🧱", "👏", "🤝"];
const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при работа с темата.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при работа с темата.";
};

export default function ForumTopic() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [editPost, setEditPost] = useState(false);
  const [postDraft, setPostDraft] = useState({ title: "", content: "", category: "", tagsText: "" });
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyContent, setEditingReplyContent] = useState("");
  const [postDraftPreview, setPostDraftPreview] = useState(false);
  const [replyPreview, setReplyPreview] = useState(false);
  const [editReplyPreview, setEditReplyPreview] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const postContentRef = useRef(null);
  const replyContentRef = useRef(null);
  const editReplyContentRef = useRef(null);

  const loadPost = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.FORUM_POST_GET(id));
      setPost(res.data);
      setPostDraft({
        title: res.data?.title || "",
        content: res.data?.content || "",
        category: res.data?.category || "",
        tagsText: Array.isArray(res.data?.tags) ? res.data.tags.join(", ") : "",
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPost();
  }, [id]);

  const isAdmin = ["platform_admin", "federation_admin"].includes(String(user?.role || ""));
  const canManagePost = post && user && (post.author_id === user.id || isAdmin);
  const canManageReply = (reply) => user && (reply.author_id === user.id || isAdmin);
  const isLocked = Boolean(post?.is_locked);

  const insertInField = (ref, raw, setter, text) => {
    const textarea = ref.current;
    const current = raw || "";
    if (!textarea) {
      setter(`${current}${text}`);
      return;
    }
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
    setter(next);
    requestAnimationFrame(() => {
      const cursor = start + text.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const applyForumPreset = (target) => {
    const preset =
      "\n## Контекст\nКратко описание на ситуацията.\n\n## Какво пробвах досега\n- Вариант 1\n- Вариант 2\n\n## Въпрос към колегите\nКак бихте подходили вие?\n";
    if (target === "post") {
      insertInField(postContentRef, postDraft.content, (next) => setPostDraft((prev) => ({ ...prev, content: next })), preset);
      return;
    }
    if (target === "reply") {
      insertInField(replyContentRef, replyInput, setReplyInput, preset);
      return;
    }
    insertInField(editReplyContentRef, editingReplyContent, setEditingReplyContent, preset);
  };

  return (
    <div className="uiPage">
      <div style={{ display: "flex", gap: 10 }}>
        <Button as={Link} to="/forum" variant="secondary" size="sm">
          ← Към форума
        </Button>
      </div>

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}
      {loading && <p>Зареждане...</p>}

      {!loading && post && (
        <>
          <Card>
            {editPost ? (
              <div style={{ display: "grid", gap: 8 }}>
                <Input
                  value={postDraft.title}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
                <Input
                  placeholder="Категория"
                  value={postDraft.category}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, category: e.target.value }))}
                />
                <Input
                  placeholder="Тагове (със запетая)"
                  value={postDraft.tagsText}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, tagsText: e.target.value }))}
                />
                <Input
                  as="textarea"
                  ref={postContentRef}
                  rows={6}
                  value={postDraft.content}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, content: e.target.value }))}
                  style={{ display: postDraftPreview ? "none" : "block" }}
                />
                <RichTextToolbar
                  textareaRef={postContentRef}
                  value={postDraft.content}
                  onChange={(next) => setPostDraft((prev) => ({ ...prev, content: next }))}
                  disabled={busy}
                  onInsertTemplate={() => applyForumPreset("post")}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPostDraftPreview((prev) => !prev)}>
                    {postDraftPreview ? "Редакция" : "Преглед"}
                  </Button>
                </div>
                {postDraftPreview && (
                  <div
                    className="forum-post-content"
                    style={{ border: "1px solid #dbe5f2", borderRadius: 8, padding: 12, background: "#fff" }}
                    dangerouslySetInnerHTML={{ __html: toDisplayHtml(postDraft.content) }}
                  />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const payload = {
                        title: postDraft.title.trim(),
                        content: postDraft.content.trim(),
                        category: postDraft.category.trim() || null,
                        tags: postDraft.tagsText
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      };
                      if (!payload.title || !payload.content) return;
                      try {
                        setBusy(true);
                        await axiosInstance.put(API_PATHS.FORUM_POST_UPDATE(id), payload);
                        setEditPost(false);
                        setPostDraftPreview(false);
                        await loadPost();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Запази тема
                  </Button>
                  <Button variant="secondary" onClick={() => setEditPost(false)}>
                    Отказ
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{post.title}</h2>
                <div style={{ marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap", color: "#334155" }}>
                  {post.is_pinned && <span>📌 Закачена тема</span>}
                  {post.is_locked && <span>🔒 Заключена тема</span>}
                  {post.category && <span>Категория: {post.category}</span>}
                  {(post.tags || []).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
                <div className="forum-post-content" dangerouslySetInnerHTML={{ __html: toDisplayHtml(post.content) }} />
              </>
            )}

            {Array.isArray(post.media_items) && post.media_items.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <strong>Прикачени файлове</strong>
                {post.media_items.map((media) => {
                  const isImage = String(media.mime_type || "").startsWith("image/");
                  return (
                    <div
                      key={media.id}
                      style={{
                        border: "1px solid #dbe5f2",
                        borderRadius: 8,
                        padding: 8,
                        display: "grid",
                        gap: 6,
                        background: "#f8fbff",
                      }}
                    >
                      {isImage ? (
                        <img
                          src={resolveMediaUrl(media.url)}
                          alt={media.name || "forum media"}
                          style={{ maxWidth: 320, borderRadius: 8 }}
                        />
                      ) : null}
                      <a href={resolveMediaUrl(media.url)} target="_blank" rel="noreferrer">
                        {media.name}
                      </a>
                      {canManagePost && (
                        <div>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={uploadBusy}
                            onClick={async () => {
                              if (!window.confirm("Изтриване на прикачения файл?")) return;
                              try {
                                setUploadBusy(true);
                                await axiosInstance.delete(API_PATHS.FORUM_POST_MEDIA_DELETE(id, media.id));
                                await loadPost();
                              } catch (err) {
                                setError(normalizeError(err));
                              } finally {
                                setUploadBusy(false);
                              }
                            }}
                          >
                            Изтрий файл
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                color: "#607693",
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span>Автор: {post.author_name || `Потребител #${post.author_id}`}</span>
              <span>Създадена: {new Date(post.created_at || "").toLocaleString("bg-BG")}</span>
              <span>Следят темата: {post.followers_count || 0}</span>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                disabled={followBusy}
                onClick={async () => {
                  try {
                    setFollowBusy(true);
                    if (post.is_following) {
                      await axiosInstance.delete(API_PATHS.FORUM_POST_FOLLOW(id));
                    } else {
                      await axiosInstance.post(API_PATHS.FORUM_POST_FOLLOW(id));
                    }
                    await loadPost();
                  } catch (err) {
                    setError(normalizeError(err));
                  } finally {
                    setFollowBusy(false);
                  }
                }}
              >
                {post.is_following ? "Спри следене" : "Следвай тема"}
              </Button>
            </div>

            {canManagePost && !editPost && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={() => setEditPost(true)}>
                  Редактирай тема
                </Button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#475569" }}>Прикачи файл</span>
                  <Input
                    type="file"
                    disabled={uploadBusy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        setUploadBusy(true);
                        const formData = new FormData();
                        formData.append("file", file);
                        await axiosInstance.post(API_PATHS.FORUM_POST_MEDIA_UPLOAD(id), formData, {
                          headers: { "Content-Type": "multipart/form-data" },
                        });
                        await loadPost();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setUploadBusy(false);
                      }
                    }}
                  />
                </label>
                {isAdmin && (
                  <>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setBusy(true);
                          await axiosInstance.patch(API_PATHS.FORUM_POST_MODERATION(id), {
                            is_pinned: !post.is_pinned,
                          });
                          await loadPost();
                        } catch (err) {
                          setError(normalizeError(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {post.is_pinned ? "Махни закачане" : "Закачи тема"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setBusy(true);
                          await axiosInstance.patch(API_PATHS.FORUM_POST_MODERATION(id), {
                            is_locked: !post.is_locked,
                          });
                          await loadPost();
                        } catch (err) {
                          setError(normalizeError(err));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {post.is_locked ? "Отключи тема" : "Заключи тема"}
                    </Button>
                  </>
                )}
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Да изтрия ли тази тема?")) return;
                    try {
                      setBusy(true);
                      await axiosInstance.delete(API_PATHS.FORUM_POST_DELETE(id));
                      navigate("/forum");
                    } catch (err) {
                      setError(normalizeError(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Изтрий тема
                </Button>
              </div>
            )}
          </Card>

          <Card title="Отговори" tone="soft">
            {isLocked && (
              <p style={{ marginTop: 0, color: "#92400e" }}>
                Темата е заключена. Само администратор може да редактира или модерира съдържанието.
              </p>
            )}
            {(!post.replies || post.replies.length === 0) && (
              <EmptyState title="Все още няма отговори по тази тема" description="Бъди първият, който ще отговори." />
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {(post.replies || []).map((reply) => (
                <article
                  key={reply.id}
                  style={{
                    border: "1px solid #dbe5f2",
                    borderRadius: 10,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{reply.author_name || `Потребител #${reply.author_id}`}</strong>
                    <span style={{ color: "#607693", fontSize: 12 }}>
                      {new Date(reply.created_at || "").toLocaleString("bg-BG")}
                    </span>
                  </div>

                  {editingReplyId === reply.id ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      <Input
                        as="textarea"
                        ref={editReplyContentRef}
                        rows={4}
                        value={editingReplyContent}
                        onChange={(e) => setEditingReplyContent(e.target.value)}
                        style={{ display: editReplyPreview ? "none" : "block" }}
                      />
                      <RichTextToolbar
                        textareaRef={editReplyContentRef}
                        value={editingReplyContent}
                        onChange={setEditingReplyContent}
                        disabled={busy}
                        onInsertTemplate={() => applyForumPreset("edit-reply")}
                        compact
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditReplyPreview((prev) => !prev)}>
                          {editReplyPreview ? "Редакция" : "Преглед"}
                        </Button>
                      </div>
                      {editReplyPreview && (
                        <div
                          className="forum-post-content"
                          style={{ border: "1px solid #dbe5f2", borderRadius: 8, padding: 12, background: "#fff" }}
                          dangerouslySetInnerHTML={{ __html: toDisplayHtml(editingReplyContent) }}
                        />
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          disabled={busy}
                          onClick={async () => {
                            const payload = { content: editingReplyContent.trim() };
                            if (!payload.content) return;
                            try {
                              setBusy(true);
                              await axiosInstance.put(API_PATHS.FORUM_REPLY_UPDATE(id, reply.id), payload);
                              setEditingReplyId(null);
                              setEditingReplyContent("");
                              setEditReplyPreview(false);
                              await loadPost();
                            } catch (err) {
                              setError(normalizeError(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Запази
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingReplyId(null);
                            setEditingReplyContent("");
                            setEditReplyPreview(false);
                          }}
                        >
                          Отказ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="forum-post-content"
                      style={{ marginTop: 8 }}
                      dangerouslySetInnerHTML={{ __html: toDisplayHtml(reply.content) }}
                    />
                  )}

                  {canManageReply(reply) && editingReplyId !== reply.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      {!isLocked || isAdmin ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingReplyId(reply.id);
                            setEditingReplyContent(reply.content || "");
                            setEditReplyPreview(false);
                          }}
                        >
                          Редакция
                        </Button>
                      ) : null}
                      {!isLocked || isAdmin ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={async () => {
                            if (!window.confirm("Изтриване на отговора?")) return;
                            try {
                              setBusy(true);
                              await axiosInstance.delete(API_PATHS.FORUM_REPLY_DELETE(id, reply.id));
                              await loadPost();
                            } catch (err) {
                              setError(normalizeError(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Изтрий
                        </Button>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {!isLocked && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <Input
                  as="textarea"
                  ref={replyContentRef}
                  rows={4}
                  placeholder="Напиши отговор..."
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  style={{ display: replyPreview ? "none" : "block" }}
                />
                <RichTextToolbar
                  textareaRef={replyContentRef}
                  value={replyInput}
                  onChange={setReplyInput}
                  disabled={busy}
                  onInsertTemplate={() => applyForumPreset("reply")}
                  compact
                />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setReplyPreview((prev) => !prev)}>
                  {replyPreview ? "Редакция" : "Преглед"}
                </Button>
              </div>
              {replyPreview && (
                <div
                  className="forum-post-content"
                  style={{ border: "1px solid #dbe5f2", borderRadius: 8, padding: 12, background: "#fff" }}
                  dangerouslySetInnerHTML={{ __html: toDisplayHtml(replyInput) }}
                />
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {QUICK_EMOJIS.map((emoji) => (
                  <Button key={emoji} type="button" variant="ghost" size="sm" onClick={() => setReplyInput((prev) => `${prev}${emoji}`)}>
                    {emoji}
                  </Button>
                ))}
              </div>
                <div>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const payload = { content: replyInput.trim() };
                      if (!payload.content) return;
                      try {
                        setBusy(true);
                        await axiosInstance.post(API_PATHS.FORUM_REPLY_CREATE(id), payload);
                        setReplyInput("");
                        setReplyPreview(false);
                        await loadPost();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Публикувай отговор
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

