import { resolveStaticUrl } from "../../utils/staticUrl";
import { EmptyState } from "../ui";

function formatFeedTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function FeedCard({ item }) {
  const isImage = item.kind === "image" && item.url;
  return (
    <article className="parentPortalFeedCard">
      <div className="parentPortalFeedCardMeta">
        <time dateTime={item.created_at}>{formatFeedTime(item.created_at)}</time>
        {item.team_name ? <span className="parentPortalFeedCardTeam">{item.team_name}</span> : null}
      </div>
      {isImage ? (
        <figure className="parentPortalFeedCardMedia">
          <img src={resolveStaticUrl(item.url)} alt={item.file_name || "Снимка"} loading="lazy" />
        </figure>
      ) : (
        <p className="parentPortalFeedCardBody">{item.body}</p>
      )}
    </article>
  );
}

export default function ParentPortalFeed({ items }) {
  if (!items?.length) {
    return (
      <EmptyState
        title="Няма новини"
        description="Треньорът ще публикува съобщения за отбора тук."
      />
    );
  }

  return (
    <div className="parentPortalFeedList">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </div>
  );
}
