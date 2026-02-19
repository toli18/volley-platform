// src/pages/Generator.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { isAuthenticated, isCoach } from "../utils/auth";
import DrillMediaPreviewModal, { getDrillPrimaryMedia } from "../components/DrillMediaPreviewModal";

// ---------- helpers ----------
function normalizeFastApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка.";

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Възникна грешка.";
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Всички</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function parseList(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (!raw) return [];
  return String(raw)
    .replace(/\|/g, ",")
    .replace(/;/g, ",")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

// ---------- main ----------
export default function Generator() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isCoach()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

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

  const [plan, setPlan] = useState(() => {
    const base = {};
    for (const s of SECTIONS) base[s.key] = [];
    return base;
  });

  const [activeSection, setActiveSection] = useState("warmup");

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState([]);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [equipment, setEquipment] = useState("");
  const [intensity, setIntensity] = useState("");
  const [skillsFilter, setSkillsFilter] = useState([]);
  const [playersFilter, setPlayersFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [gameFormFilter, setGameFormFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [savedTrainingId, setSavedTrainingId] = useState(null);

  const [modalDrill, setModalDrill] = useState(null);

  // load drills
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        let data;
        try {
          data = await apiClient(API_PATHS.DRILLS_LIST);
        } catch {
          data = await apiClient(API_PATHS.DRILLS_LIST_ALIAS);
        }

        if (!alive) return;
        setDrills(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setError(normalizeFastApiError(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort();
    const skillCounts = {};
    drills.forEach((d) => {
      const set = new Set([
        ...parseList(d.skill_domains),
        ...parseList(d.skill_focus),
        ...parseList(d.technical_focus),
      ]);
      set.forEach((s) => {
        if (!s) return;
        skillCounts[s] = (skillCounts[s] || 0) + 1;
      });
    });
    return {
      category: uniq(drills.map((d) => (d.category || "").toString().trim()).filter(Boolean)),
      level: uniq(drills.map((d) => (d.level || "").toString().trim()).filter(Boolean)),
      equipment: uniq(drills.map((d) => (d.equipment || "").toString().trim()).filter(Boolean)),
      intensity: uniq(
        drills
          .map((d) => ((d.intensity || d.intensity_type) || "").toString().trim())
          .filter(Boolean)
      ),
      phases: uniq(drills.flatMap((d) => parseList(d.game_phases))),
      gameForms: uniq(drills.map((d) => (d.type_of_drill || d.category || "").toString().trim()).filter(Boolean)),
      skills: Object.entries(skillCounts)
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "bg"))
        .map(([name, count]) => ({ name, count })),
    };
  }, [drills]);

  const filtered = useMemo(() => {
    let list = drills;

    const qv = q.trim().toLowerCase();
    if (qv) {
      list = list.filter((d) => {
        const t = (d.title || d.name || "").toLowerCase();
        const desc = (d.description || "").toLowerCase();
        return t.includes(qv) || desc.includes(qv);
      });
    }

    if (category) list = list.filter((d) => (d.category || "").toString().trim() === category);
    if (level) list = list.filter((d) => (d.level || "").toString().trim() === level);
    if (equipment) list = list.filter((d) => (d.equipment || "").toString().trim() === equipment);
    if (intensity)
      list = list.filter(
        (d) => ((d.intensity || d.intensity_type) || "").toString().trim() === intensity
      );

    if (phaseFilter !== "all") {
      list = list.filter((d) => parseList(d.game_phases).includes(phaseFilter));
    }
    if (gameFormFilter !== "all") {
      list = list.filter((d) => ((d.type_of_drill || d.category || "").toString().trim()) === gameFormFilter);
    }
    if (playersFilter !== "all") {
      list = list.filter((d) => {
        const nums = String(d.players || "").match(/\d+/g);
        if (!nums || !nums.length) return false;
        const max = Math.max(...nums.map((x) => Number(x)).filter(Number.isFinite));
        if (!Number.isFinite(max)) return false;
        if (playersFilter === "<=8") return max <= 8;
        if (playersFilter === "9-12") return max >= 9 && max <= 12;
        if (playersFilter === "13+") return max >= 13;
        return true;
      });
    }
    if (skillsFilter.length) {
      list = list.filter((d) => {
        const skillSet = new Set([
          ...parseList(d.skill_domains),
          ...parseList(d.skill_focus),
          ...parseList(d.technical_focus),
        ]);
        return skillsFilter.some((s) => skillSet.has(s));
      });
    }

    if (sortBy === "name_asc") {
      list = [...list].sort((a, b) =>
        (a.title || a.name || "").localeCompare(b.title || b.name || "", "bg")
      );
    } else if (sortBy === "name_desc") {
      list = [...list].sort((a, b) =>
        (b.title || b.name || "").localeCompare(a.title || a.name || "", "bg")
      );
    } else if (sortBy === "level") {
      list = [...list].sort((a, b) => (a.level || "").localeCompare(b.level || "", "bg"));
    }

    return list;
  }, [drills, q, category, level, equipment, intensity, phaseFilter, gameFormFilter, playersFilter, skillsFilter, sortBy]);

  const planIds = useMemo(() => {
    const s = new Set();
    for (const key of Object.keys(plan)) {
      for (const id of plan[key]) s.add(Number(id));
    }
    return s;
  }, [plan]);

  const drillById = useMemo(() => {
    const map = new Map();
    drills.forEach((d) => map.set(Number(d.id), d));
    return map;
  }, [drills]);

  function addToSection(drillId, sectionKey = activeSection) {
    setPlan((prev) => {
      const next = { ...prev };
      const id = Number(drillId);
      const arr = next[sectionKey] ? [...next[sectionKey]] : [];
      if (!arr.includes(id)) arr.push(id);
      next[sectionKey] = arr;
      return next;
    });
  }

  function removeFromSection(drillId, sectionKey) {
    setPlan((prev) => {
      const next = { ...prev };
      next[sectionKey] = (next[sectionKey] || []).filter((x) => x !== Number(drillId));
      return next;
    });
  }

  function clearPlan() {
    const base = {};
    for (const s of SECTIONS) base[s.key] = [];
    setPlan(base);
  }

  function resetFilters() {
    setQ("");
    setCategory("");
    setLevel("");
    setEquipment("");
    setIntensity("");
    setSkillsFilter([]);
    setPlayersFilter("all");
    setPhaseFilter("all");
    setGameFormFilter("all");
    setSortBy("name_asc");
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const t = title.trim();
    if (!t) {
      setError("Заглавието е задължително.");
      return;
    }

    try {
      setSubmitting(true);
      setSavedTrainingId(null);

      // ✅ IMPORTANT: backend expects ONLY these fields (по swagger)
      // source MUST be exactly: "ръчна" or "генерирана"
      const payload = {
        title: t,
        source: "генерирана",
        status: "чернова",
        plan,
        notes: null,
      };

      const created = await apiClient(API_PATHS.TRAININGS_CREATE, {
        method: "POST",
        data: payload,
      });

      setSuccess("Тренировката е записана ✅");
      if (created?.id) setSavedTrainingId(created.id);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap">
      <style>{`
        .wrap{padding:14px; max-width:1200px; margin:0 auto;}
        .top{display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; border:1px solid #e8edf4; background:linear-gradient(180deg,#ffffff,#fbfdff); padding:12px; border-radius:16px; box-shadow:0 8px 26px rgba(10,35,66,.06);}
        .field{min-width:170px; flex:1;}
        .label{display:block; font-size:12px; font-weight:900; color:#334155; margin-bottom:6px;}
        .input{width:100%; padding:10px 12px; border-radius:12px; border:1px solid #dbe3ee; font-size:14px; outline:none;}
        .input:focus,.select:focus{border-color:#9ec5ff; box-shadow:0 0 0 3px rgba(11,92,255,.14);}
        .select{width:100%; padding:10px 12px; border-radius:12px; border:1px solid #dbe3ee; background:#fff;}
        .btnRow{display:flex; gap:10px; align-items:center;}
        .btn{padding:10px 12px; border-radius:12px; border:1px solid #dbe3ee; background:#fff; font-weight:900; cursor:pointer;}
        .btnPrimary{padding:10px 14px; border-radius:12px; border:none; background:linear-gradient(135deg,#0b5cff,#0848c6); color:#fff; font-weight:900; cursor:pointer;}
        .btnPrimary:disabled{background:#9ad3aa; cursor:not-allowed;}
        .btnSuccess{padding:10px 14px; border-radius:12px; border:none; background:linear-gradient(135deg,#1e9b4f,#157c3e); color:#fff; font-weight:900; cursor:pointer;}
        .grid{display:grid; grid-template-columns: 1.05fr .95fr; gap:12px; margin-top:12px;}
        @media(max-width: 980px){ .grid{grid-template-columns:1fr;} }
        .panel{border:1px solid #e8edf4; border-radius:16px; padding:12px; background:#fff; box-shadow:0 6px 18px rgba(10,35,66,.05);}
        .panelTitle{margin:0; font-size:18px;}
        .muted{color:#666; font-size:12px;}
        .error{background:#ffe5e5; border:1px solid #ffb3b3; padding:12px; border-radius:12px; color:#a00; font-weight:900; margin-top:12px;}
        .ok{background:#ddffdd; border:1px solid #a9e7b0; padding:12px; border-radius:12px; color:#0a6b1f; font-weight:900; margin-top:12px;}
        .list{display:grid; gap:10px; margin-top:10px; max-height:72vh; overflow:auto; padding-right:6px;}
        .cardRow{display:grid; grid-template-columns:110px 1fr; gap:10px; border:1px solid #e8edf4; border-radius:14px; padding:10px; background:#fff;}
        @media(max-width:540px){ .cardRow{grid-template-columns:1fr;} .thumbBtn{width:100%; height:180px;} }
        .thumbBtn{width:110px; height:76px; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; background:#f8fbff; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center;}
        .thumbImg{width:100%; height:100%; object-fit:cover;}
        .pill{padding:7px 10px; border-radius:12px; border:none; font-weight:900; cursor:pointer; color:#fff; background:#0066cc;}
        .pillOff{background:#6c757d;}
        .planBox{border:1px solid #e8edf4; border-radius:14px; padding:10px;}
        .planItem{display:flex; justify-content:space-between; gap:10px; align-items:center; padding:10px; border:1px solid #ecf1f7; background:#f8fbff; border-radius:14px;}
        .miniBtn{padding:7px 9px; border-radius:12px; border:1px solid #dbe3ee; background:#fff; font-weight:900; cursor:pointer;}
        .miniDanger{background:#dc3545; border:none; color:#fff;}
        .planActions{display:flex; gap:8px; align-items:center;}
      `}</style>

      <h1 style={{ margin: "8px 0 12px" }}>Генератор / Създаване на тренировка</h1>

      <div className="top">
        <div className="field" style={{ flex: "2 1 360px" }}>
          <label className="label">Заглавие: *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Напр. Тренировка – Сервис и посрещане"
          />
        </div>

        <div className="field">
          <label className="label">Добавяй в секция:</label>
          <select
            className="select"
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="btnRow">
          <button className="btn" onClick={clearPlan} disabled={submitting}>
            Изчисти план
          </button>
          <button className="btnPrimary" onClick={handleSave} disabled={submitting}>
            {submitting ? "Запис…" : "Запази тренировка"}
          </button>
        </div>
      </div>

      {error && <div className="error">Грешка: {error}</div>}
      {success && <div className="ok">{success}</div>}
      {savedTrainingId && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btnSuccess" onClick={() => navigate(`/trainings/${savedTrainingId}`)}>
            Отвори записаната тренировка
          </button>
          <button className="btn" onClick={() => navigate("/my-trainings")}>
            Към моите тренировки
          </button>
        </div>
      )}
      {loading && <div style={{ marginTop: 12 }}>Зареждане на упражнения…</div>}

      {!loading && !error && (
        <div className="grid">
          {/* LEFT: Plan */}
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h2 className="panelTitle">Тренировъчен план</h2>
              <div className="muted">
                Общо: <b>{planIds.size}</b> упражнения
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {SECTIONS.map((s) => {
                const ids = plan[s.key] || [];
                return (
                  <div key={s.key} className="planBox">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>{s.label}</div>
                      <div className="muted">{ids.length} упражнения</div>
                    </div>

                    {ids.length === 0 ? (
                      <div className="muted" style={{ marginTop: 8 }}>
                        Няма упражнения.
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {ids.map((id) => {
                          const d = drillById.get(Number(id));
                          const t = d?.title || d?.name || `#${id}`;
                          return (
                            <div key={`${s.key}-${id}`} className="planItem">
                              <button
                                onClick={() => setModalDrill(d)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  fontWeight: 900,
                                  padding: 0,
                                }}
                                title="Преглед"
                              >
                                {t}
                                <div className="muted" style={{ fontWeight: 600 }}>
                                  {[d?.category, d?.level].filter(Boolean).join(" • ") || "—"}
                                </div>
                              </button>

                              <div className="planActions">
                                <button className="miniBtn" onClick={() => setModalDrill(d)} title="Бърз преглед">
                                  Преглед
                                </button>
                                <button
                                  onClick={() => removeFromSection(id, s.key)}
                                  className="miniBtn miniDanger"
                                  title="Премахни"
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
          </div>

          {/* RIGHT: Drill list */}
          <div className="panel">
            <h2 className="panelTitle">Ръчен подбор чрез филтри</h2>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div className="field" style={{ minWidth: 0 }}>
                <label className="label">Търсене по име</label>
                <input
                  className="input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Въведи ключови думи..."
                />
                <div className="muted" style={{ marginTop: 6 }}>
                  Показани: <b>{filtered.length}</b> от <b>{drills.length}</b>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <SelectFilter label="Категория" value={category} onChange={setCategory} options={options.category} />
                <SelectFilter label="Ниво" value={level} onChange={setLevel} options={options.level} />
                <SelectFilter label="Оборудване" value={equipment} onChange={setEquipment} options={options.equipment} />
                <SelectFilter label="Интензитет" value={intensity} onChange={setIntensity} options={options.intensity} />
                <SelectFilter label="Фаза на тренировка" value={phaseFilter} onChange={setPhaseFilter} options={options.phases} />
                <SelectFilter label="Игрова форма" value={gameFormFilter} onChange={setGameFormFilter} options={options.gameForms} />
                <div className="field">
                  <label className="label">Брой играчи</label>
                  <select className="select" value={playersFilter} onChange={(e) => setPlayersFilter(e.target.value)}>
                    <option value="all">Всички</option>
                    <option value="<=8">&lt;=8</option>
                    <option value="9-12">9-12</option>
                    <option value="13+">13+</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Сортиране</label>
                  <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="name_asc">Име А-Я</option>
                    <option value="name_desc">Име Я-А</option>
                    <option value="level">Ниво</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gap: 6, border: "1px solid #e8edf4", borderRadius: 12, padding: 8, maxHeight: 140, overflow: "auto" }}>
                <div className="label" style={{ margin: 0 }}>Умения</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 4 }}>
                  {options.skills.map((s) => (
                    <label key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={skillsFilter.includes(s.name)}
                        onChange={() => setSkillsFilter((p) => toggleInArray(p, s.name))}
                      />
                      <span>{s.name} ({s.count})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={resetFilters}>Изчисти филтри</button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>
                Няма упражнения по тези филтри.
              </div>
            ) : (
              <div className="list" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {filtered.map((d) => {
                  const t = d.title || d.name || "Упражнение";
                  const desc = d.description || "";
                  const thumb = getDrillPrimaryMedia(d);
                  const already = planIds.has(Number(d.id));

                  return (
                    <div key={d.id} style={{ border: "1px solid #e8edf4", borderRadius: 14, overflow: "hidden", background: already ? "#f3fbf6" : "#fff" }}>
                      <button style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", background: "#0b1c34" }} onClick={() => setModalDrill(d)}>
                        {thumb?.type === "image" ? (
                          <img className="thumbImg" src={thumb.src} alt={t} style={{ height: 160 }} />
                        ) : (
                          <div style={{ height: 160, display: "grid", placeItems: "center", color: "#fff" }}>Преглед</div>
                        )}
                      </button>
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309" }}>
                          {[d.level, d.category].filter(Boolean).join(", ") || "—"}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 20, lineHeight: 1.15 }}>{t}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {desc ? (desc.length > 90 ? desc.slice(0, 90) + "…" : desc) : "Няма описание."}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button className="miniBtn" onClick={() => setModalDrill(d)}>Преглед</button>
                          <button className={`pill ${already ? "pillOff" : ""}`} onClick={() => addToSection(d.id, activeSection)}>
                            {already ? "В плана" : "Добави"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {modalDrill && <DrillMediaPreviewModal drill={modalDrill} onClose={() => setModalDrill(null)} />}
    </div>
  );
}
