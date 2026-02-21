import "./ui.css";

export default function EmptyState({ icon = "📭", title, description, action }) {
  return (
    <div className="uiEmptyState">
      <div className="uiEmptyStateIcon" aria-hidden="true">
        {icon}
      </div>
      {title ? <h4 className="uiEmptyStateTitle">{title}</h4> : null}
      {description ? <p className="uiEmptyStateDescription">{description}</p> : null}
      {action || null}
    </div>
  );
}

