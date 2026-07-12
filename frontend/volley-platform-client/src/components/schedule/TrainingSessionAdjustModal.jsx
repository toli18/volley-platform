import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { useToast } from "../ToastProvider";
import { Button, EmptyState, Input, Modal } from "../ui";
import { normalizeError } from "../../utils/normalizeError";

export default function TrainingSessionAdjustModal({
  open,
  onClose,
  teamId,
  date,
  isHeadCoach,
  currentUserId,
  coaches = [],
  onSaved,
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [occurrences, setOccurrences] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    location: "",
    start_time: "18:00",
    end_time: "19:30",
    coach_id: "",
  });

  const loadDay = async () => {
    if (!teamId || !date) return;
    setLoading(true);
    try {
      const res = await axiosInstance.get(API_PATHS.SCHEDULE_OCCURRENCES, {
        params: { from: date, to: date, team_id: Number(teamId), include_cancelled: true },
      });
      const rows = (Array.isArray(res.data?.items) ? res.data.items : []).filter(
        (it) => it.event_type !== "competition",
      );
      rows.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
      setOccurrences(rows);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане на графика за деня."));
      setOccurrences([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setEditing(null);
      return;
    }
    loadDay();
  }, [open, teamId, date]);

  const startEdit = (it) => {
    setEditing(it);
    setForm({
      location: it.location || "",
      start_time: it.start_time || "18:00",
      end_time: it.end_time || "19:30",
      coach_id: String(it.coach_id || currentUserId || ""),
    });
  };

  const cancelSession = async (it) => {
    if (!window.confirm("Сигурни ли сте, че искате да отмените тази тренировка? Родителите ще я видят като отменена в графика.")) {
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(it.rule_id), {
        date: it.date,
        kind: "cancelled",
      });
      toast.success("Тренировката е отменена.");
      setEditing(null);
      await loadDay();
      onSaved?.();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна отмяна."));
    } finally {
      setBusy(false);
    }
  };

  const restoreSession = async (it) => {
    if (!it.exception_id) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.SCHEDULE_EXCEPTION_DELETE(it.exception_id));
      toast.success(it.is_cancelled ? "Тренировката е възстановена." : "Корекцията е премахната.");
      setEditing(null);
      await loadDay();
      onSaved?.();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно възстановяване."));
    } finally {
      setBusy(false);
    }
  };

  const saveOverride = async () => {
    if (!editing) return;
    if (!form.location.trim()) {
      toast.error("Въведете зала/място.");
      return;
    }
    const coachId = isHeadCoach ? Number(form.coach_id || 0) : Number(currentUserId);
    if (!coachId) {
      toast.error("Изберете треньор.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.SCHEDULE_EXCEPTION_CREATE(editing.rule_id), {
        date: editing.date,
        kind: "override",
        team_id: Number(teamId),
        coach_id: coachId,
        location: form.location.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
      });
      toast.success("Тренировката е коригирана — промените се виждат в родителския график.");
      setEditing(null);
      await loadDay();
      onSaved?.();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна корекция."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} dismissable={!busy} title={`Тренировка за ${date || ""}`} size="wide">
        <p className="uiHint" style={{ marginTop: 0 }}>
          Отмяна или корекция (зала, час) се отразява веднага в родителския график.
        </p>

        {loading ? (
          <p>Зареждане...</p>
        ) : occurrences.length === 0 ? (
          <EmptyState
            title="Няма планирана тренировка"
            description="За този ден няма запис в седмичния график на отбора. Добавете правило от календара „График“."
          />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {occurrences.map((it, i) => (
              <article
                key={`${it.rule_id}-${it.start_time}-${i}`}
                className={`trainingAdjustCard${it.is_cancelled ? " trainingAdjustCard--cancelled" : ""}`}
              >
                <div className="trainingAdjustCardHead">
                  <div>
                    <strong className={it.is_cancelled ? "trainingAdjustStruck" : ""}>
                      {it.start_time} – {it.end_time}
                    </strong>
                    <div className={`trainingAdjustMeta${it.is_cancelled ? " trainingAdjustStruck" : ""}`}>
                      {it.location}
                      {it.coach_name ? ` · ${it.coach_name}` : ""}
                    </div>
                  </div>
                  {it.is_cancelled ? (
                    <span className="uiBadge uiBadge--secondary">Отменена</span>
                  ) : it.exception_id ? (
                    <span className="uiBadge uiBadge--warning">Коригирана</span>
                  ) : null}
                </div>

                {editing?.rule_id === it.rule_id && editing?.date === it.date && !it.is_cancelled ? (
                  <div className="trainingAdjustForm">
                    {isHeadCoach ? (
                      <Input as="select" value={form.coach_id} onChange={(e) => setForm((p) => ({ ...p, coach_id: e.target.value }))}>
                        <option value="">Треньор</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </Input>
                    ) : null}
                    <Input placeholder="Зала / място" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Input type="time" value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} />
                      <Input type="time" value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button size="sm" disabled={busy} onClick={saveOverride}>Запази корекцията</Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Отказ</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {it.is_cancelled ? (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => restoreSession(it)}>
                        Възстанови
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => startEdit(it)}>
                          Коригирай
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => cancelSession(it)}>
                          Отмени
                        </Button>
                        {it.exception_id ? (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => restoreSession(it)}>
                            Възстанови оригинала
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="uiModalActions" style={{ marginTop: 16 }}>
          <Link to="/coach/schedule">
            <Button variant="secondary" type="button">Пълен график</Button>
          </Link>
          <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
            Затвори
          </Button>
        </div>
    </Modal>
  );
}
