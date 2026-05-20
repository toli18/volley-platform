import { resolveMediaUrl } from "../../utils/drillVideo";
import { drillFirstImageUrl, drillHasVideo, truncateText } from "../../utils/drillDisplayUtils";

export default function AiGenDrillCard({ drill, onPreview, footer }) {
  const title = drill?.title || drill?.name || `Упражнение #${drill?.id}`;
  const imageUrl = resolveMediaUrl(drillFirstImageUrl(drill));
  const hasVideo = drillHasVideo(drill);
  const hasImage = Boolean(imageUrl);

  return (
    <article className="aiGenDrillCard">
      <button type="button" className="aiGenDrillCardMedia" onClick={() => onPreview?.(drill)} aria-label={`Преглед: ${title}`}>
        {hasImage ? (
          <img src={imageUrl} alt="" className="aiGenDrillCardImg" loading="lazy" />
        ) : hasVideo ? (
          <span className="aiGenDrillCardPlay" aria-hidden>
            ▶
          </span>
        ) : (
          <span className="aiGenDrillCardEmpty" aria-hidden>
            —
          </span>
        )}
      </button>
      <div className="aiGenDrillCardBody">
        <p className="aiGenDrillCardMeta">
          {drill?.level || "Всички нива"}
          {drill?.category ? ` · ${drill.category}` : ""}
        </p>
        <h4 className="aiGenDrillCardTitle">{title}</h4>
        {drill?.description ? <p className="aiGenDrillCardDesc">{truncateText(drill.description, 72)}</p> : null}
        {footer}
      </div>
    </article>
  );
}
