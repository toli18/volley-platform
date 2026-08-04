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

const formatNoticePeriod = (row, formatShortDate) => {
  const start = formatShortDate(row.notice_date);
  const endRaw = row.end_date || row.notice_date;
  if (!endRaw || endRaw === row.notice_date) return start;
  return `${start} – ${formatShortDate(endRaw)}`;
};

export default function ParentAbsenceNoticeSection({
  notices = [],
  isSession,
  token,
  onChanged,
  formatShortDate = formatNoticeDate,
}) {
  const [noticeDate, setNoticeDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      setError("Изберете начална дата.");
      return;
    }
    const end = endDate || noticeDate;
    if (end < noticeDate) {
      setError("Крайната дата трябва да е на или след началната.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      await axiosInstance.post(createPath, {
        notice_date: noticeDate,
        end_date: end,
        note: note.trim() || null,
      });
      setNoticeDate("");
      setEndDate("");
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
            onChange={(e) => {
              const v = e.target.value;
              setNoticeDate(v);
              if (endDate && endDate < v) setEndDate(v);
            }}
            aria-label="От дата"
            disabled={busy}
          />
          <Input
            type="date"
            value={endDate || noticeDate}
            min={noticeDate || todayKey()}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="До дата"
            disabled={busy || !noticeDate}
          />
        </div>
        <Input
          placeholder="Бележка (по желание)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          disabled={busy}
        />
        <p className="uiHint" style={{ margin: "4px 0 0", fontSize: 12 }}>
          Може да маркирате няколко дни (от–до). Известието стои до края на периода; в присъствието е „извинен“.
        </p>
        <Button type="submit" size="sm" disabled={busy || !noticeDate}>
          Съобщи за отсъствие
        </Button>
        {error ? <p className="parentPortalAbsenceError">{error}</p> : null}
      </form>

      {notices.length === 0 ? (
        <EmptyState
          title="Няма предварителни извинения"
          description="Можете да уведомите треньора, ако детето ще липсва на една или повече тренировки."
        />
      ) : (
        <ul className="parentPortalAbsenceList">
          {notices.map((row) => (
            <li key={row.id} className="parentPortalAbsenceItem">
              <div>
                <strong>Ще липсва: {formatNoticePeriod(row, formatShortDate)}</strong>
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
