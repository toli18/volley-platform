import { authorDisplayLabel, formatDateBg, formatDateTimeBg } from "./articleUtils";
import "./articles.css";

export default function ArticleLayout({
  article,
  readMinutes,
  coverImage,
  tocItems,
  fileBlock,
  externalLinksBlock,
  children,
}) {
  return (
    <div className="articleDetailGrid">
      <main className="articleMainCol">
        <section className="articleHero">
          <div className="articleHeroImageWrap">
            {coverImage ? (
              <img
                src={coverImage}
                srcSet={`${coverImage} 768w, ${coverImage} 1280w`}
                sizes="(max-width: 980px) 100vw, 75vw"
                alt={article?.title || "Корица на статия"}
                className="articleHeroImage"
                loading="eager"
              />
            ) : (
              <div className="articleHeroImage articleHeroPlaceholder">
                <span>Статии и методика</span>
              </div>
            )}
          </div>
          <div className="articleHeroBody">
            <h1>{article?.title}</h1>
            <p className="articleHeroExcerpt">{article?.excerpt || "Практически материал за работа на треньори."}</p>
            <div className="articleHeroMeta">
              <span>{authorDisplayLabel(article)}</span>
              <span>Публикувана: {formatDateBg(article?.created_at)}</span>
              <span>Обновена: {formatDateBg(article?.updated_at)}</span>
              <span>{readMinutes} мин четене</span>
            </div>
          </div>
        </section>

        {children}
      </main>

      <aside className="articleSidebar">
        <div className="articleSidebarCard">
          <h4>Съдържание</h4>
          {tocItems?.length ? (
            <ul>
              {tocItems.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.label}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>Няма структурирани секции.</p>
          )}
        </div>

        <div className="articleSidebarCard">
          <h4>Файлове за сваляне</h4>
          {fileBlock}
        </div>

        <div className="articleSidebarCard">
          <h4>Външни ресурси</h4>
          {externalLinksBlock}
        </div>

        <div className="articleSidebarCard">
          <h4>Последна актуализация</h4>
          <p>{formatDateTimeBg(article?.updated_at)}</p>
        </div>
      </aside>
    </div>
  );
}

