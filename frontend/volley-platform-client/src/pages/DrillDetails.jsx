import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import DrillVideoPlayer from "../components/drills/DrillVideoPlayer";
import { Button, Card, EmptyState, PageHero } from "../components/ui";
import axiosInstance from "../utils/apiClient";
import { collectDrillMedia } from "../utils/drillVideo";
import {
  DRILL_EMPTY,
  displayValue,
  drillStatusClass,
  fmtDateShort,
  mapDrillStatus,
  tagBg,
} from "../utils/drillDisplayUtils";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Възникна грешка при заявката.";
};

function InfoRow({ label, value }) {
  const shown = displayValue(value);
  return (
    <div className="drillDetailRow">
      <div className="drillDetailRowLabel">{label}</div>
      <div className={`drillDetailRowValue${shown === DRILL_EMPTY ? " drillDetailRowValue--empty" : ""}`}>
        {shown}
      </div>
    </div>
  );
}

function Chips({ label, items }) {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  const shown = arr.map(tagBg).filter(Boolean);
  return (
    <div className="drillDetailChips">
      <div className="drillDetailChipsLabel">{label}</div>
      {shown.length === 0 ? (
        <div className="drillDetailRowValue drillDetailRowValue--empty">{DRILL_EMPTY}</div>
      ) : (
        <div className="drillDetailChipsList">
          {shown.map((x, idx) => (
            <span key={`${x}-${idx}`} className="uiBadge">
              {x}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Accordion({ title, children }) {
  return (
    <details className="drillDetailAccordion">
      <summary className="drillDetailAccordionSummary">{title}</summary>
      <div className="drillDetailAccordionBody">{children}</div>
    </details>
  );
}

function TextBlock({ title, text }) {
  const shown = displayValue(text);
  return (
    <div className="drillDetailTextBlock">
      <div className="drillDetailTextTitle">{title}</div>
      <div className={`drillDetailTextBody${shown === DRILL_EMPTY ? " drillDetailRowValue--empty" : ""}`}>
        {shown}
      </div>
    </div>
  );
}

function ImagePreview({ url, alt }) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return null;
  return (
    <div className="drillDetailImageWrap">
      <img src={safeUrl} alt={alt || "Снимка"} className="drillDetailImage" loading="lazy" />
      <a href={safeUrl} target="_blank" rel="noreferrer" className="drillDetailImageLink">
        Отвори снимката
      </a>
    </div>
  );
}

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

  const media = useMemo(() => collectDrillMedia(drill || {}), [drill]);
  const videoUrl = media.videoItems[0]?.original || "";
  const imageUrl = media.images[0] || "";
  const hasVideo = Boolean(videoUrl);
  const hasImage = Boolean(imageUrl);

  const durationLabel = useMemo(() => {
    if (!drill) return DRILL_EMPTY;
    const min = drill.duration_min;
    const max = drill.duration_max;
    if (min != null && max != null) return `${min}–${max} мин`;
    if (min != null) return `от ${min} мин`;
    if (max != null) return `до ${max} мин`;
    return DRILL_EMPTY;
  }, [drill]);

  if (loading) return <div className="uiPage">Зареждане…</div>;

  if (error) {
    return (
      <div className="uiPage">
        <Button as={Link} to="/drills" variant="secondary" size="sm">
          ← Назад към упражненията
        </Button>
        <div className="uiAlert uiAlert--danger">
          <strong>Грешка:</strong> {error}
        </div>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="uiPage">
        <Button as={Link} to="/drills" variant="secondary" size="sm">
          ← Назад към упражненията
        </Button>
        <EmptyState
          title="Няма данни за това упражнение"
          description="Провери дали упражнението съществува."
        />
      </div>
    );
  }

  return (
    <div className="uiPage drillDetailPage">
      <PageHero
        title={drill.title || "Упражнение"}
        subtitle={`ID ${drill.id} · ${displayValue(drill.category)} · ${displayValue(drill.level)}`}
        actions={
          <Button as={Link} to="/drills" variant="secondary" size="sm">
            ← Назад
          </Button>
        }
      />

      {(hasVideo || hasImage) && (
        <Card title="Медия" className="drillDetailCard">
          {hasVideo ? <DrillVideoPlayer url={videoUrl} /> : <ImagePreview url={imageUrl} alt={drill.title} />}
        </Card>
      )}

      <Card title="Цел и описание" className="drillDetailCard">
        <InfoRow label="Цел" value={drill.goal} />
        <div className="drillDetailDescription">{displayValue(drill.description)}</div>
        {drill.variations ? <TextBlock title="Вариации" text={drill.variations} /> : null}
      </Card>

      <Card title="Ключова информация" className="drillDetailCard">
        <div className="drillDetailKeyGrid">
          <InfoRow label="Категория" value={drill.category} />
          <InfoRow label="Ниво" value={drill.level} />
          <InfoRow label="Играчи" value={drill.players} />
          <InfoRow label="Оборудване" value={drill.equipment} />
          <InfoRow label="Продължителност" value={durationLabel} />
          <InfoRow label="Фокус" value={drill.skill_focus} />
        </div>
        <div className="drillDetailStatusRow">
          <span className={drillStatusClass(drill.status)}>{mapDrillStatus(drill.status)}</span>
        </div>
      </Card>

      <Card className="drillDetailCard drillDetailCard--flat">
        <Accordion title="Методика и указания">
          <TextBlock title="Подготовка и организация" text={drill.setup} />
          <TextBlock title="Инструкции към играчите" text={drill.instructions} />
          <TextBlock title="Ключови треньорски насоки" text={drill.coaching_points} />
          <TextBlock title="Чести грешки" text={drill.common_mistakes} />
          <TextBlock title="Прогресии (надграждане)" text={drill.progressions} />
          <TextBlock title="Регресии (улесняване)" text={drill.regressions} />
        </Accordion>

        <Accordion title="Технически тагове (генератор)">
          <Chips label="Домейни на умения" items={drill.skill_domains} />
          <Chips label="Фази на играта" items={drill.game_phases} />
          <Chips label="Тактически акцент" items={drill.tactical_focus} />
          <Chips label="Технически акцент" items={drill.technical_focus} />
          <Chips label="Позиционен акцент" items={drill.position_focus} />
          <Chips label="Зонов акцент" items={drill.zone_focus} />
        </Accordion>

        <Accordion title="Допълнителни данни">
          <InfoRow label="RPE (0–10)" value={drill.rpe != null ? String(drill.rpe) : ""} />
          <InfoRow label="Тип интензитет" value={drill.intensity_type} />
          <InfoRow label="Сложност" value={drill.complexity_level} />
          <InfoRow label="Вземане на решения" value={drill.decision_level} />
          <InfoRow label="Възраст мин." value={drill.age_min} />
          <InfoRow label="Възраст макс." value={drill.age_max} />
          <InfoRow label="Цел на тренировката" value={drill.training_goal} />
          <InfoRow label="Вид упражнение" value={drill.type_of_drill} />
          <InfoRow label="Създадено" value={fmtDateShort(drill.created_at)} />
          <InfoRow label="Обновено" value={fmtDateShort(drill.updated_at)} />
          {String(drill.status || "").toLowerCase() === "rejected" ? (
            <InfoRow label="Причина за отхвърляне" value={drill.rejection_reason} />
          ) : null}
        </Accordion>
      </Card>
    </div>
  );
}
