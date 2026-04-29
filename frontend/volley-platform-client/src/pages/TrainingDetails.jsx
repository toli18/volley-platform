// src/pages/TrainingDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../utils/apiClient";
import DrillMediaPreviewModal, { getDrillPrimaryMedia } from "../components/DrillMediaPreviewModal";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import { useToast } from "../components/ToastProvider";

function clipText(s, n = 180) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/* =========================
   Page
========================= */
export default function TrainingDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalDrill, setModalDrill] = useState(null);

  const SECTIONS = useMemo(
    () => [
      { key: "warmup", label: "Загрявка" },
      { key: "technique", label: "Техника" },
      { key: "serve_receive", label: "Сервис / Посрещане" },
      { key: "attack_block", label: "Атака / Блок" },
      { key: "game", label: "Игрова част" },
      { key: "conditioning", label: "Физическа подготовка" },
      { key: "cooldown", label: "Разпускане" },
    ],
    []
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const assignmentId = new URLSearchParams(location.search).get("assignment");
      try {
        const res = await apiJson(`/trainings/${id}/details`);
        setData(res);
      } catch (e) {
        // Fallback: if the page is opened from an assignment card, load details via assignment context.
        if (assignmentId) {
          try {
            const fallback = await apiJson(`/api/trainings/assignments/${assignmentId}/details`);
            setData(fallback);
          } catch (fallbackErr) {
            toast.error(fallbackErr?.message || e?.message || "Грешка при зареждане");
            setData(null);
          }
        } else {
          toast.error(e?.message || "Грешка при зареждане");
          setData(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, location.search]);

  if (loading) return <div className="uiPage">Зареждане…</div>;
  if (!data) return <EmptyState title="Няма данни" description="Не успяхме да заредим детайлите за тренировката." />;

  const plan = data.plan || {};
  const drillsMap = data.drills || {};

  return (
    <div className="wrap">
      <style>{`
        .wrap{padding:14px; max-width:980px; margin:0 auto;}
        .topBar{display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;}
        .title{font-size:22px; font-weight:900; margin:0;}
        .meta{font-size:12px; opacity:.75;}
        .sectionBox{border:1px solid #eee; border-radius:14px; background:#fff; padding:12px; margin-top:12px;}
        .sectionHead{display:flex; align-items:baseline; justify-content:space-between; gap:10px;}
        .sectionName{font-weight:900; font-size:16px;}
        .count{font-size:12px; opacity:.7;}
        .cards{display:grid; gap:10px; margin-top:10px;}
        .cardRow{border:1px solid #e8edf4; border-radius:14px; padding:12px; background:#f8fbff; display:grid; grid-template-columns:120px 1fr auto; gap:10px; align-items:flex-start;}
        @media(max-width: 760px){ .cardRow{grid-template-columns:1fr;} }
        .cardTitle{font-weight:900;}
        .muted{font-size:12px; opacity:.75;}
        .text{font-size:14px; line-height:1.5;}
        .pre{white-space:pre-wrap;}
        .btn{padding:10px 12px; border-radius:12px; border:1px solid #ddd; background:#fff; font-weight:900; cursor:pointer;}
        .btnPrimary{padding:10px 12px; border-radius:12px; border:none; background:#0066cc; color:#fff; font-weight:900; cursor:pointer;}
        .mediaBtn{width:120px; height:78px; border:1px solid #dce4f0; border-radius:12px; background:#fff; overflow:hidden; padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center;}
        .mediaBtn img{width:100%; height:100%; object-fit:cover;}
      `}</style>

      <PageHero
        title={data.title}
        subtitle={`${data.source} • ${data.status} • ${data.created_at ? new Date(data.created_at).toLocaleString() : ""}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/my-trainings")}>Към списъка</Button>
            <Button as={Link} to={`/trainings/${id}/edit`}>Редакция</Button>
          </>
        }
      />

      {data.notes ? (
        <div className="sectionBox" style={{ background: "#fff" }}>
          <div className="sectionName">Бележки</div>
          <div className="text pre" style={{ marginTop: 8 }}>{data.notes}</div>
        </div>
      ) : null}

      {SECTIONS.map((s) => {
        const ids = Array.isArray(plan[s.key]) ? plan[s.key] : [];
        return (
          <div key={s.key} className="sectionBox">
            <div className="sectionHead">
              <div className="sectionName">{s.label}</div>
              <div className="count">{ids.length} упражнения</div>
            </div>

            {ids.length === 0 ? (
              <div className="muted" style={{ marginTop: 10 }}>Няма упражнения.</div>
            ) : (
              <div className="cards">
                {ids.map((drillId, idx) => {
                  const d = drillsMap[String(drillId)] || drillsMap[drillId] || null;

                  const title = d?.title || `Упражнение #${drillId}`;
                  const meta = [d?.category, d?.level, d?.equipment].filter(Boolean).join(" • ") || "—";
                  const desc = d?.description ? clipText(d.description, 170) : "Няма описание.";
                  const media = d ? getDrillPrimaryMedia(d) : null;

                  return (
                    <div key={`${s.key}-${drillId}-${idx}`} className="cardRow">
                      <button className="mediaBtn" onClick={() => d && setModalDrill(d)} title="Бърз преглед">
                        {media?.type === "image" ? (
                          <img src={media.src} alt={title} />
                        ) : media?.type === "video" ? (
                          <span className="muted">🎥 Видео</span>
                        ) : (
                          <span className="muted">Преглед</span>
                        )}
                      </button>

                      <div style={{ minWidth: 0 }}>
                        <div className="cardTitle">{idx + 1}. {title}</div>
                        <div className="muted">{meta}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#333" }}>{desc}</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <Button variant="secondary" onClick={() => d && setModalDrill(d)}>
                          Бърз преглед
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {modalDrill && <DrillMediaPreviewModal drill={modalDrill} onClose={() => setModalDrill(null)} />}
    </div>
  );
}
