import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { formatMoney } from "../../utils/currency";

export default function NotificationPanel({
  isHeadCoachUser,
  isPlatformAdmin,
  unifiedFeedItems,
  onClose,
  markFeeItemSeen,
  markTaskItemSeen,
  markSekItemSeen,
  markEnrollmentItemSeen,
  markAllClubFeedSeen,
  markForumItemRead,
  markAllForumRead,
  markPilotItemSeen,
  markAllPilotSeen,
}) {
  return (
    <div id="nav-notifications-panel" className="navShellPanel navShellPanel--wide" role="region" aria-label="Известия">
      <div className="navShellPanel__head">
        <strong>Известия</strong>
        <div className="navShellPanel__headActions">
          <button type="button" className="navShellPanel__linkBtn" onClick={markAllForumRead}>
            Форум: всички
          </button>
          {isPlatformAdmin ? (
            <button type="button" className="navShellPanel__linkBtn" onClick={markAllPilotSeen}>
              Пилот: всички
            </button>
          ) : null}
          {isHeadCoachUser ? (
            <button type="button" className="navShellPanel__linkBtn" onClick={markAllClubFeedSeen}>
              Клуб: прочетени
            </button>
          ) : null}
        </div>
      </div>
      <span className="navShellPanel__hint">
        {isPlatformAdmin
          ? "Пилотни заявки, форум и клуб на едно място."
          : isHeadCoachUser
            ? "Форум, такси, СЕК задачи и отчети (клуб) на едно място."
            : "Форум и СЕК задачи за твоите състезатели."}
      </span>
      {unifiedFeedItems.length === 0 ? <span className="navShellPanel__empty">Няма известия.</span> : null}
      {unifiedFeedItems.map((row) => {
        if (row.kind === "forum") {
          const item = row.forum;
          return (
            <Link
              key={row.key}
              to={`/forum/${item.post_id}`}
              onClick={async () => {
                try {
                  if (!item.is_read) await axiosInstance.post(API_PATHS.FORUM_NOTIFICATION_READ(item.id));
                } catch {
                  // ignore
                } finally {
                  markForumItemRead(item);
                  onClose();
                }
              }}
              className={`navShellPanel__row ${row.unread ? "navShellPanel__row--unread" : ""}`}
            >
              <div className="navShellPanel__tag">Форум</div>
              <div>{item.message}</div>
              <div className="navShellPanel__rowMeta">{new Date(item.created_at || "").toLocaleString("bg-BG")}</div>
            </Link>
          );
        }
        if (row.kind === "pilot") {
          const item = row.pilot;
          return (
            <Link
              key={row.key}
              to="/admin/pilot-requests"
              onClick={() => {
                markPilotItemSeen(item.id);
                onClose();
              }}
              className={`navShellPanel__row navShellPanel__row--task ${row.unread ? "navShellPanel__row--unread" : ""}`}
            >
              <div className="navShellPanel__tag">Пилот · клуб</div>
              <div className="navShellPanel__rowTitle">{item.club_name}</div>
              <div className="navShellPanel__rowMeta">
                {[item.city, item.region].filter(Boolean).join(" · ") || "—"} · {item.contact_name}
              </div>
            </Link>
          );
        }
        if (row.kind === "sek") {
          const item = row.sek;
          return (
            <Link
              key={row.key}
              to={`/coach/athletes/${item.athlete_id}?tab=bvf`}
              onClick={() => {
                markSekItemSeen?.(item.athlete_id);
                onClose();
              }}
              className={`navShellPanel__row navShellPanel__row--task ${row.unread ? "navShellPanel__row--unread" : ""}`}
            >
              <div className="navShellPanel__tag">СЕК · задача</div>
              <div className="navShellPanel__rowTitle">{item.athlete_name}</div>
              <div className="navShellPanel__rowMeta">
                {item.sek_task_detail ||
                  (item.sek_task_code === "need_photo" ? "Липсва снимка" : "Липсват данни")}
              </div>
            </Link>
          );
        }
        if (row.kind === "enrollment") {
          const item = row.enrollment;
          const trial =
            item.trial_date && item.trial_time
              ? `${item.trial_date} · ${item.trial_time}`
              : item.trial_date || "Нова заявка";
          return (
            <Link
              key={row.key}
              to="/coach/enrollments"
              onClick={() => {
                markEnrollmentItemSeen?.(item.id);
                onClose();
              }}
              className={`navShellPanel__row navShellPanel__row--task ${row.unread ? "navShellPanel__row--unread" : ""}`}
            >
              <div className="navShellPanel__tag">Пробна · записване</div>
              <div className="navShellPanel__rowTitle">{item.child_name}</div>
              <div className="navShellPanel__rowMeta">
                {trial} · {item.parent_name} · {item.parent_phone}
              </div>
            </Link>
          );
        }
        if (row.kind === "fee") {
          const item = row.fee;
          return (
            <Link
              key={row.key}
              to={`/coach/fees?athlete_id=${item.athlete_id}`}
              onClick={() => {
                markFeeItemSeen(item.id);
                onClose();
              }}
              className={`navShellPanel__row navShellPanel__row--fee ${row.unread ? "navShellPanel__row--unread" : ""}`}
            >
              <div className="navShellPanel__tag">Такса (клуб)</div>
              <div className="navShellPanel__rowTitle">{item.athlete_name}</div>
              <div className="navShellPanel__rowMeta">
                {item.month_key} · {formatMoney(item.amount)} · от {item.coach_name}
              </div>
            </Link>
          );
        }
        const item = row.task;
        return (
          <Link
            key={row.key}
            to={`/trainings/${item.training_id}?assignment=${item.id}`}
            onClick={() => {
              markTaskItemSeen(item.id);
              onClose();
            }}
            className={`navShellPanel__row navShellPanel__row--task ${row.unread ? "navShellPanel__row--unread" : ""}`}
          >
            <div className="navShellPanel__tag">Задача готова</div>
            <div className="navShellPanel__rowTitle">{item.training_title || `Тренировка #${item.training_id}`}</div>
            <div className="navShellPanel__rowMeta">
              Отчетена от: {item.assigned_to_name || `#${item.assigned_to}`}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
