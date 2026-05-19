// src/pages/DrillDetails.jsx
import DrillVideoPlayer from "../components/drills/DrillVideoPlayer";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { Button, Card, EmptyState, PageHero } from "../components/ui";

/** ---------- Р“СЂРµС€РєРё РѕС‚ FastAPI ---------- */
const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Р’СЉР·РЅРёРєРЅР° РіСЂРµС€РєР° РїСЂРё Р·Р°СЏРІРєР°С‚Р°.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "РќРµРІР°Р»РёРґРЅРё РґР°РЅРЅРё (422).";
  return "Р’СЉР·РЅРёРєРЅР° РіСЂРµС€РєР° РїСЂРё Р·Р°СЏРІРєР°С‚Р°.";
};

/** ---------- Р¤РѕСЂРјР°С‚РёСЂР°РЅРµ ---------- */
const fmtDateTime = (value) => {
  if (!value) return "вЂ”";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("bg-BG");
};

const mapStatusBg = (status) => {
  const s = String(status || "").toLowerCase();
  const map = {
    draft: "С‡РµСЂРЅРѕРІР°",
    pending: "С‡Р°РєР° РѕРґРѕР±СЂРµРЅРёРµ",
    approved: "РѕРґРѕР±СЂРµРЅРѕ",
    rejected: "РѕС‚С…РІСЉСЂР»РµРЅРѕ",
  };
  return map[s] || (status ? String(status) : "вЂ”");
};

/** РџРѕ Р¶РµР»Р°РЅРёРµ: РїСЂРµРІРѕРґ РЅР° С‚РёРїРёС‡РЅРё С‚Р°РіРѕРІРµ, Р°РєРѕ РІ Р±Р°Р·Р°С‚Р° СЃР° РЅР° Р°РЅРіР»РёР№СЃРєРё */
const tagBg = (t) => {
  const x = String(t || "").trim();
  if (!x) return "";
  const k = x.toLowerCase();

  const dict = {
    // Р¤Р°Р·Рё
    serve: "СЃРµСЂРІРёСЃ",
    service: "СЃРµСЂРІРёСЃ",
    receive: "РїРѕСЃСЂРµС‰Р°РЅРµ",
    reception: "РїРѕСЃСЂРµС‰Р°РЅРµ",
    setting: "СЂР°Р·РїСЂРµРґРµР»СЏРЅРµ",
    set: "СЂР°Р·РїСЂРµРґРµР»СЏРЅРµ",
    attack: "Р°С‚Р°РєР°",
    block: "Р±Р»РѕРєР°РґР°",
    defense: "Р·Р°С‰РёС‚Р°",
    transition: "РїСЂРµС…РѕРґ",

    // РўРµС…РЅРёС‡РµСЃРєРё
    pass: "РїР°СЃ",
    spike: "РЅР°РїР°РґРµРЅРёРµ",
    hit: "РЅР°РїР°РґРµРЅРёРµ",
    dig: "Р·Р°С‰РёС‚Р° (РґРёРі)",

    // Р”РѕРјРµР№РЅРё
    technique: "С‚РµС…РЅРёРєР°",
    tactics: "С‚Р°РєС‚РёРєР°",
    communication: "РєРѕРјСѓРЅРёРєР°С†РёСЏ",
    psychology: "РїСЃРёС…РѕР»РѕРіРёСЏ",
    physical: "С„РёР·РёС‡РµСЃРєР° РїРѕРґРіРѕС‚РѕРІРєР°",
    coordination: "РєРѕРѕСЂРґРёРЅР°С†РёСЏ",
  };

  return dict[k] || x;
};

function InfoRow({ label, value }) {
  const v = value === 0 ? "0" : value;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 36%) 1fr", gap: 12, padding: "7px 0", borderBottom: "1px solid #eef3fa" }}>
      <div style={{ color: "#5b6f8d", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: v ? "#0f172a" : "#777" }}>{v || "вЂ”"}</div>
    </div>
  );
}

function Chips({ label, items }) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  const shown = arr.map(tagBg).filter(Boolean);

  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ color: "#444", marginBottom: 6 }}>{label}</div>
      {shown.length === 0 ? (
        <div style={{ color: "#777", fontWeight: 700 }}>вЂ”</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shown.map((x, idx) => (
            <span key={`${x}-${idx}`} className="uiBadge">{x}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TextBlock({ title, text }) {
  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: text ? "#111" : "#777" }}>
        {text || "вЂ”"}
      </div>
    </div>
  );
}


/** ---------- РЎРЅРёРјРєР° + СѓРІРµР»РёС‡РµРЅРёРµ ---------- */
function ImagePreview({ url, alt }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);

  const safeUrl = String(url || "").trim();
  if (!safeUrl) return null;

  const openModal = () => {
    setOpen(true);
    setScale(1);
    setFit(true);
    setPos({ x: 0, y: 0 });
    setDrag(null);
  };

  const closeModal = () => setOpen(false);

  const zoomIn = () => {
    setFit(false);
    setScale((s) => Math.min(6, Math.round((s + 0.25) * 100) / 100));
  };

  const zoomOut = () => {
    setFit(false);
    setScale((s) => Math.max(1, Math.round((s - 0.25) * 100) / 100));
  };

  const reset = () => {
    setScale(1);
    setFit(true);
    setPos({ x: 0, y: 0 });
  };

  const onMouseDown = (e) => {
    if (fit) return;
    e.preventDefault();
    setDrag({ startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y });
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPos({ x: drag.baseX + dx, y: drag.baseY + dy });
  };

  const onMouseUp = () => setDrag(null);

  return (
    <>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden", background: "#f7f7f7" }}>
        <div style={{ width: "100%", maxHeight: 520, display: "grid", placeItems: "center" }}>
          <img
            src={safeUrl}
            alt={alt || "РЎРЅРёРјРєР°"}
            style={{
              width: "100%",
              height: "auto",
              maxHeight: 520,
              objectFit: "contain",
              display: "block",
              cursor: "zoom-in",
            }}
            onClick={openModal}
            loading="lazy"
          />
        </div>

        <div style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <Button type="button" onClick={openModal} variant="secondary" size="sm">
            рџ”Ќ РЈРІРµР»РёС‡Рё
          </Button>

          <a href={safeUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
            РћС‚РІРѕСЂРё СЃРЅРёРјРєР°С‚Р° РІ РЅРѕРІ РїСЂРѕР·РѕСЂРµС†
          </a>
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1200px, 96vw)",
              height: "min(760px, 90vh)",
              background: "#111",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.15)",
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                background: "rgba(0,0,0,0.55)",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <Button type="button" onClick={zoomOut} variant="secondary" size="sm">
                в€’
              </Button>

              <Button type="button" onClick={zoomIn} variant="secondary" size="sm">
                +
              </Button>

              <Button type="button" onClick={reset} variant="secondary" size="sm">
                РџРѕР±РёСЂР°РЅРµ
              </Button>

              <div style={{ color: "#fff", fontWeight: 800, marginLeft: 6, opacity: 0.9 }}>
                РњР°С‰Р°Р±: {fit ? "РїРѕР±РёСЂР°РЅРµ" : `${Math.round(scale * 100)}%`}
              </div>

              <div style={{ flex: 1 }} />

              <Button type="button" onClick={closeModal} variant="secondary" size="sm">
                вњ• Р—Р°С‚РІРѕСЂРё
              </Button>
            </div>

            <div
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{
                position: "relative",
                overflow: "hidden",
                cursor: fit ? "default" : drag ? "grabbing" : "grab",
                userSelect: "none",
              }}
            >
              <img
                src={safeUrl}
                alt={alt || "РЎРЅРёРјРєР°"}
                draggable={false}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: fit
                    ? "translate(-50%, -50%)"
                    : `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                  transformOrigin: "center center",
                  maxWidth: fit ? "100%" : "none",
                  maxHeight: fit ? "100%" : "none",
                  width: fit ? "100%" : "auto",
                  height: fit ? "100%" : "auto",
                  objectFit: "contain",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** ---------- Р“Р»Р°РІРµРЅ РєРѕРјРїРѕРЅРµРЅС‚ ---------- */
export default function DrillDetails() {
  const { id } = useParams();
  const drillId = useMemo(() => Number(id), [id]);

  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!Number.isFinite(drillId)) {
      setError("РќРµРІР°Р»РёРґРµРЅ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РЅР° СѓРїСЂР°Р¶РЅРµРЅРёРµ.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(`/drills/${drillId}`);
      setDrill(res.data);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillId]);

  if (loading) return <div className="uiPage">Р—Р°СЂРµР¶РґР°РЅРµвЂ¦</div>;

  if (error) {
    return (
      <div className="uiPage">
        <Button as={Link} to="/drills" variant="secondary" size="sm">
          в†ђ РќР°Р·Р°Рґ РєСЉРј СѓРїСЂР°Р¶РЅРµРЅРёСЏС‚Р°
        </Button>
        <div className="uiAlert uiAlert--danger">
          <strong>Р“СЂРµС€РєР°:</strong> {error}
        </div>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="uiPage">
        <Button as={Link} to="/drills" variant="secondary" size="sm">
          в†ђ РќР°Р·Р°Рґ РєСЉРј СѓРїСЂР°Р¶РЅРµРЅРёСЏС‚Р°
        </Button>
        <EmptyState title="РќСЏРјР° РґР°РЅРЅРё Р·Р° С‚РѕРІР° СѓРїСЂР°Р¶РЅРµРЅРёРµ" description="РџСЂРѕРІРµСЂРё РґР°Р»Рё СѓРїСЂР°Р¶РЅРµРЅРёРµС‚Рѕ СЃСЉС‰РµСЃС‚РІСѓРІР°." />
      </div>
    );
  }

  // Р›РѕРіРёРєР°: Р’РР”Р•Рћ > РЎРќРРњРљРђ > РќРР©Рћ
  const videoUrl = Array.isArray(drill.video_urls) ? (drill.video_urls.find(Boolean) || "") : "";
  const imageUrl = Array.isArray(drill.image_urls) ? (drill.image_urls.find(Boolean) || "") : "";

  const hasVideo = Boolean(String(videoUrl || "").trim());
  const hasImage = Boolean(String(imageUrl || "").trim());

  return (
    <div className="uiPage" style={{ maxWidth: 1040 }}>
      <PageHero
        title={drill?.title || "Р”РµС‚Р°Р№Р»Рё Р·Р° СѓРїСЂР°Р¶РЅРµРЅРёРµ"}
        subtitle="РџРѕРґСЂРѕР±РµРЅ РїСЂРµРіР»РµРґ РЅР° РјРµС‚РѕРґРёРєР°, РјРµРґРёСЏ Рё РїСЂР°РєС‚РёС‡РµСЃРєРё РґРµС‚Р°Р№Р»Рё."
        actions={<Button as={Link} to="/drills" variant="secondary" size="sm">в†ђ РќР°Р·Р°Рґ РєСЉРј СѓРїСЂР°Р¶РЅРµРЅРёСЏС‚Р°</Button>}
      />

      <Card title="РћР±РѕР±С‰РµРЅРёРµ" className="uiPage">
        <InfoRow label="РќРѕРјРµСЂ" value={drill.id != null ? String(drill.id) : ""} />
        <InfoRow label="РЎС‚Р°С‚СѓСЃ" value={mapStatusBg(drill.status)} />

        <InfoRow label="РљР°С‚РµРіРѕСЂРёСЏ" value={drill.category} />
        <InfoRow label="РќРёРІРѕ" value={drill.level} />
        <InfoRow label="Р¤РѕРєСѓСЃ РЅР° СѓРјРµРЅРёРµС‚Рѕ" value={drill.skill_focus} />

        <InfoRow label="РЎСѓР±РµРєС‚РёРІРЅР° С‚СЂСѓРґРЅРѕСЃС‚ (RPE 0вЂ“10)" value={drill.rpe != null ? String(drill.rpe) : ""} />

        <InfoRow label="РўРёРї РёРЅС‚РµРЅР·РёРІРЅРѕСЃС‚" value={drill.intensity_type} />
        <InfoRow label="РќРёРІРѕ РЅР° СЃР»РѕР¶РЅРѕСЃС‚" value={drill.complexity_level} />
        <InfoRow label="РќРёРІРѕ РЅР° РІР·РµРјР°РЅРµ РЅР° СЂРµС€РµРЅРёСЏ" value={drill.decision_level} />

        <InfoRow label="Р’СЉР·СЂР°СЃС‚ вЂ“ РјРёРЅРёРјСѓРј" value={drill.age_min != null ? String(drill.age_min) : ""} />
        <InfoRow label="Р’СЉР·СЂР°СЃС‚ вЂ“ РјР°РєСЃРёРјСѓРј" value={drill.age_max != null ? String(drill.age_max) : ""} />

        <InfoRow label="Р‘СЂРѕР№/СЃСЉСЃС‚Р°РІ РёРіСЂР°С‡Рё" value={drill.players} />
        <InfoRow label="РћР±РѕСЂСѓРґРІР°РЅРµ" value={drill.equipment} />

        <InfoRow
          label="РџСЂРѕРґСЉР»Р¶РёС‚РµР»РЅРѕСЃС‚ (РјРёРЅСѓС‚Рё) вЂ“ РјРёРЅРёРјСѓРј"
          value={drill.duration_min != null ? String(drill.duration_min) : ""}
        />
        <InfoRow
          label="РџСЂРѕРґСЉР»Р¶РёС‚РµР»РЅРѕСЃС‚ (РјРёРЅСѓС‚Рё) вЂ“ РјР°РєСЃРёРјСѓРј"
          value={drill.duration_max != null ? String(drill.duration_max) : ""}
        />

        <InfoRow label="РћСЃРЅРѕРІРЅР° С†РµР» РЅР° С‚СЂРµРЅРёСЂРѕРІРєР°С‚Р°" value={drill.training_goal} />
        <InfoRow label="Р’РёРґ СѓРїСЂР°Р¶РЅРµРЅРёРµ" value={drill.type_of_drill} />

        <InfoRow label="РЎСЉР·РґР°РґРµРЅРѕ РЅР°" value={fmtDateTime(drill.created_at)} />
        <InfoRow label="РџРѕСЃР»РµРґРЅР° РїСЂРѕРјСЏРЅР°" value={fmtDateTime(drill.updated_at)} />

        {String(drill.status || "").toLowerCase() === "rejected" && (
          <InfoRow label="РџСЂРёС‡РёРЅР° Р·Р° РѕС‚С…РІСЉСЂР»СЏРЅРµ" value={drill.rejection_reason} />
        )}
      </Card>

      <Card title="РћРїРёСЃР°РЅРёРµ Рё С†РµР»">
        <InfoRow label="Р¦РµР»" value={drill.goal} />
        <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5, color: drill.description ? "#111" : "#777" }}>
          {drill.description || "вЂ”"}
        </div>

        <div style={{ marginTop: 14 }}>
          <TextBlock title="Р’Р°СЂРёР°С†РёРё" text={drill.variations} />
        </div>
      </Card>

      <Card title="Р•С‚РёРєРµС‚Рё Р·Р° РіРµРЅРµСЂР°С‚РѕСЂР°">
        <Chips label="Р”РѕРјРµР№РЅРё РЅР° СѓРјРµРЅРёСЏ" items={drill.skill_domains} />
        <Chips label="Р¤Р°Р·Рё РЅР° РёРіСЂР°С‚Р°" items={drill.game_phases} />
        <Chips label="РўР°РєС‚РёС‡РµСЃРєРё Р°РєС†РµРЅС‚" items={drill.tactical_focus} />
        <Chips label="РўРµС…РЅРёС‡РµСЃРєРё Р°РєС†РµРЅС‚" items={drill.technical_focus} />
        <Chips label="РџРѕР·РёС†РёРѕРЅРµРЅ Р°РєС†РµРЅС‚" items={drill.position_focus} />
        <Chips label="Р—РѕРЅРѕРІ Р°РєС†РµРЅС‚" items={drill.zone_focus} />
      </Card>

      <Card title="РњРµС‚РѕРґРёРєР°">
        <div style={{ display: "grid", gap: 12 }}>
          <TextBlock title="РџРѕРґРіРѕС‚РѕРІРєР° Рё РѕСЂРіР°РЅРёР·Р°С†РёСЏ" text={drill.setup} />
          <TextBlock title="РРЅСЃС‚СЂСѓРєС†РёРё РєСЉРј РёРіСЂР°С‡РёС‚Рµ" text={drill.instructions} />
          <TextBlock title="РљР»СЋС‡РѕРІРё С‚СЂРµРЅСЊРѕСЂСЃРєРё РЅР°СЃРѕРєРё" text={drill.coaching_points} />
          <TextBlock title="Р§РµСЃС‚Рё РіСЂРµС€РєРё" text={drill.common_mistakes} />
          <TextBlock title="РџСЂРѕРіСЂРµСЃРёРё (РЅР°РґРіСЂР°Р¶РґР°РЅРµ)" text={drill.progressions} />
          <TextBlock title="Р РµРіСЂРµСЃРёРё (СѓР»РµСЃРЅСЏРІР°РЅРµ)" text={drill.regressions} />
        </div>
      </Card>

      <Card title="РњРµРґРёРµРЅ РјР°С‚РµСЂРёР°Р»">
        {hasVideo ? (
          <>
            <div style={{ marginBottom: 10, color: "#444", fontWeight: 800 }}>Р’РёРґРµРѕ</div>
            <DrillVideoPlayer url={videoUrl} />
          </>
        ) : hasImage ? (
          <>
            <div style={{ marginBottom: 10, color: "#444", fontWeight: 800 }}>РЎРЅРёРјРєР°</div>
            <ImagePreview url={imageUrl} alt={drill.title || "РЎРЅРёРјРєР°"} />
          </>
        ) : (
          <EmptyState title="РќСЏРјР° РґРѕР±Р°РІРµРЅРѕ РІРёРґРµРѕ РёР»Рё СЃРЅРёРјРєР°" description="Р”РѕР±Р°РІРё РјРµРґРёСЏ РєСЉРј СѓРїСЂР°Р¶РЅРµРЅРёРµС‚Рѕ РїСЂРё СЂРµРґР°РєС†РёСЏ." />
        )}
      </Card>
    </div>
  );
}
