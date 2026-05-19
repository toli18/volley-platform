import { resolveStaticUrl } from "../../utils/staticUrl";
import { Button, EmptyState } from "../ui";

export default function TeamPortalCoachNews({ items, busy, deleteItem }) {
  return (
    <div className="teamPortalCoachFeed">
      {items.length === 0 ? (
        <EmptyState title="Няма публикации" description="Добавете текст или снимка от бутоните за публикуване." />
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
