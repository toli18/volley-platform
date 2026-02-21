import { Link } from "react-router-dom";
import {
  articleLevel,
  articleTopics,
  authorDisplayLabel,
  estimateReadMinutes,
  formatDateBg,
  getLocalReadCount,
  pickCoverImage,
  statusMeta,
} from "./articleUtils";
import "./articles.css";

function placeholderStyle() {
  return {
    background:
      "linear-gradient(135deg, rgba(11,92,255,0.13), rgba(20,150,96,0.08)), radial-gradient(circle at 20% 10%, rgba(255,255,255,0.35), transparent 45%)",
  };
}

export default function ArticleCard({ article }) {
  const cover = pickCoverImage(article);
  const topics = articleTopics(article);
  const level = articleLevel(article);
  const readMin = estimateReadMinutes(article?.content || article?.excerpt || "");
  const st = statusMeta(article?.status);
  const readCount = getLocalReadCount(article.id);

  return (
    <article className="articleCard">
      <div className="articleThumbWrap">
        {cover ? (
          <img
            src={cover}
            srcSet={`${cover} 480w, ${cover} 960w`}
            sizes="(max-width: 740px) 100vw, 33vw"
            alt={article?.title || "Статия"}
            className="articleThumb"
            loading="lazy"
          />
        ) : (
          <div className="articleThumb articleThumbPlaceholder" style={placeholderStyle()}>
            <span>Статия</span>
          </div>
        )}
      </div>

      <div className="articleCardBody">
        <div className="articleBadges">
          {topics.map((t) => (
            <span key={t} className="chip chipTopic">
              {t}
            </span>
          ))}
          <span className="chip chipLevel">{level}</span>
          <span className={`chip chipStatus ${st.className}`}>{st.label}</span>
        </div>

        <h3 className="articleTitleClamp">{article?.title}</h3>
        <p className="articleExcerptClamp">{article?.excerpt || "Материал с практични насоки за треньорска работа."}</p>

        <div className="articleMetaRow">
          <span>{authorDisplayLabel(article)}</span>
          <span>{formatDateBg(article?.created_at)}</span>
          <span>{readMin} мин четене</span>
          <span>{readCount} прегледа</span>
        </div>

        <div className="articleCtaRow">
          <Link className="articleReadBtn" to={`/articles/${article?.id}`}>
            Прочети
          </Link>
        </div>
      </div>
    </article>
  );
}

