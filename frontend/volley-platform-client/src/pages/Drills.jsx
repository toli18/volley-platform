import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import DrillMediaPreviewModal from "../components/DrillMediaPreviewModal";
import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import {
  displayValue,
  drillFirstImageUrl,
  drillHasVideo,
  drillStatusClass,
  mapDrillStatus,
  truncateText,
  uniqueSorted,
} from "../utils/drillDisplayUtils";
import { resolveMediaUrl } from "../utils/drillVideo";
import {
  Button,
  Card,
  EmptyState,
  PageHero,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Възникна грешка при заявката.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  if (typeof detail === "object") return JSON.stringify(detail);
  return "Възникна грешка при заявката.";
};

async function getWithFallback(primaryPath, aliasPath) {
  try {
    const res = await axiosInstance.get(primaryPath);
    return res.data;
  } catch (e) {
    const status = e?.response?.status;
    if (aliasPath && (status === 404 || status === 405)) {
      const res2 = await axiosInstance.get(aliasPath);
      return res2.data;
    }
    throw e;
  }
}

function DrillMediaBadge({ drill }) {
  const imageUrl = resolveMediaUrl(drillFirstImageUrl(drill));
  const hasVideo = drillHasVideo(drill);
  const hasImage = Boolean(imageUrl);

  if (hasImage) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="drillListThumb"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  if (hasVideo) {
    return <span className="drillListMediaBadge drillListMediaBadge--video" aria-hidden>▶</span>;
  }
  return <span className="drillListMediaBadge drillListMediaBadge--empty">—</span>;
}

function DrillCard({ drill, onPreview }) {
  const title = drill.title || drill.name || "Няма заглавие";
  const desc = truncateText(drill.description, 100) || "Няма описание";

  return (
    <article className="drillListCard">
      <button type="button" className="drillListCardPreview" onClick={() => onPreview(drill)}>
        <DrillMediaBadge drill={drill} />
      </button>
      <div className="drillListCardBody">
        <div className="drillListCardTop">
          <Link to={`/drills/${drill.id}`} className="drillListCardTitle">
            {title}
          </Link>
          <span className={drillStatusClass(drill.status)}>{mapDrillStatus(drill.status)}</span>
        </div>
        <p className="drillListCardMeta">
          #{drill.id} · {displayValue(drill.category)} · {displayValue(drill.level)}
        </p>
        <p className="drillListCardDesc">{desc}</p>
        <div className="drillListCardActions">
          <Button type="button" variant="secondary" size="sm" onClick={() => onPreview(drill)}>
            Бърз преглед
          </Button>
          <Button as={Link} to={`/drills/${drill.id}`} variant="ghost" size="sm">
            Детайли
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function Drills() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [onlyWithVideo, setOnlyWithVideo] = useState(false);
  const [previewDrill, setPreviewDrill] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getWithFallback(API_PATHS.DRILLS_LIST, API_PATHS.DRILLS_LIST_ALIAS);
      setDrills(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(
    () => uniqueSorted(drills.map((d) => d.category)),
    [drills]
  );
  const levels = useMemo(() => uniqueSorted(drills.map((d) => d.level)), [drills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drills.filter((drill) => {
      if (category && String(drill.category || "") !== category) return false;
      if (level && String(drill.level || "") !== level) return false;
      if (onlyWithVideo && !drillHasVideo(drill)) return false;
      if (!q) return true;
      const title = String(drill.title || drill.name || "").toLowerCase();
      const desc = String(drill.description || "").toLowerCase();
      return title.includes(q) || desc.includes(q) || String(drill.id).includes(q);
    });
  }, [drills, query, category, level, onlyWithVideo]);

  return (
    <div className="uiPage drillListPage">
      <PageHero
        title="Упражнения"
        subtitle="Каталог с одобрени упражнения за преглед и практическа употреба."
        actions={
          <Button variant="secondary" onClick={load}>
            ⟳ Презареди
          </Button>
        }
      />

      <Card className="drillListFilters">
        <div className="drillListFiltersGrid">
          <label className="drillListFilter">
            <span>Търсене</span>
            <input
              type="search"
              className="drillListFilterInput"
              placeholder="Заглавие, описание, ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="drillListFilter">
            <span>Категория</span>
            <select className="drillListFilterInput" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Всички</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="drillListFilter">
            <span>Ниво</span>
            <select className="drillListFilterInput" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Всички</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="drillListFilter drillListFilter--check">
            <input
              type="checkbox"
              checked={onlyWithVideo}
              onChange={(e) => setOnlyWithVideo(e.target.checked)}
            />
            <span>Само с видео</span>
          </label>
        </div>
        <p className="drillListFilterCount">
          Показани: <strong>{filtered.length}</strong> от {drills.length}
        </p>
      </Card>

      {error && (
        <div className="uiAlert uiAlert--danger">Грешка: {error}</div>
      )}

      {loading && <p>Зареждане…</p>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Няма упражнения" description="Промени филтрите или презареди." />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="drillListCards">
            {filtered.map((drill) => (
              <DrillCard key={drill.id} drill={drill} onPreview={setPreviewDrill} />
            ))}
          </div>

          <Card padded={false} className="drillListTableWrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Заглавие</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead>Медия</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((drill) => {
                  const title = drill.title || drill.name || "Няма заглавие";
                  return (
                    <TableRow key={drill.id}>
                      <TableCell>{drill.id}</TableCell>
                      <TableCell>
                        <Button as={Link} to={`/drills/${drill.id}`} variant="ghost" size="sm">
                          {title}
                        </Button>
                      </TableCell>
                      <TableCell>{truncateText(drill.description, 80) || "Няма описание"}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="drillListTableMediaBtn"
                          onClick={() => setPreviewDrill(drill)}
                          title="Бърз преглед"
                        >
                          <DrillMediaBadge drill={drill} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className={drillStatusClass(drill.status)}>{mapDrillStatus(drill.status)}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {previewDrill && (
        <DrillMediaPreviewModal drill={previewDrill} onClose={() => setPreviewDrill(null)} />
      )}
    </div>
  );
}
