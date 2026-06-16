// src/pages/EditTraining.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../utils/apiClient";
import DrillMediaPreviewModal, { getDrillPrimaryMedia } from "../components/DrillMediaPreviewModal";
import { SessionReviewCard } from "../components/ai/SessionReviewCard";
import { SectionBvfContext } from "../components/ai/SectionBvfContext";
import { BVF_FIELD_PHASES, PLAN_SECTION_DEFS, sectionGuide } from "../utils/trainingPlanSections";
import { normalizePlan } from "../utils/trainingPlanNormalize";

export default function EditTraining() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const SECTIONS = useMemo(() => PLAN_SECTION_DEFS, []);

  const emptyPlan = useMemo(() => {
    const p = {};
    for (const s of SECTIONS) p[s.key] = [];
    return p;
  }, [SECTIONS]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    status: "чернова",      // ✅ бекенд enum
    source: "генерирана",   // ✅ бекенд enum
    notes: "",
  });

  const [plan, setPlan] = useState(emptyPlan);

  const [drills, setDrills] = useState([]);
  const [q, setQ] = useState("");
  const [activeSection, setActiveSection] = useState("warmup");
  const [sessionReview, setSessionReview] = useState(null);
  const [modalDrill, setModalDrill] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const details = await apiJson(`/trainings/${id}/details`);

        setForm({
          title: details?.title ?? "",
          status: details?.status ?? "чернова",
          source: details?.source ?? "генерирана",
          notes: details?.notes ?? "",
        });

        const p = normalizePlan(details?.plan || {});
        setPlan(p);
        setSessionReview(details?.sessionReview || null);

        // drills list (за добавяне/замяна)
        const drillsList = await apiJson("/drills/");
        setDrills(Array.isArray(drillsList) ? drillsList : []);
      } catch (e) {
        toast.error(e?.message || "Грешка при зареждане");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, emptyPlan]);

  const drillById = useMemo(() => {
    const m = new Map();
    drills.forEach((d) => m.set(Number(d.id), d));
    return m;
  }, [drills]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    if (!qv) return drills;
    return drills.filter((d) => {
      const t = (d.title || d.name || "").toLowerCase();
      const desc = (d.description || "").toLowerCase();
      return t.includes(qv) || desc.includes(qv);
    });
  }, [drills, q]);

  function addToSection(drillId, sectionKey) {
    const idNum = Number(drillId);
    const guide = sectionGuide(sessionReview, sectionKey);
    const defaultMin = guide?.targetMinutes
      ? Math.max(5, Math.floor(guide.targetMinutes / Math.max(1, (plan[sectionKey] || []).length + 1)))
      : 10;
    setPlan((prev) => {
      const next = { ...prev };
      const arr = Array.isArray(next[sectionKey]) ? [...next[sectionKey]] : [];
      if (!arr.some((x) => x.drillId === idNum)) {
        arr.push({ drillId: idNum, minutes: defaultMin, coachNote: "" });
      }
      next[sectionKey] = arr;
      return next;
    });
  }

  function removeFromSection(drillId, sectionKey) {
    const idNum = Number(drillId);
    setPlan((prev) => {
      const next = { ...prev };
      next[sectionKey] = (next[sectionKey] || []).filter((x) => x.drillId !== idNum);
      return next;
    });
  }

  function setItemMinutes(sectionKey, drillId, minutes) {
    const idNum = Number(drillId);
    const mins = Math.max(3, Number(minutes) || 10);
    setPlan((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((x) =>
        x.drillId === idNum ? { ...x, minutes: mins } : x
      ),
    }));
  }

  function move(sectionKey, idx, dir) {
    setPlan((prev) => {
      const next = { ...prev };
      const arr = [...(next[sectionKey] || [])];
      const ni = idx + dir;
      if (ni < 0 || ni >= arr.length) return prev;
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      next[sectionKey] = arr;
      return next;
    });
  }

  async function onSave() {
    const t = form.title.trim();
    if (!t) {
      toast.error("Заглавието е задължително.");
      return;
    }

    setSaving(true);
    try {
      await apiJson(`/trainings/${id}`, {
        method: "PATCH",
        data: {
          title: t,
          status: form.status,   // ✅ "чернова"/"запазена"
          source: form.source,   // ✅ "ръчна"/"генерирана"
          notes: form.notes || null,
          plan: plan,            // ✅ dict section -> [ids]
        },
      });

      toast.success("Запазено.");
      navigate(`/trainings/${id}`);
    } catch (e) {
      toast.error(e?.message || "Грешка при запис (PATCH)");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Зареждане…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <PageHero
        title={`Редакция на тренировка #${id}`}
        subtitle="Промени плана, реда и настройките преди запазване."
        actions={
          <>
            <Button variant="secondary" as={Link} to={`/trainings/${id}`}>Преглед</Button>
            <Button as={Link} to={`/trainings/${id}?mode=field`} variant="secondary">Режим зала</Button>
            <Button variant="secondary" as={Link} to="/my-trainings">Към списъка</Button>
          </>
        }
      />

      <SessionReviewCard sessionReview={sessionReview} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* LEFT: Form + Plan */}
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 900, fontSize: 12 }}>Заглавие *</div>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>
                <div style={{ fontWeight: 900, fontSize: 12 }}>Статус</div>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="чернова">чернова</option>
                  <option value="запазена">запазена</option>
                </select>
              </label>

              <label>
                <div style={{ fontWeight: 900, fontSize: 12 }}>Източник</div>
                <select
                  value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="генерирана">генерирана</option>
                  <option value="ръчна">ръчна</option>
                </select>
              </label>
            </div>

            <label>
              <div style={{ fontWeight: 900, fontSize: 12 }}>Бележки</div>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={4}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={onSave} disabled={saving}>
                {saving ? "Запис..." : "Запази промените"}
              </Button>
            </div>
          </div>

          <hr style={{ margin: "14px 0" }} />

          <div style={{ fontWeight: 900, marginBottom: 8 }}>План (4 BVF фази)</div>

          <div style={{ display: "grid", gap: 14 }}>
            {BVF_FIELD_PHASES.map((phase) => {
              const guide = (sessionReview?.blockGuide || []).find((g) => g.blockType === phase.block);
              const sections = phase.sectionKeys
                .map((key) => SECTIONS.find((s) => s.key === key))
                .filter(Boolean);
              const totalItems = sections.reduce((n, s) => n + (plan[s.key] || []).length, 0);
              if (!totalItems && !guide) return null;
              return (
                <div key={phase.block} style={{ border: "1px solid #c7d8f0", borderRadius: 12, padding: 12, background: "#f8fbff" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>{phase.block}{guide?.targetMinutes ? ` · ${guide.targetMinutes} мин` : ""}</div>
                  <SectionBvfContext guide={guide} bvfBlock={phase.block} />
                  {sections.map((s) => {
                    const items = plan[s.key] || [];
                    return (
                      <div key={s.key} style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontWeight: 800 }}>{s.label}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{items.length} упражнения</div>
                        </div>
                        {items.length === 0 ? (
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Няма упражнения.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            {items.map((item, idx) => {
                              const drillId = item.drillId;
                              const d = drillById.get(Number(drillId));
                        const media = d ? getDrillPrimaryMedia(d) : null;
                        return (
                          <div
                            key={`${s.key}-${drillId}-${idx}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                              border: "1px solid #eee",
                              borderRadius: 12,
                              padding: 10,
                              background: "#fff",
                            }}
                          >
                            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                              <button
                                type="button"
                                onClick={() => d && setModalDrill(d)}
                                title="Бърз преглед"
                                style={{
                                  width: 90,
                                  height: 58,
                                  border: "1px solid #e1e5ec",
                                  borderRadius: 10,
                                  background: "#f8fbff",
                                  overflow: "hidden",
                                  padding: 0,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flex: "0 0 auto",
                                }}
                              >
                                {media?.type === "image" ? (
                                  <img src={media.src} alt={d?.title || `#${drillId}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : media?.type === "video" ? (
                                  <span style={{ fontSize: 12, opacity: 0.75 }}>🎥 Видео</span>
                                ) : (
                                  <span style={{ fontSize: 12, opacity: 0.75 }}>Преглед</span>
                                )}
                              </button>

                              <div>
                              <div style={{ fontWeight: 900 }}>
                                {idx + 1}. {d?.title || `#${drillId}`}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.7 }}>
                                {s.key}
                              </div>
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <label style={{ fontSize: 12 }}>
                                мин
                                <input
                                  type="number"
                                  min={3}
                                  max={60}
                                  value={item.minutes || 10}
                                  onChange={(e) => setItemMinutes(s.key, drillId, e.target.value)}
                                  style={{ width: 52, marginLeft: 4, padding: 4, borderRadius: 6, border: "1px solid #ddd" }}
                                />
                              </label>
                              <button type="button" onClick={() => d && setModalDrill(d)}>Преглед</button>
                              <button type="button" onClick={() => move(s.key, idx, -1)}>↑</button>
                              <button type="button" onClick={() => move(s.key, idx, +1)}>↓</button>
                              <button
                                type="button"
                                onClick={() => removeFromSection(drillId, s.key)}
                                style={{ color: "crimson" }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Drill chooser */}
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Списък с упражнения (за добавяне/замяна)</div>

          <div style={{ display: "grid", gap: 10 }}>
            <label>
              <div style={{ fontWeight: 900, fontSize: 12 }}>Добавяй в секция</div>
              <select
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ fontWeight: 900, fontSize: 12 }}>Търсачка</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="serve, receive, блок…"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Показани: <b>{filtered.length}</b> от <b>{drills.length}</b>
              </div>
            </label>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10, maxHeight: "70vh", overflow: "auto", paddingRight: 6 }}>
            {filtered.map((d) => {
              const media = getDrillPrimaryMedia(d);
              return (
                <div
                  key={d.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fafafa",
                    display: "grid",
                    gridTemplateColumns: "90px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setModalDrill(d)}
                    title="Бърз преглед"
                    style={{
                      width: 90,
                      height: 58,
                      border: "1px solid #e1e5ec",
                      borderRadius: 10,
                      background: "#fff",
                      overflow: "hidden",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {media?.type === "image" ? (
                      <img src={media.src} alt={d.title || d.name || "Упражнение"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : media?.type === "video" ? (
                      <span style={{ fontSize: 12, opacity: 0.75 }}>🎥 Видео</span>
                    ) : (
                      <span style={{ fontSize: 12, opacity: 0.75 }}>Преглед</span>
                    )}
                  </button>

                  <div style={{ minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setModalDrill(d)}
                      style={{
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      {d.title || d.name || `#${d.id}`}
                    </button>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {[d.category, d.level].filter(Boolean).join(" • ") || "—"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setModalDrill(d)}>Преглед</button>
                    <button type="button" onClick={() => addToSection(d.id, activeSection)}>
                      Добави
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modalDrill && <DrillMediaPreviewModal drill={modalDrill} onClose={() => setModalDrill(null)} />}
    </div>
  );
}
