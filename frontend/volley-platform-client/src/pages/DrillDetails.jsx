// src/pages/DrillDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axiosInstance from "../utils/apiClient";

/** ---------- Грешки от FastAPI ---------- */
const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Възникна грешка при заявката.";
};

/** ---------- Форматиране ---------- */
const fmtDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("bg-BG");
};

const mapStatusBg = (status) => {
  const s = String(status || "").toLowerCase();
  const map = {
    draft: "чернова",
    pending: "чака одобрение",
    approved: "одобрено",
    rejected: "отхвърлено",
  };
  return map[s] || (status ? String(status) : "—");
};

/** По желание: превод на типични тагове, ако в базата са на английски */
const tagBg = (t) => {
  const x = String(t || "").trim();
  if (!x) return "";
  const k = x.toLowerCase();

  const dict = {
    // Фази
    serve: "сервис",
    service: "сервис",
    receive: "посрещане",
    reception: "посрещане",
    setting: "разпределяне",
    set: "разпределяне",
    attack: "атака",
    block: "блокада",
    defense: "защита",
    transition: "преход",

    // Технически
    pass: "пас",
    spike: "нападение",
    hit: "нападение",
    dig: "защита (диг)",

    // Домейни
    technique: "техника",
    tactics: "тактика",
    communication: "комуникация",
    psychology: "психология",
    physical: "физическа подготовка",
    coordination: "координация",
  };

  return dict[k] || x;
};

/** ---------- UI компоненти ---------- */
function Card({ title, children }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }) {
  const v = value === 0 ? "0" : value;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10, padding: "4px 0" }}>
      <div style={{ color: "#444" }}>{label}</div>
      <div style={{ fontWeight: 700, color: v ? "#111" : "#777" }}>{v || "—"}</div>
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
        <div style={{ color: "#777", fontWeight: 700 }}>—</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shown.map((x, idx) => (
            <span
              key={`${x}-${idx}`}
              style={{
                border: "1px solid #ccc",
                borderRadius: 999,
                padding: "4px 10px",
                fontWeight: 800,
              }}
            >
              {x}
            </span>
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
        {text || "—"}
      </div>
    </div>
  );
}

/** ---------- Медия помощни ---------- */
const isImageUrl = (url) => /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(String(url || ""));
const isDirectVideoUrl = (url) => /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || ""));

const getYoutubeId = (url) => {
  const u = String(url || "");
  // youtu.be/ID
  const m1 = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (m1?.[1]) return m1[1];
  // youtube.com/watch?v=ID
  const m2 = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m2?.[1]) return m2[1];
  // youtube.com/embed/ID
  const m3 = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (m3?.[1]) return m3[1];
  return null;
};

const getVimeoId = (url) => {
  const u = String(url || "");
  // vimeo.com/12345678
  const m = u.match(/vimeo\.com\/(\d{6,})/);
  return m?.[1] || null;
};

/** ---------- ВАЖНО: нормализация за embed (Drive/Dropbox/OneDrive) ---------- */
const normalizeEmbedUrl = (rawUrl) => {
  const u = String(rawUrl || "").trim();
  if (!u) return "";

  // Google Drive: share link -> /preview
  // Примери:
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID&export=download
  if (u.includes("drive.google.com")) {
    const mFile = u.match(/\/file\/d\/([^/]+)/);
    if (mFile?.[1]) return `https://drive.google.com/file/d/${mFile[1]}/preview`;

    const mOpen = u.match(/[?&]id=([^&]+)/);
    if (mOpen?.[1]) return `https://drive.google.com/file/d/${mOpen[1]}/preview`;
  }

  // Dropbox: www.dropbox.com/... -> dl.dropboxusercontent.com/... или ?raw=1
  if (u.includes("dropbox.com")) {
    try {
      const urlObj = new URL(u);
      urlObj.searchParams.delete("dl");
      urlObj.searchParams.set("raw", "1");
      return urlObj.toString();
    } catch {
      // ignore
    }
  }

  // OneDrive (прост вариант): често дава "embed" параметри, тук само връщаме линка
  // (ако имаш конкретни OneDrive формати, ще го донастроим)
  return u;
};

/** ---------- Видео плеър (вграден прозорец, без препращане) ---------- */
function VideoPlayer({ url }) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return null;

  const frameBox = (src, allow) => (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <div style={{ position: "relative", paddingTop: "56.25%" }}>
        <iframe
          title="Видео"
          src={src}
          allow={allow}
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </div>
  );

  // YouTube
  const yt = getYoutubeId(safeUrl);
  if (yt) {
    const src = `https://www.youtube.com/embed/${yt}`;
    return frameBox(
      src,
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    );
  }

  // Vimeo
  const vimeo = getVimeoId(safeUrl);
  if (vimeo) {
    const src = `https://player.vimeo.com/video/${vimeo}`;
    return frameBox(src, "autoplay; fullscreen; picture-in-picture");
  }

  // Direct mp4/webm/ogg
  if (isDirectVideoUrl(safeUrl)) {
    return (
      <video
        controls
        playsInline
        style={{ width: "100%", maxHeight: 520, borderRadius: 12, border: "1px solid #ddd", background: "#000" }}
      >
        <source src={safeUrl} />
        Вашият браузър не поддържа видео.
      </video>
    );
  }

  // Universal iframe embed (Drive/Dropbox/etc.)
  const embedUrl = normalizeEmbedUrl(safeUrl);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {frameBox(embedUrl, "autoplay; fullscreen; picture-in-picture")}
      <div style={{ color: "#444", fontWeight: 700 }}>
        Ако видеото не се показва, сайтът вероятно забранява вграждане (X-Frame-Options/CSP). Резервен линк:{" "}
        <a href={safeUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 900 }}>
          Отвори видеото
        </a>
      </div>
    </div>
  );
}

/** ---------- Снимка + увеличение ---------- */
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
            alt={alt || "Снимка"}
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
          <button
            type="button"
            onClick={openModal}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            🔍 Увеличи
          </button>

          <a href={safeUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
            Отвори снимката в нов прозорец
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
              <button
                type="button"
                onClick={zoomOut}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #fff",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                −
              </button>

              <button
                type="button"
                onClick={zoomIn}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #fff",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                +
              </button>

              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #fff",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Побиране
              </button>

              <div style={{ color: "#fff", fontWeight: 800, marginLeft: 6, opacity: 0.9 }}>
                Мащаб: {fit ? "побиране" : `${Math.round(scale * 100)}%`}
              </div>

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #fff",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                ✕ Затвори
              </button>
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
                alt={alt || "Снимка"}
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

/** ---------- Главен компонент ---------- */
export default function DrillDetails() {
  const { id } = useParams();
  const drillId = useMemo(() => Number(id), [id]);

  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!Number.isFinite(drillId)) {
      setError("Невалиден идентификатор на упражнение.");
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

  if (loading) return <div style={{ padding: 20 }}>Зареждане…</div>;

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <Link to="/drills">← Назад към упражненията</Link>
        <div style={{ marginTop: 12, background: "#ffdddd", padding: 10, borderRadius: 8, color: "#a00" }}>
          <strong>Грешка:</strong> {error}
        </div>
      </div>
    );
  }

  if (!drill) {
    return (
      <div style={{ padding: 20 }}>
        <Link to="/drills">← Назад към упражненията</Link>
        <div style={{ marginTop: 12 }}>Няма данни за това упражнение.</div>
      </div>
    );
  }

  // Логика: ВИДЕО > СНИМКА > НИЩО
  const videoUrl = Array.isArray(drill.video_urls) ? (drill.video_urls.find(Boolean) || "") : "";
  const imageUrl = Array.isArray(drill.image_urls) ? (drill.image_urls.find(Boolean) || "") : "";

  const hasVideo = Boolean(String(videoUrl || "").trim());
  const hasImage = Boolean(String(imageUrl || "").trim());

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/drills">← Назад към упражненията</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>{drill.title || "Без име"}</h2>

      <Card title="Обобщение">
        <InfoRow label="Номер" value={drill.id != null ? String(drill.id) : ""} />
        <InfoRow label="Статус" value={mapStatusBg(drill.status)} />

        <InfoRow label="Категория" value={drill.category} />
        <InfoRow label="Ниво" value={drill.level} />
        <InfoRow label="Фокус на умението" value={drill.skill_focus} />

        <InfoRow label="Субективна трудност (RPE 0–10)" value={drill.rpe != null ? String(drill.rpe) : ""} />

        <InfoRow label="Тип интензивност" value={drill.intensity_type} />
        <InfoRow label="Ниво на сложност" value={drill.complexity_level} />
        <InfoRow label="Ниво на вземане на решения" value={drill.decision_level} />

        <InfoRow label="Възраст – минимум" value={drill.age_min != null ? String(drill.age_min) : ""} />
        <InfoRow label="Възраст – максимум" value={drill.age_max != null ? String(drill.age_max) : ""} />

        <InfoRow label="Брой/състав играчи" value={drill.players} />
        <InfoRow label="Оборудване" value={drill.equipment} />

        <InfoRow
          label="Продължителност (минути) – минимум"
          value={drill.duration_min != null ? String(drill.duration_min) : ""}
        />
        <InfoRow
          label="Продължителност (минути) – максимум"
          value={drill.duration_max != null ? String(drill.duration_max) : ""}
        />

        <InfoRow label="Основна цел на тренировката" value={drill.training_goal} />
        <InfoRow label="Вид упражнение" value={drill.type_of_drill} />

        <InfoRow label="Създадено на" value={fmtDateTime(drill.created_at)} />
        <InfoRow label="Последна промяна" value={fmtDateTime(drill.updated_at)} />

        {String(drill.status || "").toLowerCase() === "rejected" && (
          <InfoRow label="Причина за отхвърляне" value={drill.rejection_reason} />
        )}
      </Card>

      <Card title="Описание и цел">
        <InfoRow label="Цел" value={drill.goal} />
        <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5, color: drill.description ? "#111" : "#777" }}>
          {drill.description || "—"}
        </div>

        <div style={{ marginTop: 14 }}>
          <TextBlock title="Вариации" text={drill.variations} />
        </div>
      </Card>

      <Card title="Етикети за генератора">
        <Chips label="Домейни на умения" items={drill.skill_domains} />
        <Chips label="Фази на играта" items={drill.game_phases} />
        <Chips label="Тактически акцент" items={drill.tactical_focus} />
        <Chips label="Технически акцент" items={drill.technical_focus} />
        <Chips label="Позиционен акцент" items={drill.position_focus} />
        <Chips label="Зонов акцент" items={drill.zone_focus} />
      </Card>

      <Card title="Методика">
        <div style={{ display: "grid", gap: 12 }}>
          <TextBlock title="Подготовка и организация" text={drill.setup} />
          <TextBlock title="Инструкции към играчите" text={drill.instructions} />
          <TextBlock title="Ключови треньорски насоки" text={drill.coaching_points} />
          <TextBlock title="Чести грешки" text={drill.common_mistakes} />
          <TextBlock title="Прогресии (надграждане)" text={drill.progressions} />
          <TextBlock title="Регресии (улесняване)" text={drill.regressions} />
        </div>
      </Card>

      <Card title="Медиен материал">
        {hasVideo ? (
          <>
            <div style={{ marginBottom: 10, color: "#444", fontWeight: 800 }}>Видео</div>
            <VideoPlayer url={videoUrl} />
          </>
        ) : hasImage ? (
          <>
            <div style={{ marginBottom: 10, color: "#444", fontWeight: 800 }}>Снимка</div>
            <ImagePreview url={imageUrl} alt={drill.title || "Снимка"} />
          </>
        ) : (
          <div style={{ color: "#777", fontWeight: 800 }}>Няма добавено видео или снимка за това упражнение.</div>
        )}
      </Card>
    </div>
  );
}
