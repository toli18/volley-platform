import { useState } from "react";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, EmptyState, Input } from "../ui";
import { normalizeError } from "../../utils/normalizeError";

const todayKey = () => new Date().toISOString().slice(0, 10);

const formatNoticeDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
};

export default function ParentAbsenceNoticeSection({
  notices = [],
  isSession,
  token,
  onChanged,
  formatShortDate = formatNoticeDate,
}) {
  const [noticeDate, setNoticeDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const createPath = isSession
    ? API_PATHS.PARENT_PORTAL_ABSENCE_NOTICES_ME
    : API_PATHS.PARENT_PORTAL_ABSENCE_NOTICES_TOKEN(token);
  const deletePath = (id) =>
    isSession
      ? API_PATHS.PARENT_PORTAL_ABSENCE_NOTICE_ME(id)
      : API_PATHS.PARENT_PORTAL_ABSENCE_NOTICE_TOKEN(token, id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!noticeDate) {
      setError("Изберете дата.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(createPath, {
        notice_date: noticeDate,
        note: note.trim() || null,
      });
      setNoticeDate("");
      setNote("");
      onChanged?.();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      setBusy(true);
      setError("");
      await axiosInstance.delete(deletePath(id));
      onChanged?.();
    } catch (err) {
      setError(normalizeError(err, "Неуспешно отменяне."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="parentPortalAbsenceSection">
      <form className="parentPortalAbsenceForm" onSubmit={handleSubmit}>
        <div className="parentPortalAbsenceFormRow">
          <Input
            type="date"
            value={noticeDate}
            min={todayKey()}
            onChange={(e) => setNoticeDate(e.target.value)}
            aria-label="Дата на отсъствие"
            disabled={busy}
          />
          <Input
            placeholder="Бележка (по желание)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !noticeDate}>
          Съобщи за отсъствие
        </Button>
        {error ? <p className="parentPortalAbsenceError">{error}</p> : null}
      </form>

      {notices.length === 0 ? (
        <EmptyState
          title="Няма предварителни извинения"
          description="Можете да уведомите треньора, ако детето ще липсва на тренировка."
        />
      ) : (
        <ul className="parentPortalAbsenceList">
          {notices.map((row) => (
            <li key={row.id} className="parentPortalAbsenceItem">
              <div>
                <strong>Ще липсва на {formatShortDate(row.notice_date)}</strong>
                {row.team_name ? (
                  <span className="parentPortalHighlightMuted"> · {row.team_name}</span>
                ) : null}
                {row.note ? <p className="parentPortalAbsenceNote">{row.note}</p> : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => handleCancel(row.id)}
              >
                Отмени
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
