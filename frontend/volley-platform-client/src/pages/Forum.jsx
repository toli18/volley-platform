import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import RichTextToolbar from "../components/RichTextToolbar";
import { toPlainTextSnippet } from "../utils/richText";

const QUICK_EMOJIS = ["🏐", "🔥", "💪", "🎯", "📈", "🧱", "👏", "🤝"];
const SUGGESTED_TAGS = [
  "сервис",
  "посрещане",
  "нападение",
  "блок",
  "защита",
  "разпределител",
  "либеро",
  "център",
  "диагонал",
  "U12",
  "U14",
  "U16",
  "U18",
  "възстановяване",
  "микроцикъл",
  "упражнения",
];

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на форума.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на форума.";
};

export default function Forum() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [newPost, setNewPost] = useState({
    title: "",
    content: "",
    category: "",
    selectedTags: [],
    customTag: "",
  });
  const [newPostFiles, setNewPostFiles] = useState([]);
  const newPostContentRef = useRef(null);
  const [filters, setFilters] = useState({
    query: "",
    category: "all",
    tag: "all",
    page: 1,
    page_size: 10,
  });
  const [meta, setMeta] = useState({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1,
  });

  const loadPosts = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError("");
      const params = {
        page: nextFilters.page,
        page_size: nextFilters.page_size,
      };
      if (nextFilters.query.trim()) params.query = nextFilters.query.trim();
      if (nextFilters.category !== "all") params.category = nextFilters.category;
      if (nextFilters.tag !== "all") params.tag = nextFilters.tag;

      const res = await axiosInstance.get(API_PATHS.FORUM_POSTS_LIST, { params });
      const data = res.data || {};
      setPosts(Array.isArray(data.items) ? data.items : []);
      setMeta({
        page: Number(data.page) || 1,
        page_size: Number(data.page_size) || nextFilters.page_size,
        total: Number(data.total) || 0,
        total_pages: Number(data.total_pages) || 1,
      });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts(filters);
  }, []);

  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const [catsRes, tagsRes] = await Promise.all([
          axiosInstance.get(API_PATHS.FORUM_CATEGORIES),
          axiosInstance.get(API_PATHS.FORUM_TAGS),
        ]);
        setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
        setPopularTags(Array.isArray(tagsRes.data) ? tagsRes.data : []);
      } catch {
        setCategories([]);
        setPopularTags([]);
      }
    };
    loadFilterData();
  }, []);

  const defaultCategories = [
    "Подрастващи",
    "Техника",
    "Тактика",
    "Физическа подготовка",
    "Психология и мотивация",
    "Видео анализ",
    "Травми и профилактика",
    "Мачова подготовка",
    "Планиране на сезон",
    "Правила и съдийство",
  ];
  const categoryOptions = Array.from(new Set([...defaultCategories, ...categories]));

  const toggleTag = (tag) => {
    setNewPost((prev) => {
      const selected = Array.isArray(prev.selectedTags) ? prev.selectedTags : [];
      const normalized = String(tag || "").trim();
      if (!normalized) return prev;
      if (selected.includes(normalized)) {
        return { ...prev, selectedTags: selected.filter((t) => t !== normalized) };
      }
      if (selected.length >= 12) return prev;
      return { ...prev, selectedTags: [...selected, normalized] };
    });
  };

  return (
    <div style={{ padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Форум за треньори</h1>
      <p style={{ margin: 0, color: "#607693" }}>
        Пространство за обмен на волейболни идеи, методики и практически опит между треньори и админи.
      </p>

      <section style={{ border: "1px solid #dbe5f2", borderRadius: 12, padding: 12, background: "#f9fbff" }}>
        <h3 style={{ marginTop: 0 }}>Нова тема</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="Заглавие на темата"
            value={newPost.title}
            onChange={(e) => setNewPost((prev) => ({ ...prev, title: e.target.value }))}
          />
          <select
            value={newPost.category}
            onChange={(e) => setNewPost((prev) => ({ ...prev, category: e.target.value }))}
          >
            <option value="">Избери категория (по желание)</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Добави собствен таг (по желание)"
            value={newPost.customTag}
            onChange={(e) => setNewPost((prev) => ({ ...prev, customTag: e.target.value }))}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                const custom = String(newPost.customTag || "").trim();
                if (!custom) return;
                toggleTag(custom);
                setNewPost((prev) => ({ ...prev, customTag: "" }));
              }}
            >
              Добави таг
            </button>
            <span style={{ color: "#64748b", fontSize: 13 }}>Избери тагове от примерите по-долу</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTED_TAGS.map((tag) => {
              const selected = newPost.selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    borderRadius: 999,
                    border: selected ? "1px solid #2563eb" : "1px solid #cbd5e1",
                    background: selected ? "#dbeafe" : "#fff",
                    color: selected ? "#1e3a8a" : "#334155",
                    padding: "4px 10px",
                  }}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
          {newPost.selectedTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {newPost.selectedTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 13,
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={newPostContentRef}
            rows={5}
            placeholder="Опиши темата, въпроса или идеята..."
            value={newPost.content}
            onChange={(e) => setNewPost((prev) => ({ ...prev, content: e.target.value }))}
          />
          <RichTextToolbar
            textareaRef={newPostContentRef}
            value={newPost.content}
            onChange={(next) => setNewPost((prev) => ({ ...prev, content: next }))}
            disabled={busy}
          />
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ color: "#334155", fontSize: 14 }}>
              Снимки/видео/файлове (по желание)
            </label>
            <input
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.docx,.pptx,.xlsx,.zip"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setNewPostFiles(files);
              }}
            />
            {newPostFiles.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {newPostFiles.map((f) => (
                  <span
                    key={`${f.name}-${f.size}`}
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                    }}
                  >
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewPost((prev) => ({ ...prev, content: `${prev.content}${emoji}` }))}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={busy}
              onClick={async () => {
                const payload = {
                  title: newPost.title.trim(),
                  content: newPost.content.trim(),
                  category: newPost.category || null,
                  tags: newPost.selectedTags,
                };
                if (!payload.title || !payload.content) return;
                try {
                  setBusy(true);
                  const createRes = await axiosInstance.post(API_PATHS.FORUM_POST_CREATE, payload);
                  const createdPostId = createRes?.data?.id;
                  if (createdPostId && newPostFiles.length > 0) {
                    for (const file of newPostFiles) {
                      const formData = new FormData();
                      formData.append("file", file);
                      await axiosInstance.post(API_PATHS.FORUM_POST_MEDIA_UPLOAD(createdPostId), formData, {
                        headers: { "Content-Type": "multipart/form-data" },
                      });
                    }
                  }
                  setNewPost({
                    title: "",
                    content: "",
                    category: "",
                    selectedTags: [],
                    customTag: "",
                  });
                  setNewPostFiles([]);
                  await loadPosts(filters);
                } catch (err) {
                  setError(normalizeError(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Публикувай тема
            </button>
            <button onClick={() => loadPosts(filters)}>Презареди</button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Теми</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              style={{ maxWidth: 260 }}
              placeholder="Търси тема..."
              value={filters.query}
              onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value, page: 1 }))}
            />
            <select
              value={filters.category}
              onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value, page: 1 }))}
            >
              <option value="all">Категория: всички</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={filters.tag} onChange={(e) => setFilters((prev) => ({ ...prev, tag: e.target.value, page: 1 }))}>
              <option value="all">Таг: всички</option>
              {popularTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
            <button onClick={() => loadPosts(filters)}>Приложи филтри</button>
          </div>
        </div>

        {error && <div style={{ background: "#ffdddd", color: "#a00", padding: 10, borderRadius: 8 }}>{error}</div>}
        {loading && <p>Зареждане...</p>}

        {!loading && posts.length === 0 && (
          <div style={{ border: "1px dashed #dbe5f2", borderRadius: 10, padding: 12 }}>
            Няма теми по това търсене.
          </div>
        )}

        {!loading &&
          posts.map((post) => (
            <article
              key={post.id}
              style={{
                border: "1px solid #dbe5f2",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>
                  {post.is_pinned ? "📌 " : ""}
                  {post.title}
                  {post.is_locked ? " 🔒" : ""}
                </strong>
                <span style={{ color: "#607693", fontSize: 13 }}>
                  {new Date(post.last_activity_at || post.created_at || "").toLocaleString("bg-BG")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "#334155", fontSize: 13 }}>
                {post.category && <span>Категория: {post.category}</span>}
                {(post.tags || []).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              <p style={{ margin: 0, color: "#0f172a" }}>{toPlainTextSnippet(post.content, 240)}</p>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#607693", fontSize: 13 }}>
                <span>Автор: {post.author_name || `Потребител #${post.author_id}`}</span>
                <span>Отговори: {post.replies_count || 0}</span>
                <span>Файлове: {post.media_count || 0}</span>
              </div>
              <div>
                <Link to={`/forum/${post.id}`}>Отвори темата</Link>
              </div>
            </article>
          ))}

        {!loading && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "#607693" }}>
              Страница {meta.page} от {meta.total_pages} ({meta.total} теми)
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={meta.page <= 1}
                onClick={() => {
                  const next = { ...filters, page: Math.max(1, meta.page - 1) };
                  setFilters(next);
                  loadPosts(next);
                }}
              >
                ← Предишна
              </button>
              <button
                disabled={meta.page >= meta.total_pages}
                onClick={() => {
                  const next = { ...filters, page: Math.min(meta.total_pages, meta.page + 1) };
                  setFilters(next);
                  loadPosts(next);
                }}
              >
                Следваща →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

