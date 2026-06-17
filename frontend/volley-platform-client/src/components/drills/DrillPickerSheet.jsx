import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../utils/apiClient";
import { getDrillPrimaryMedia } from "../DrillMediaPreviewModal";
import DrillMediaPreviewModal from "../DrillMediaPreviewModal";

const SECTION_HINTS = {
  warmup: ["загряв", "активир", "warm"],
  technique: ["техник", "technique", "индивид"],
  serve_receive: ["сервис", "посрещ", "serve", "receive", "pass"],
  attack_block: ["атак", "блок", "attack", "block", "spike"],
  game: ["игра", "game", "6:6", "situation"],
  conditioning: ["физическ", "condition", "силов", "скорост"],
  cooldown: ["разпуск", "cool", "stretch", "разтяг"],
};

function uniqSorted(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "bg")
  );
}

function drillHaystack(d) {
  return `${d?.title || d?.name || ""} ${d?.description || ""} ${d?.category || ""} ${d?.level || ""}`.toLowerCase();
}

function scoreDrillForSection(drill, { sectionKey, currentDrill }) {
  let score = 0;
  const cat = String(drill?.category || "").toLowerCase();
  const curCat = String(currentDrill?.category || "").toLowerCase();
  if (curCat && cat === curCat) score += 4;
  if (currentDrill?.level && drill?.level === currentDrill.level) score += 2;
  const hints = SECTION_HINTS[sectionKey] || [];
  const hay = drillHaystack(drill);
  if (hints.some((h) => hay.includes(h))) score += 3;
  if (Number(drill?.id) === Number(currentDrill?.id)) score -= 10;
  return score;
}

export default function DrillPickerSheet({
  open,
  onClose,
  onSelect,
  loading = false,
  title = "Избери упражнение",
  sectionKey = "",
  currentDrill = null,
}) {
  const [drills, setDrills] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [previewDrill, setPreviewDrill] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setQ("");
    setCategory("");
    setLevel("");
    setPreviewDrill(null);
    let cancelled = false;
    (async () => {
      if (drills.length) return;
      setFetching(true);
      setFetchError("");
      try {
        const list = await apiJson("/drills/");
        if (!cancelled) setDrills(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setDrills([]);
          setFetchError(e?.message || "Грешка при зареждане на упражнения.");
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, drills.length]);

  const categories = useMemo(() => uniqSorted(drills.map((d) => d.category)), [drills]);
  const levels = useMemo(() => uniqSorted(drills.map((d) => d.level)), [drills]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return drills.filter((d) => {
      if (category && String(d.category || "") !== category) return false;
      if (level && String(d.level || "") !== level) return false;
      if (qq && !drillHaystack(d).includes(qq)) return false;
      return true;
    });
  }, [drills, q, category, level]);

  const recommended = useMemo(() => {
    if (!sectionKey && !currentDrill) return [];
    return [...filtered]
      .map((d) => ({ d, score: scoreDrillForSection(d, { sectionKey, currentDrill }) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || String(a.d.title || "").localeCompare(String(b.d.title || ""), "bg"))
      .slice(0, 8)
      .map((x) => x.d);
  }, [filtered, sectionKey, currentDrill]);

  const browseList = useMemo(() => {
    const recIds = new Set(recommended.map((d) => d.id));
    return filtered
      .filter((d) => !recIds.has(d.id))
      .sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""), "bg"))
      .slice(0, 60);
  }, [filtered, recommended]);

  if (!open) return null;

  return (
    <>
      <div className="drillPickerOverlay" onClick={() => !loading && onClose?.()}>
        <div className="drillPickerCard" onClick={(e) => e.stopPropagation()}>
          <div className="drillPickerHead">
            <div>
              <strong>{title}</strong>
              {sectionKey ? (
                <div className="drillPickerSub">Филтрирай по категория и ниво — не е нужно да помниш името.</div>
              ) : null}
            </div>
            <button type="button" className="drillPickerClose" onClick={onClose} disabled={loading}>
              Затвори
            </button>
          </div>

          <div className="drillPickerFilters">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Търсене (по желание)…"
              className="drillPickerInput"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="drillPickerInput">
              <option value="">Всички категории</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="drillPickerInput">
              <option value="">Всички нива</option>
              {levels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="drillPickerMeta">
            {fetching ? "Зареждане…" : `Показани: ${filtered.length} от ${drills.length}`}
            {fetchError ? ` · ${fetchError}` : ""}
          </div>

          <div className="drillPickerBody">
            {recommended.length ? (
              <section className="drillPickerSection">
                <div className="drillPickerSectionTitle">Препоръчани за секцията</div>
                <div className="drillPickerGrid">
                  {recommended.map((d) => (
                    <DrillPickerRow
                      key={`rec-${d.id}`}
                      drill={d}
                      loading={loading}
                      onPreview={() => setPreviewDrill(d)}
                      onSelect={() => onSelect?.(d.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="drillPickerSection">
              <div className="drillPickerSectionTitle">
                {recommended.length ? "Всички упражнения" : "Разгледай базата"}
              </div>
              {!fetching && browseList.length === 0 ? (
                <div className="drillPickerEmpty">Няма резултати — промени филтрите.</div>
              ) : (
                <div className="drillPickerGrid">
                  {browseList.map((d) => (
                    <DrillPickerRow
                      key={d.id}
                      drill={d}
                      loading={loading}
                      onPreview={() => setPreviewDrill(d)}
                      onSelect={() => onSelect?.(d.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {previewDrill ? (
        <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} />
      ) : null}

      <style>{`
        .drillPickerOverlay{position:fixed;inset:0;z-index:1400;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:14px;}
        .drillPickerCard{width:min(720px,96vw);max-height:86vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;border:1px solid #d8e1ec;overflow:hidden;}
        .drillPickerHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0;}
        .drillPickerSub{font-size:12px;color:#64748b;margin-top:4px;}
        .drillPickerClose{border:1px solid #d1dbe8;background:#fff;border-radius:9px;padding:6px 10px;font-weight:800;cursor:pointer;}
        .drillPickerFilters{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:10px 14px;border-bottom:1px solid #eef2f7;}
        .drillPickerInput{width:100%;padding:9px 10px;border-radius:10px;border:1px solid #d8e1ec;font-size:14px;}
        .drillPickerMeta{padding:0 14px 8px;font-size:12px;color:#64748b;}
        .drillPickerBody{overflow:auto;padding:0 14px 14px;}
        .drillPickerSection{margin-top:8px;}
        .drillPickerSectionTitle{font-weight:800;font-size:13px;margin-bottom:8px;color:#334155;}
        .drillPickerGrid{display:grid;gap:8px;}
        .drillPickerRow{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fafafa;}
        .drillPickerThumb{width:72px;height:48px;border:1px solid #e1e5ec;border-radius:8px;overflow:hidden;background:#f8fbff;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .drillPickerThumb img{width:100%;height:100%;object-fit:cover;}
        .drillPickerTitle{font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .drillPickerMetaLine{font-size:12px;color:#64748b;}
        .drillPickerActions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
        .drillPickerBtn{border:1px solid #d1dbe8;background:#fff;border-radius:9px;padding:6px 8px;font-weight:700;font-size:12px;cursor:pointer;}
        .drillPickerBtn--primary{background:#0f766e;color:#fff;border-color:#0f766e;}
        .drillPickerBtn:disabled{opacity:.55;cursor:not-allowed;}
        .drillPickerEmpty{font-size:13px;color:#64748b;padding:12px 0;}
        @media (max-width:640px){
          .drillPickerFilters{grid-template-columns:1fr;}
          .drillPickerRow{grid-template-columns:56px 1fr;grid-template-rows:auto auto;}
          .drillPickerActions{grid-column:1/-1;justify-content:flex-start;}
        }
      `}</style>
    </>
  );
}

function DrillPickerRow({ drill, loading, onPreview, onSelect }) {
  const media = getDrillPrimaryMedia(drill);
  const title = drill?.title || drill?.name || `Упражнение #${drill?.id}`;
  const meta = [drill?.category, drill?.level].filter(Boolean).join(" · ") || "—";

  return (
    <div className="drillPickerRow">
      <button type="button" className="drillPickerThumb" onClick={onPreview} title="Преглед">
        {media?.type === "image" ? (
          <img src={media.src} alt="" />
        ) : media?.type === "video" ? (
          <span style={{ fontSize: 11, opacity: 0.75 }}>🎥</span>
        ) : (
          <span style={{ fontSize: 11, opacity: 0.75 }}>—</span>
        )}
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="drillPickerTitle">{title}</div>
        <div className="drillPickerMetaLine">{meta}</div>
      </div>
      <div className="drillPickerActions">
        <button type="button" className="drillPickerBtn" onClick={onPreview} disabled={loading}>
          Преглед
        </button>
        <button type="button" className="drillPickerBtn drillPickerBtn--primary" onClick={onSelect} disabled={loading}>
          Избери
        </button>
      </div>
    </div>
  );
}
