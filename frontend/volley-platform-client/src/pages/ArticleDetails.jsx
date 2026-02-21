import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { useAuth } from "../auth/AuthContext";
import ArticleAttachmentList from "../components/articles/ArticleAttachmentList";
import ArticleLayout from "../components/articles/ArticleLayout";
import {
  articleTopics,
  estimateReadMinutes,
  incrementLocalReadCount,
  pickCoverImage,
  resolveMediaUrl,
} from "../components/articles/articleUtils";
import { extractTocItems, toDisplayHtml } from "../utils/richText";
import "../components/articles/articles.css";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на статията.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на статията.";
};

export default function ArticleDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingContent, setEditingContent] = useState("");

  const loadArticle = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(`/api/articles/${id}`);
      setArticle(res.data);
      incrementLocalReadCount(id);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const res = await axiosInstance.get(`/api/articles/${id}/comments`);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setComments([]);
    }
  };

  useEffect(() => {
    loadArticle();
    loadComments();
  }, [id]);

  useEffect(() => {
    const loadRelated = async () => {
      if (!article?.id) return;
      try {
        const res = await axiosInstance.get("/api/articles");
        const list = Array.isArray(res.data) ? res.data : [];
        const currentTopics = new Set(articleTopics(article));
        const scored = list
          .filter((it) => it.id !== article.id)
          .map((it) => {
            const overlap = articleTopics(it).filter((t) => currentTopics.has(t)).length;
            return { ...it, _score: overlap };
          })
          .sort((a, b) => b._score - a._score || new Date(b.created_at || 0) - new Date(a.created_at || 0))
          .slice(0, 3);
        setRelated(scored);
      } catch {
        setRelated([]);
      }
    };
    loadRelated();
  }, [article]);

  const canEdit = user && article && user.id === article.author_id && article.status !== "APPROVED";
  const canComment = user && ["coach", "platform_admin", "federation_admin"].includes(String(user.role || ""));
  const canManageComment = (comment) =>
    user &&
    (comment.author_id === user.id ||
      ["platform_admin", "federation_admin"].includes(String(user.role || "")));
  const readMinutes = estimateReadMinutes(article?.content || "");
  const coverImage = pickCoverImage(article);
  const imageItems = useMemo(
    () =>
      (Array.isArray(article?.media_items) ? article.media_items : []).filter(
        (m) => String(m?.type || "").toUpperCase() === "IMAGE"
      ),
    [article]
  );

  const tocItems = useMemo(
    () =>
      extractTocItems(article?.content || "").map((label, index) => ({
        id: `sec-${index + 1}`,
        label,
      })),
    [article?.content]
  );
  const articleHtml = useMemo(() => toDisplayHtml(article?.content || ""), [article?.content]);

  return (
    <div style={{ padding: 20, maxWidth: "100%" }}>
      <div style={{ marginBottom: 12, display: "flex", gap: 10 }}>
        <Link to="/articles">← Към статии</Link>
        {canEdit && <Link to={`/articles/${id}/edit`}>Редактирай</Link>}
      </div>

      {loading && <p>Зареждане...</p>}
      {error && <div style={{ background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}

      {!loading && !error && article && (
        <ArticleLayout
          article={article}
          readMinutes={readMinutes}
          coverImage={coverImage}
          tocItems={tocItems}
          fileBlock={<ArticleAttachmentList attachments={article.media_items} />}
          externalLinksBlock={
            Array.isArray(article.links) && article.links.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {article.links.map((l) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
                    {l.title || l.url}
                  </a>
                ))}
              </div>
            ) : (
              <p>Няма добавени външни ресурси.</p>
            )
          }
        >
          <section className="articleBody">
            <div className="articleTypography" dangerouslySetInnerHTML={{ __html: articleHtml }} />

            {imageItems.length > 0 && (
              <div className="articleImageGallery">
                {imageItems.map((img, idx) => (
                  <figure key={img.id} className="articleGalleryItem">
                    <img
                      src={resolveMediaUrl(img.url)}
                      srcSet={`${resolveMediaUrl(img.url)} 480w, ${resolveMediaUrl(img.url)} 960w`}
                      sizes="(max-width: 1200px) 45vw, 320px"
                      loading="lazy"
                      alt={img.name || "Илюстрация"}
                      onClick={() => setLightboxIndex(idx)}
                    />
                    <figcaption className="articleGalleryCaption">{img.name || "Снимка към статията"}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="articleBody">
            <h3 style={{ marginTop: 0 }}>Коментари</h3>
            {comments.length === 0 && (
              <p style={{ color: "#607693", marginTop: 0 }}>
                Все още няма коментари. Бъди първият, който ще сподели мнение.
              </p>
            )}

            {comments.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {comments.map((c) => (
                  <article
                    key={c.id}
                    style={{
                      border: "1px solid #dbe5f2",
                      borderRadius: 10,
                      padding: 10,
                      background: "#f9fbff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <strong>{c.author_name || `Потребител #${c.author_id}`}</strong>
                      <span style={{ color: "#607693", fontSize: 12 }}>
                        {new Date(c.created_at || "").toLocaleString("bg-BG")}
                      </span>
                    </div>

                    {editingCommentId === c.id ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        <textarea
                          rows={3}
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            disabled={commentBusy}
                            onClick={async () => {
                              const text = editingContent.trim();
                              if (!text) return;
                              try {
                                setCommentBusy(true);
                                await axiosInstance.put(`/api/articles/${id}/comments/${c.id}`, { content: text });
                                setEditingCommentId(null);
                                setEditingContent("");
                                await loadComments();
                              } catch (err) {
                                setError(normalizeError(err));
                              } finally {
                                setCommentBusy(false);
                              }
                            }}
                          >
                            Запази
                          </button>
                          <button
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingContent("");
                            }}
                          >
                            Отказ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{c.content}</p>
                    )}

                    {canManageComment(c) && editingCommentId !== c.id && (
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            setEditingCommentId(c.id);
                            setEditingContent(c.content || "");
                          }}
                        >
                          Редакция
                        </button>
                        <button
                          style={{ color: "#b91c1c" }}
                          onClick={async () => {
                            if (!window.confirm("Изтриване на коментар?")) return;
                            try {
                              setCommentBusy(true);
                              await axiosInstance.delete(`/api/articles/${id}/comments/${c.id}`);
                              await loadComments();
                            } catch (err) {
                              setError(normalizeError(err));
                            } finally {
                              setCommentBusy(false);
                            }
                          }}
                        >
                          Изтрий
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {canComment ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <textarea
                  rows={4}
                  placeholder="Добави коментар..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                />
                <div>
                  <button
                    disabled={commentBusy}
                    onClick={async () => {
                      const text = commentInput.trim();
                      if (!text) return;
                      try {
                        setCommentBusy(true);
                        await axiosInstance.post(`/api/articles/${id}/comments`, { content: text });
                        setCommentInput("");
                        await loadComments();
                      } catch (err) {
                        setError(normalizeError(err));
                      } finally {
                        setCommentBusy(false);
                      }
                    }}
                  >
                    Публикувай коментар
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: "#607693", marginTop: 10 }}>Само треньори и админи могат да публикуват коментари.</p>
            )}
          </section>

          {related.length > 0 && (
            <section className="articleBody">
              <h3 style={{ marginTop: 0 }}>Свързани статии</h3>
              <div className="relatedGrid">
                {related.map((r) => (
                  <article key={r.id} className="relatedCard">
                    <strong>{r.title}</strong>
                    <p style={{ color: "#607693", margin: "8px 0" }}>
                      {r.excerpt || "Практичен материал по близка тема."}
                    </p>
                    <Link to={`/articles/${r.id}`}>Прочети</Link>
                  </article>
                ))}
              </div>
            </section>
          )}
        </ArticleLayout>
      )}

      {lightboxIndex >= 0 && imageItems[lightboxIndex] && (
        <div className="lightboxBackdrop" onClick={() => setLightboxIndex(-1)}>
          <div className="lightboxInner" onClick={(e) => e.stopPropagation()}>
            <div className="lightboxTop">
              <strong>
                {lightboxIndex + 1}/{imageItems.length} • {imageItems[lightboxIndex]?.name || "Снимка"}
              </strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setLightboxIndex((i) => (i - 1 + imageItems.length) % imageItems.length)}>◀</button>
                <button onClick={() => setLightboxIndex((i) => (i + 1) % imageItems.length)}>▶</button>
                <button onClick={() => setLightboxIndex(-1)}>✕</button>
              </div>
            </div>
            <div className="lightboxBody">
              <img
                src={resolveMediaUrl(imageItems[lightboxIndex]?.url)}
                alt={imageItems[lightboxIndex]?.name || "Снимка"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

