import { Link } from "react-router-dom";

export default function TasksPanel({ tasks, onClose }) {
  return (
    <div id="nav-tasks-panel" className="navShellPanel" role="region" aria-label="Център задачи">
      <div className="navShellPanel__head">
        <strong>Задачи</strong>
        <Link className="navShellPanel__linkBtn" to="/my-trainings" onClick={onClose}>
          Всички
        </Link>
      </div>
      {tasks.length === 0 ? <span className="navShellPanel__empty">Няма активни задачи.</span> : null}
      {tasks.map((item) => (
        <Link
          key={item.id}
          to="/my-trainings"
          onClick={onClose}
          className={`navShellPanel__row ${String(item.status || "").toLowerCase() === "new" ? "navShellPanel__row--new" : ""}`}
        >
          <div className="navShellPanel__rowTitle">{item.training_title || `Тренировка #${item.training_id}`}</div>
          <div className="navShellPanel__rowMeta">
            Статус:{" "}
            {item.status === "done" ? "Готово" : item.status === "in_progress" ? "В процес" : "Нова"}
            {item.due_date ? ` · Срок: ${item.due_date}` : ""}
          </div>
        </Link>
      ))}
    </div>
  );
}
