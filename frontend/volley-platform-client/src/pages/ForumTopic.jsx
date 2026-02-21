import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { resolveMediaUrl } from "../components/articles/articleUtils";
import RichTextToolbar from "../components/RichTextToolbar";
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
  const [uploadBusy, setUploadBusy] = useState(false);
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

  return (
    <div style={{ padding: 20, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <Link to="/forum">← Към форума</Link>
      </div>

      {error && <div style={{ background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}
      {loading && <p>Зареждане...</p>}

      {!loading && post && (
        <>
          <section style={{ border: "1px solid #dbe5f2", borderRadius: 12, padding: 12, background: "#fff" }}>
            {editPost ? (
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={postDraft.title}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
                <input
                  placeholder="Категория"
                  value={postDraft.category}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, category: e.target.value }))}
                />
                <input
                  placeholder="Тагове (със запетая)"
                  value={postDraft.tagsText}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, tagsText: e.target.value }))}
                />
                <textarea
                  ref={postContentRef}
                  rows={6}
                  value={postDraft.content}
                  onChange={(e) => setPostDraft((prev) => ({ ...prev, content: e.target.value }))}
                />
                <RichTextToolbar
                  textareaRef={postContentRef}
                  value={postDraft.content}
                  onChange={(next) => setPostDraft((prev) => ({ ...prev, content: next }))}
                  disabled={busy}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
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
                        await loadPost();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Запази тема
                  </button>
                  <button onClick={() => setEditPost(false)}>Отказ</button>
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
                <div dangerouslySetInnerHTML={{ __html: toDisplayHtml(post.content) }} />
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
                          <button
                            style={{ color: "#b91c1c" }}
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
                          </button>
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
            </div>

            {canManagePost && !editPost && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button onClick={() => setEditPost(true)}>Редактирай тема</button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#475569" }}>Прикачи файл</span>
                  <input
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
                    <button
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
                    </button>
                    <button
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
                    </button>
                  </>
                )}
                <button
                  style={{ color: "#b91c1c" }}
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
                </button>
              </div>
            )}
          </section>

          <section style={{ border: "1px solid #dbe5f2", borderRadius: 12, padding: 12, background: "#f9fbff" }}>
            <h3 style={{ marginTop: 0 }}>Отговори</h3>
            {isLocked && (
              <p style={{ marginTop: 0, color: "#92400e" }}>
                Темата е заключена. Само администратор може да редактира или модерира съдържанието.
              </p>
            )}
            {(!post.replies || post.replies.length === 0) && (
              <p style={{ marginTop: 0, color: "#607693" }}>Все още няма отговори по тази тема.</p>
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
                      <textarea
                        ref={editReplyContentRef}
                        rows={4}
                        value={editingReplyContent}
                        onChange={(e) => setEditingReplyContent(e.target.value)}
                      />
                      <RichTextToolbar
                        textareaRef={editReplyContentRef}
                        value={editingReplyContent}
                        onChange={setEditingReplyContent}
                        disabled={busy}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const payload = { content: editingReplyContent.trim() };
                            if (!payload.content) return;
                            try {
                              setBusy(true);
                              await axiosInstance.put(API_PATHS.FORUM_REPLY_UPDATE(id, reply.id), payload);
                              setEditingReplyId(null);
                              setEditingReplyContent("");
                              await loadPost();
                            } catch (err) {
                              setError(normalizeError(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Запази
                        </button>
                        <button
                          onClick={() => {
                            setEditingReplyId(null);
                            setEditingReplyContent("");
                          }}
                        >
                          Отказ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: toDisplayHtml(reply.content) }} />
                  )}

                  {canManageReply(reply) && editingReplyId !== reply.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      {!isLocked || isAdmin ? (
                        <button
                          onClick={() => {
                            setEditingReplyId(reply.id);
                            setEditingReplyContent(reply.content || "");
                          }}
                        >
                          Редакция
                        </button>
                      ) : null}
                      {!isLocked || isAdmin ? (
                        <button
                          style={{ color: "#b91c1c" }}
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
                        </button>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {!isLocked && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <textarea
                  ref={replyContentRef}
                  rows={4}
                  placeholder="Напиши отговор..."
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                />
                <RichTextToolbar
                  textareaRef={replyContentRef}
                  value={replyInput}
                  onChange={setReplyInput}
                  disabled={busy}
                />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {QUICK_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => setReplyInput((prev) => `${prev}${emoji}`)}>
                    {emoji}
                  </button>
                ))}
              </div>
                <div>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const payload = { content: replyInput.trim() };
                      if (!payload.content) return;
                      try {
                        setBusy(true);
                        await axiosInstance.post(API_PATHS.FORUM_REPLY_CREATE(id), payload);
                        setReplyInput("");
                        await loadPost();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Публикувай отговор
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

