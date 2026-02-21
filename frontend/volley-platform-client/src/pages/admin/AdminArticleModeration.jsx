import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import ArticleAttachmentList from "../../components/articles/ArticleAttachmentList";
import {
  estimateReadMinutes,
  formatDateTimeBg,
  resolveMediaUrl,
  statusMeta,
} from "../../components/articles/articleUtils";
import "../../components/articles/articles.css";
import { Button, Card, Input } from "../../components/ui";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при модерация.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при модерация.";
};

export default function AdminArticleModeration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(`/api/articles/${id}`);
      setArticle(res.data);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const approve = async () => {
    try {
      setActing(true);
      setError("");
      await axiosInstance.post(`/api/admin/articles/${id}/approve`);
      navigate("/admin/articles/pending");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) {
      setError("Въведи причина за отказ.");
      return;
    }
    try {
      setActing(true);
      setError("");
      await axiosInstance.post(`/api/admin/articles/${id}/reject`, { reason: reason.trim() });
      navigate("/admin/articles/pending");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setActing(false);
    }
  };

  const needsEdit = async () => {
    if (!comment.trim()) {
      setError("Въведи коментар за редакция.");
      return;
    }
    try {
      setActing(true);
      setError("");
      await axiosInstance.post(`/api/admin/articles/${id}/needs-edit`, { comment: comment.trim() });
      navigate("/admin/articles/pending");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="uiPage" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        <Button as={Link} to="/admin/articles/pending" variant="secondary" size="sm">
          ← Към чакащи статии
        </Button>
      </div>
      <h2 style={{ marginTop: 0 }}>Модерация на статия</h2>
      {loading && <p>Зареждане...</p>}
      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      {!loading && article && (
        <>
          <Card className="articleBody">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>{article.title}</h3>
              <span className={`chip chipStatus ${statusMeta(article.status).className}`}>
                {statusMeta(article.status).label}
              </span>
            </div>
            <p style={{ color: "#607693", marginTop: 0 }}>{article.excerpt || "Няма кратко описание."}</p>
            <div style={{ color: "#607693", fontSize: 12, marginBottom: 10 }}>
              Автор #{article.author_id} • {estimateReadMinutes(article.content)} мин четене • Последна промяна:{" "}
              {formatDateTimeBg(article.updated_at)}
            </div>
            <div className="articleTypography">
              <p style={{ whiteSpace: "pre-wrap" }}>{article.content}</p>
            </div>

            {Array.isArray(article.media_items) &&
              article.media_items.some((m) => String(m?.type || "").toUpperCase() === "IMAGE") && (
                <div className="articleImageGallery">
                  {article.media_items
                    .filter((m) => String(m?.type || "").toUpperCase() === "IMAGE")
                    .map((img) => (
                      <figure key={img.id} className="articleGalleryItem">
                        <img src={resolveMediaUrl(img.url)} alt={img.name || "Снимка"} loading="lazy" />
                        <figcaption className="articleGalleryCaption">{img.name || "Изображение"}</figcaption>
                      </figure>
                    ))}
                </div>
              )}
          </Card>

          <Card className="articleBody">
            <h4 style={{ marginTop: 0 }}>Материали за сваляне</h4>
            <ArticleAttachmentList attachments={article.media_items || []} />
            <h4 style={{ marginTop: 14 }}>Външни ресурси</h4>
            {Array.isArray(article.links) && article.links.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {article.links.map((l) => (
                  <a key={l.id} href={l.url} target="_blank" rel="noreferrer">
                    {l.title || l.url}
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ color: "#607693" }}>Няма добавени външни ресурси.</p>
            )}
          </Card>

          <Card className="articleBody">
            <h4 style={{ marginTop: 0 }}>Действие на модератор</h4>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Причина за отказ</label>
                <Input
                  as="textarea"
                  rows={3}
                  placeholder="напр. Липсват конкретни примери за изпълнение"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontWeight: 800, display: "block", marginBottom: 6 }}>Коментар за редакция</label>
                <Input
                  as="textarea"
                  rows={3}
                  placeholder="напр. Добави диаграма и 2 тренировъчни варианта"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <Button disabled={acting} onClick={approve}>
                Одобри статия
              </Button>
              <Button disabled={acting} onClick={reject} variant="danger">
                Откажи с причина
              </Button>
              <Button disabled={acting} onClick={needsEdit} variant="secondary">
                Върни за редакция
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

