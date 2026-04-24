// src/pages/admin/AdminPendingDrill.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeDrillPayload, validateGeneratorMinimums } from "../../utils/drillCanonical";
import { AdminHero, Button, Card, Input } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Validation error (422)";
  return "Грешка при заявката";
};

const toIntOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const linesToList = (text) =>
  String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const splitCommaList = (text) =>
  String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const mergeUnique = (a, b) => {
  const set = new Set([...(a || []), ...(b || [])].filter(Boolean));
  return Array.from(set);
};

const OPTIONS = {
  категории: [
    "Техническа подготовка",
    "Тактическа подготовка",
    "Физическа подготовка",
    "Загрявка",
    "Игра",
    "Комбинации",
    "Защита",
    "Блокада",
    "Сервис",
    "Посрещане",
    "Нападение",
    "Разпределяне",
    "Преход",
    "Друго",
  ],
  нива: ["Начинаещи", "Средно ниво", "Напреднали", "Всички нива"],
  типИнтензивност: ["Ниска", "Средна", "Висока", "Смесена"],
  целТренировка: [
    "Техника",
    "Тактика",
    "Комуникация",
    "Психология",
    "Физика",
    "Координация",
    "Състезателна подготовка",
    "Възстановяване",
    "Друго",
  ],
  нивоСложност: ["Ниска", "Средна", "Висока"],
  нивоРешение: ["Ниско", "Средно", "Високо"],
  типУпражнение: ["Индивидуално", "По двойки", "Групово", "Отборно", "Игра 6:6", "Ситуативно", "Друго"],
  фокусУмение: ["Сервис", "Посрещане", "Разпределяне", "Нападение", "Блокада", "Защита", "Преход", "Комуникация", "Координация", "Общо"],
  играчиОпции: ["Индивидуално", "По двойки", "3v3", "4v4", "5v5", "6v6", "Смесени групи"],
  оборудванеОпции: ["Без уреди", "Топки", "Конуси", "Ластици", "Маркировка", "Мрежа", "Стена", "Смесено"],
  домейниУмения: ["Техника", "Тактика", "Комуникация", "Психология", "Физика", "Координация"],
  фазиНаИграта: ["Сервис", "Посрещане", "Разпределяне", "Нападение", "Блокада", "Защита", "Преход"],
  тактическиФокус: ["Система 5:1", "Система 4:2", "Покритие", "Зони", "Комбинации", "Тактика в сервис"],
  техническиФокус: ["Пас", "Подач", "Посрещане", "Нападение", "Блок", "Защита", "Разпределяне"],
  позиционенФокус: ["Разпределител", "Посрещач", "Диагонал", "Център", "Либеро", "Всички"],
  зоналенФокус: ["Зона 1", "Зона 2", "Зона 3", "Зона 4", "Зона 5", "Зона 6"],
};

function CheckboxGroup({ title, options, value, onChange, otherValue, onOtherChange, otherLabel }) {
  const set = new Set(value || []);
  const toggle = (opt) => {
    const next = new Set(set);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  };

  return (
    <Card title={title}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {options.map((opt) => (
          <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={set.has(opt)} onChange={() => toggle(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{otherLabel || "Други (по избор)"}</div>
        <Input
          value={otherValue || ""}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Разделяй със запетаи"
        />
      </div>
    </Card>
  );
}

export default function AdminPendingDrill() {
  const { id } = useParams();
  const drillId = useMemo(() => Number(id), [id]);
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    goal: "",
    category: "",
    level: "",
    skill_focus: "",
    players: "",
    equipment: "",
    rpe: "",
    duration_min: "",
    duration_max: "",
    intensity_type: "",
    complexity_level: "",
    decision_level: "",
    age_min: "",
    age_max: "",
    training_goal: "",
    type_of_drill: "",
    variations: "",
    setup: "",
    instructions: "",
    coaching_points: "",
    common_mistakes: "",
    progressions: "",
    regressions: "",
    skill_domains: [],
    game_phases: [],
    tactical_focus: [],
    technical_focus: [],
    position_focus: [],
    zone_focus: [],
    other_skill_domains: "",
    other_game_phases: "",
    other_tactical_focus: "",
    other_technical_focus: "",
    other_position_focus: "",
    other_zone_focus: "",
    image_urls_text: "",
    video_urls_text: "",
  });

  const load = async () => {
    if (!Number.isFinite(drillId)) {
      setError("Невалиден id в URL.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // GET /drills/{id} (fallback към alias ако трябва)
      let res;
      try {
        res = await axiosInstance.get(API_PATHS.DRILL_GET(drillId));
      } catch {
        res = await axiosInstance.get(API_PATHS.DRILL_GET_ALIAS(drillId));
      }

      const d = res.data || {};

      setForm({
        title: d?.title || d?.name || "",
        description: d?.description || "",
        goal: d?.goal || "",
        category: d?.category || "",
        level: d?.level || "",
        skill_focus: d?.skill_focus || "",
        players: d?.players || "",
        equipment: d?.equipment || "",
        rpe: d?.rpe ?? "",
        duration_min: d?.duration_min ?? "",
        duration_max: d?.duration_max ?? "",
        intensity_type: d?.intensity_type || "",
        complexity_level: d?.complexity_level || "",
        decision_level: d?.decision_level || "",
        age_min: d?.age_min ?? "",
        age_max: d?.age_max ?? "",
        training_goal: d?.training_goal || "",
        type_of_drill: d?.type_of_drill || "",
        variations: d?.variations || "",
        setup: d?.setup || "",
        instructions: d?.instructions || "",
        coaching_points: d?.coaching_points || "",
        common_mistakes: d?.common_mistakes || "",
        progressions: d?.progressions || "",
        regressions: d?.regressions || "",
        skill_domains: Array.isArray(d?.skill_domains) ? d.skill_domains : [],
        game_phases: Array.isArray(d?.game_phases) ? d.game_phases : [],
        tactical_focus: Array.isArray(d?.tactical_focus) ? d.tactical_focus : [],
        technical_focus: Array.isArray(d?.technical_focus) ? d.technical_focus : [],
        position_focus: Array.isArray(d?.position_focus) ? d.position_focus : [],
        zone_focus: Array.isArray(d?.zone_focus) ? d.zone_focus : [],
        other_skill_domains: "",
        other_game_phases: "",
        other_tactical_focus: "",
        other_technical_focus: "",
        other_position_focus: "",
        other_zone_focus: "",
        image_urls_text: Array.isArray(d?.image_urls) ? d.image_urls.join("\n") : "",
        video_urls_text: Array.isArray(d?.video_urls) ? d.video_urls.join("\n") : "",
      });
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

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const saveChanges = async () => {
    if (!form.title.trim()) {
      setError("Заглавието е задължително.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const rawPayload = {
        title: form.title.trim(),
        description: form.description?.trim() || null,
        goal: form.goal?.trim() || null,
        category: form.category?.trim() || null,
        level: form.level?.trim() || null,
        skill_focus: form.skill_focus?.trim() || null,
        players: form.players?.trim() || null,
        equipment: form.equipment?.trim() || null,
        rpe: toIntOrNull(form.rpe),
        duration_min: toIntOrNull(form.duration_min),
        duration_max: toIntOrNull(form.duration_max),
        intensity_type: form.intensity_type?.trim() || null,
        complexity_level: form.complexity_level?.trim() || null,
        decision_level: form.decision_level?.trim() || null,
        age_min: toIntOrNull(form.age_min),
        age_max: toIntOrNull(form.age_max),
        training_goal: form.training_goal?.trim() || null,
        type_of_drill: form.type_of_drill?.trim() || null,
        variations: form.variations?.trim() || null,
        setup: form.setup?.trim() || null,
        instructions: form.instructions?.trim() || null,
        coaching_points: form.coaching_points?.trim() || null,
        common_mistakes: form.common_mistakes?.trim() || null,
        progressions: form.progressions?.trim() || null,
        regressions: form.regressions?.trim() || null,
        skill_domains: mergeUnique(form.skill_domains, splitCommaList(form.other_skill_domains)),
        game_phases: mergeUnique(form.game_phases, splitCommaList(form.other_game_phases)),
        tactical_focus: mergeUnique(form.tactical_focus, splitCommaList(form.other_tactical_focus)),
        technical_focus: mergeUnique(form.technical_focus, splitCommaList(form.other_technical_focus)),
        position_focus: mergeUnique(form.position_focus, splitCommaList(form.other_position_focus)),
        zone_focus: mergeUnique(form.zone_focus, splitCommaList(form.other_zone_focus)),
        image_urls: linesToList(form.image_urls_text),
        video_urls: linesToList(form.video_urls_text),
      };
      const payload = normalizeDrillPayload(rawPayload);
      const missing = validateGeneratorMinimums(payload);
      if (missing.length > 0) {
        setError(`Липсват задължителни полета за генератора: ${missing.join(", ")}.`);
        setSaving(false);
        return;
      }

      // ✅ ВАЖНО: PATCH /drills/{id} (иначе 405)
      await axiosInstance.patch(API_PATHS.DRILL_UPDATE(drillId), payload);

      toast.success("Промените са запазени.");
      // по желание: reload от бекенда да видиш реално върнатото
      await load();
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (action) => {
    setActing(true);
    setError("");

    try {
      // POST /drills/admin/{id}/decision (fallback към alias)
      try {
        await axiosInstance.post(API_PATHS.DRILL_DECISION(drillId), { action });
      } catch {
        await axiosInstance.post(API_PATHS.DRILL_DECISION_ALIAS(drillId), { action });
      }

      toast.success(action === "approve" ? "Упражнението е одобрено." : "Упражнението е отхвърлено.");
      navigate("/admin/pending");
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="uiPage adminTheme" style={{ maxWidth: 900 }}>
      <AdminHero
        title={`Преглед / Редакция на упражнение #${Number.isFinite(drillId) ? drillId : "?"}`}
        subtitle="Преди одобрение може да коригираш детайлите и етикетите за генератора."
        actions={<Button as={Link} to="/admin/pending" variant="secondary" size="sm">← Назад към чакащи</Button>}
      />

      {loading && <p>Зареждане…</p>}

      {error && <div className="uiAlert uiAlert--danger">Грешка: {error}</div>}

      {!loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Заглавие *</label>
            <input name="title" value={form.title} onChange={onChange} style={{ width: "100%", padding: 10 }} />
          </div>

          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Описание</label>
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              rows={6}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Цел</label>
            <textarea name="goal" value={form.goal} onChange={onChange} rows={2} style={{ width: "100%", padding: 10 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Категория</label>
              <select name="category" value={form.category} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.категории.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Ниво</label>
              <select name="level" value={form.level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.нива.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>RPE</label>
              <input name="rpe" value={form.rpe} onChange={onChange} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Duration min</label>
              <input name="duration_min" value={form.duration_min} onChange={onChange} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Duration max</label>
              <input name="duration_max" value={form.duration_max} onChange={onChange} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Играч/и</label>
              <select name="players" value={form.players} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.играчиОпции.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Оборудване</label>
              <select name="equipment" value={form.equipment} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.оборудванеОпции.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Age min</label>
              <input name="age_min" value={form.age_min} onChange={onChange} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Age max</label>
              <input name="age_max" value={form.age_max} onChange={onChange} style={{ width: "100%", padding: 10 }} />
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Фокус на умението</label>
              <select name="skill_focus" value={form.skill_focus} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.фокусУмение.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Интензивност</label>
              <select name="intensity_type" value={form.intensity_type} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.типИнтензивност.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Сложност</label>
              <select name="complexity_level" value={form.complexity_level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.нивоСложност.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Decision level</label>
              <select name="decision_level" value={form.decision_level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.нивоРешение.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Цел на тренировката</label>
              <select name="training_goal" value={form.training_goal} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.целТренировка.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Тип упражнение</label>
              <select name="type_of_drill" value={form.type_of_drill} onChange={onChange} style={{ width: "100%", padding: 10 }}>
                <option value="">— Избери —</option>
                {OPTIONS.типУпражнение.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Вариации</label>
            <textarea name="variations" value={form.variations} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>

          <div style={{ borderTop: "1px solid #e4ebf6", paddingTop: 8, marginTop: 2, fontWeight: 900 }}>
            Методика
          </div>

          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Setup</label>
            <textarea name="setup" value={form.setup} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Instructions</label>
            <textarea name="instructions" value={form.instructions} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Coaching points</label>
            <textarea name="coaching_points" value={form.coaching_points} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Common mistakes</label>
            <textarea name="common_mistakes" value={form.common_mistakes} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Progressions</label>
            <textarea name="progressions" value={form.progressions} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Regressions</label>
            <textarea name="regressions" value={form.regressions} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
          </div>

          <div style={{ borderTop: "1px solid #e4ebf6", paddingTop: 8, marginTop: 2, fontWeight: 900 }}>
            Етикети за генератора (checkbox + optional "други")
          </div>

          <CheckboxGroup
            title="Домейни на умения"
            options={OPTIONS.домейниУмения}
            value={form.skill_domains}
            onChange={(v) => setForm((p) => ({ ...p, skill_domains: v }))}
            otherValue={form.other_skill_domains}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_skill_domains: v }))}
            otherLabel="Други домейни (по избор)"
          />
          <CheckboxGroup
            title="Фази на играта"
            options={OPTIONS.фазиНаИграта}
            value={form.game_phases}
            onChange={(v) => setForm((p) => ({ ...p, game_phases: v }))}
            otherValue={form.other_game_phases}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_game_phases: v }))}
            otherLabel="Други фази (по избор)"
          />
          <CheckboxGroup
            title="Тактически фокус"
            options={OPTIONS.тактическиФокус}
            value={form.tactical_focus}
            onChange={(v) => setForm((p) => ({ ...p, tactical_focus: v }))}
            otherValue={form.other_tactical_focus}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_tactical_focus: v }))}
            otherLabel="Друг тактически фокус (по избор)"
          />
          <CheckboxGroup
            title="Технически фокус"
            options={OPTIONS.техническиФокус}
            value={form.technical_focus}
            onChange={(v) => setForm((p) => ({ ...p, technical_focus: v }))}
            otherValue={form.other_technical_focus}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_technical_focus: v }))}
            otherLabel="Друг технически фокус (по избор)"
          />
          <CheckboxGroup
            title="Позиционен фокус"
            options={OPTIONS.позиционенФокус}
            value={form.position_focus}
            onChange={(v) => setForm((p) => ({ ...p, position_focus: v }))}
            otherValue={form.other_position_focus}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_position_focus: v }))}
            otherLabel="Други позиции (по избор)"
          />
          <CheckboxGroup
            title="Зонален фокус"
            options={OPTIONS.зоналенФокус}
            value={form.zone_focus}
            onChange={(v) => setForm((p) => ({ ...p, zone_focus: v }))}
            otherValue={form.other_zone_focus}
            onOtherChange={(v) => setForm((p) => ({ ...p, other_zone_focus: v }))}
            otherLabel="Други зони (по избор)"
          />

          <div style={{ borderTop: "1px solid #e4ebf6", paddingTop: 8, marginTop: 2, fontWeight: 900 }}>
            Медия (по 1 линк на ред)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Image URLs</label>
              <textarea name="image_urls_text" value={form.image_urls_text} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
            </div>

            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Video URLs</label>
              <textarea name="video_urls_text" value={form.video_urls_text} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <Button
              onClick={saveChanges}
              disabled={saving || acting}
              variant="secondary"
            >
              💾 Запази промени
            </Button>

            <Button
              onClick={() => decide("approve")}
              disabled={saving || acting}
            >
              ✅ Approve
            </Button>

            <Button
              onClick={() => decide("reject")}
              disabled={saving || acting}
              variant="danger"
            >
              ❌ Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
