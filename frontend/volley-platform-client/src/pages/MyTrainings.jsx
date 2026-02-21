// src/pages/MyTrainings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../utils/apiClient";
import { Button, EmptyState, Input } from "../components/ui";

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
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | saved | draft
  const [filterSource, setFilterSource] = useState("all"); // all | generated | manual
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const data = await apiJson("/trainings/my");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e?.message || "Грешка при зареждане на тренировките");
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
    } catch (e) {
      alert(e?.message || "Неуспешно изтриване");
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
        <div>
          <h1 className="mtTitle">Моите тренировки</h1>
          <div className="mtSub">
            {loading ? "Зареждане…" : `${filtered.length} тренировк${filtered.length === 1 ? "а" : "и"}`}
          </div>
        </div>

        <div className="mtActions">
          <Button variant="secondary" onClick={load} title="Опресни">
            ↻ Опресни
          </Button>
          <Button onClick={() => navigate("/generator")}>＋ Нова тренировка</Button>
        </div>
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
    </div>
  );
}
