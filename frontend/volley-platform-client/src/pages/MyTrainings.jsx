// src/pages/MyTrainings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Button, EmptyState, Input, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

function fmtDate(v) {
  try {
    if (!v) return "";
    return new Date(v).toLocaleString();
  } catch {
    return "";
  }
}

function chipVariant({ status, source }) {
  const s = String(status || "").toLowerCase();
  const src = String(source || "").toLowerCase();

  const statusTone =
    s.includes("чернова") || s.includes("draft") ? "warn" : s.includes("запаз") || s.includes("saved") ? "ok" : "muted";

  const sourceTone =
    src.includes("генер") || src.includes("generated") ? "info" : src.includes("ръч") || src.includes("manual") ? "muted" : "muted";

  return { statusTone, sourceTone };
}

export default function MyTrainings() {
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | saved | draft
  const [filterSource, setFilterSource] = useState("all"); // all | generated | manual
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all"); // all | new | in_progress | done
  const [assignmentSort, setAssignmentSort] = useState("newest"); // newest | due_asc | due_desc | status
  const [doneModal, setDoneModal] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [data, myAssignments] = await Promise.all([
        apiJson("/trainings/my"),
        apiJson(API_PATHS.MY_TRAINING_ASSIGNMENTS).catch(() => []),
      ]);
      setItems(Array.isArray(data) ? data : []);
      setAssignments(Array.isArray(myAssignments) ? myAssignments : []);
    } catch (e) {
      toast.error(e?.message || "Грешка при зареждане на тренировките");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(id, title) {
    const ok = confirm(`Сигурен ли си, че искаш да изтриеш тренировката?\n\n${title || `#${id}`}`);
    if (!ok) return;

    try {
      await apiJson(`/trainings/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success("Тренировката е изтрита.");
    } catch (e) {
      toast.error(e?.message || "Неуспешно изтриване");
    }
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return (items || [])
      .filter((t) => {
        if (!qq) return true;
        const hay = `${t?.title || ""} ${t?.id || ""} ${t?.status || ""} ${t?.source || ""}`.toLowerCase();
        return hay.includes(qq);
      })
      .filter((t) => {
        const s = String(t?.status || "").toLowerCase();
        if (filterStatus === "saved") return s.includes("запаз") || s.includes("saved");
        if (filterStatus === "draft") return s.includes("чернова") || s.includes("draft");
        return true;
      })
      .filter((t) => {
        const src = String(t?.source || "").toLowerCase();
        if (filterSource === "generated") return src.includes("генер") || src.includes("generated");
        if (filterSource === "manual") return src.includes("ръч") || src.includes("manual");
        return true;
      })
      .sort((a, b) => {
        const da = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });
  }, [items, q, filterStatus, filterSource]);

  const updateAssignmentStatus = async (assignmentId, status, completionNote = null) => {
    try {
      const data = { status };
      if (status === "done" && completionNote !== undefined) {
        data.completion_note = completionNote;
      }
      await apiJson(API_PATHS.TRAINING_ASSIGNMENT_UPDATE(assignmentId), {
        method: "PATCH",
        data,
      });
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== assignmentId) return a;
          if (status === "done" && completionNote !== undefined) {
            return { ...a, status, completion_note: completionNote };
          }
          return { ...a, status, completion_note: status === "done" ? a.completion_note : null };
        })
      );
      toast.success("Статусът на задачата е обновен.");
    } catch (e) {
      toast.error(e?.message || "Грешка при обновяване на задачата");
    }
  };

  const submitDoneModal = async () => {
    if (!doneModal) return;
    const note = (doneModal.completionNote || "").trim();
    await updateAssignmentStatus(doneModal.id, "done", note || null);
    setDoneModal(null);
  };

  const deleteAssignment = async (assignmentId) => {
    const ok = confirm("Да изтрия ли задачата? Това е позволено само за задачи със статус 'Готово'.");
    if (!ok) return;
    try {
      await apiJson(API_PATHS.TRAINING_ASSIGNMENT_DELETE(assignmentId), { method: "DELETE" });
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      toast.success("Задачата е изтрита.");
    } catch (e) {
      toast.error(e?.message || "Грешка при изтриване на задачата");
    }
  };

  const filteredAssignments = useMemo(() => {
    let list = [...(assignments || [])];
    if (assignmentStatusFilter !== "all") {
      list = list.filter((a) => String(a?.status || "").toLowerCase() === assignmentStatusFilter);
    }
    if (assignmentSort === "due_asc") {
      list.sort((a, b) => String(a?.due_date || "9999-99-99").localeCompare(String(b?.due_date || "9999-99-99")));
    } else if (assignmentSort === "due_desc") {
      list.sort((a, b) => String(b?.due_date || "").localeCompare(String(a?.due_date || "")));
    } else if (assignmentSort === "status") {
      const order = { new: 0, in_progress: 1, done: 2 };
      list.sort((a, b) => (order[a?.status] ?? 99) - (order[b?.status] ?? 99));
    } else {
      list.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
    }
    return list;
  }, [assignments, assignmentStatusFilter, assignmentSort]);

  return (
    <div className="mtWrap">
      <style>{`
        .mtWrap{padding:14px; max-width:1100px; margin:0 auto;}
        .mtHeader{display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;}
        .mtTitle{margin:0; font-size:22px; font-weight:950; letter-spacing:-0.2px;}
        .mtSub{font-size:13px; color:#666; margin-top:4px;}
        .mtActions{display:flex; gap:8px; flex-wrap:wrap; align-items:center;}
        .btn{appearance:none; border:1px solid #e6e6e6; background:#fff; border-radius:12px; padding:10px 12px; font-weight:900; cursor:pointer; line-height:1;}
        .btn:hover{background:#fafafa;}
        .btnPrimary{border:none; background:#0b5cff; color:#fff;}
        .btnPrimary:hover{filter:brightness(.97);}
        .btnDanger{border:1px solid #ffd6d6; background:#fff; color:#b30000;}
        .btnDanger:hover{background:#fff5f5;}
        .controls{margin-top:12px; display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center;}
        @media(max-width: 780px){ .controls{grid-template-columns:1fr; } }
        .input{width:100%; padding:11px 12px; border-radius:12px; border:1px solid #e6e6e6; background:#fff; outline:none;}
        .input:focus{border-color:#b7cffc; box-shadow:0 0 0 3px rgba(11,92,255,.12);}
        .select{width:100%; padding:11px 12px; border-radius:12px; border:1px solid #e6e6e6; background:#fff; outline:none;}
        .grid{margin-top:14px; display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));}
        .card{border:1px solid #eee; border-radius:16px; background:#fff; padding:12px; box-shadow:0 2px 10px rgba(0,0,0,.03);}
        .rowTop{display:flex; gap:10px; align-items:flex-start; justify-content:space-between;}
        .cardTitle{font-weight:950; font-size:16px; margin:0; line-height:1.25;}
        .meta{font-size:12px; color:#777; margin-top:6px;}
        .chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;}
        .chip{font-size:12px; font-weight:900; padding:6px 10px; border-radius:999px; border:1px solid #eee; background:#fafafa; color:#444;}
        .chip.ok{background:#ecfff2; border-color:#c7f2d4; color:#0a7a2f;}
        .chip.warn{background:#fff7e6; border-color:#ffe3a8; color:#8a5a00;}
        .chip.info{background:#eef5ff; border-color:#cfe2ff; color:#0b5cff;}
        .chip.muted{background:#fafafa; border-color:#eee; color:#444;}
        .cardActions{margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;}
        .empty{margin-top:14px; border:1px dashed #e6e6e6; border-radius:16px; padding:16px; background:#fff; color:#666;}
        .skeleton{height:86px; border-radius:16px; background:linear-gradient(90deg,#f3f3f3,#fafafa,#f3f3f3); background-size:200% 100%; animation:shimmer 1.2s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      <div className="mtHeader">
        <PageHero
          title="Моите тренировки"
          subtitle={loading ? "Зареждане…" : `${filtered.length} тренировк${filtered.length === 1 ? "а" : "и"}`}
          actions={
            <>
              <Button variant="secondary" onClick={load} title="Опресни">↻ Опресни</Button>
              <Button onClick={() => navigate("/generator")}>＋ Нова тренировка</Button>
            </>
          }
        />
      </div>

      <div className="controls">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Търси по заглавие, ID, статус…"
        />

        <Input as="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">Всички статуси</option>
          <option value="saved">Запазени</option>
          <option value="draft">Чернови</option>
        </Input>

        <Input as="select" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="all">Всички източници</option>
          <option value="generated">Генерирани</option>
          <option value="manual">Ръчни</option>
        </Input>
      </div>

      <div style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px" }}>Възложени към мен задачи</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Input as="select" value={assignmentStatusFilter} onChange={(e) => setAssignmentStatusFilter(e.target.value)}>
            <option value="all">Всички статуси</option>
            <option value="new">Нови</option>
            <option value="in_progress">В процес</option>
            <option value="done">Готови</option>
          </Input>
          <Input as="select" value={assignmentSort} onChange={(e) => setAssignmentSort(e.target.value)}>
            <option value="newest">Най-нови</option>
            <option value="due_asc">Срок (най-близък)</option>
            <option value="due_desc">Срок (най-далечен)</option>
            <option value="status">По статус</option>
          </Input>
        </div>
        {filteredAssignments.length === 0 ? (
          <div className="empty">Няма възложени тренировки.</div>
        ) : (
          <div className="grid">
            {filteredAssignments.map((a) => (
              <div key={a.id} className="card">
                <div className="cardTitle">{a.training_title || `Тренировка #${a.training_id}`}</div>
                <div className="meta">
                  От: {a.assigned_by_name || `#${a.assigned_by}`} • Срок: {a.due_date || "—"}
                </div>
                {a.note && <div style={{ marginTop: 8, fontSize: 13 }}>Бележка от възлагащия: {a.note}</div>}
                {a.completion_note && (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#0f766e" }}>Отчет: {a.completion_note}</div>
                )}
                <div className="cardActions">
                  <Button as={Link} to={`/trainings/${a.training_id}?assignment=${a.id}`} variant="secondary">Преглед</Button>
                  <Button
                    variant={a.status === "new" ? "primary" : "secondary"}
                    onClick={() => updateAssignmentStatus(a.id, "in_progress")}
                  >
                    В процес
                  </Button>
                  <Button
                    variant={a.status === "done" ? "primary" : "secondary"}
                    onClick={() => setDoneModal({ id: a.id, completionNote: a.completion_note || "" })}
                  >
                    Готово
                  </Button>
                  {String(a?.status || "").toLowerCase() === "done" && (
                    <Button variant="danger" onClick={() => deleteAssignment(a.id)}>
                      Изтрий
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Няма тренировки по тези филтри"
          description="Създай нова тренировка или изчисти филтрите."
          action={<Button onClick={() => navigate("/generator")}>＋ Нова тренировка</Button>}
        />
      ) : (
        <div className="grid">
          {filtered.map((t) => {
            const title = t?.title || "(без заглавие)";
            const { statusTone, sourceTone } = chipVariant({ status: t?.status, source: t?.source });
            return (
              <div key={t.id} className="card">
                <div className="rowTop">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="cardTitle" title={title}>{title}</h3>
                    <div className="meta">
                      ID: {t.id} • {fmtDate(t.created_at)}
                    </div>

                    <div className="chips">
                      <span className={`chip ${sourceTone}`}>{t?.source || "—"}</span>
                      <span className={`chip ${statusTone}`}>{t?.status || "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="cardActions">
                  <Button as={Link} to={`/trainings/${t.id}`} variant="secondary">
                    ▶ Преглед
                  </Button>
                  <Button as={Link} to={`/trainings/${t.id}/edit`}>
                    ✎ Редакция
                  </Button>
                  <Button variant="danger" onClick={() => onDelete(t.id, title)}>
                    🗑 Изтрий
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {doneModal && (
        <div
          role="presentation"
          onClick={() => setDoneModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 420px)",
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 12px 40px rgba(15,23,42,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 8px" }}>Маркирай като готово</h3>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: "#64748b" }}>
              По желание добави кратък отчет за главния треньор (напр. как мина тренировката).
            </p>
            <Input
              as="textarea"
              rows={4}
              value={doneModal.completionNote}
              onChange={(e) => setDoneModal((m) => (m ? { ...m, completionNote: e.target.value } : m))}
              placeholder="Отчет (по желание)…"
              style={{ width: "100%", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <Button variant="secondary" type="button" onClick={() => setDoneModal(null)}>
                Отказ
              </Button>
              <Button type="button" onClick={submitDoneModal}>
                Потвърди готово
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
