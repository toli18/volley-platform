import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { Button, Card, Input } from "../../components/ui";

const toIntOrNull = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const splitCommaList = (text) =>
  (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const linesToList = (text) =>
  (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const mergeUnique = (a, b) => {
  const set = new Set([...(a || []), ...(b || [])].filter(Boolean));
  return Array.from(set);
};

const normalizeFastApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при заявката";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422)";
  return "Грешка при заявката";
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

  домейниУмения: ["Техника", "Тактика", "Комуникация", "Психология", "Физика", "Координация"],
  фазиНаИграта: ["Сервис", "Посрещане", "Разпределяне", "Нападение", "Блокада", "Защита", "Преход"],
  тактическиФокус: ["Система 5:1", "Система 4:2", "Покритие", "Зони", "Комбинации", "Тактика в сервис"],
  техническиФокус: ["Пас", "Подач", "Посрещане", "Нападение", "Блок", "Защита", "Разпределяне"],
  позиционенФокус: ["Разпределител", "Посрещач", "Диагонал", "Център", "Либеро", "Всички"],
  зоналенФокус: ["Зона 1", "Зона 2", "Зона 3", "Зона 4", "Зона 5", "Зона 6"],
};

function SectionTitle({ children }) {
  return <h3 style={{ marginTop: 18, marginBottom: 10 }}>{children}</h3>;
}

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontWeight: 700 }}>{label}</label>
      {children}
      {hint ? <div style={{ fontSize: 12, color: "#666" }}>{hint}</div> : null}
    </div>
  );
}

function Row({ children, cols = 2 }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols === 3 ? "1fr 1fr 1fr" : "1fr 1fr",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

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
          placeholder="напр. Подавач, Комбинации, 6:6"
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Разделяй със запетаи.</div>
      </div>
    </Card>
  );
}

export default function AdminEditDrill() {
  const { id } = useParams();
  const drillId = useMemo(() => Number(id), [id]);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    goal: "",
    description: "",
    variations: "",

    category: "",
    level: "",
    skill_focus: "",

    players: "",
    equipment: "",
    rpe: "",
    duration_min: "",
    duration_max: "",

    intensity_type: "",
    training_goal: "",
    complexity_level: "",
    decision_level: "",
    age_min: "",
    age_max: "",
    type_of_drill: "",

    setup: "",
    instructions: "",
    coaching_points: "",
    common_mistakes: "",
    progressions: "",
    regressions: "",

    image_urls_text: "",
    video_urls_text: "",

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
  });

  const load = async () => {
    if (!Number.isFinite(drillId)) {
      setError("Невалиден идентификатор в адреса.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await axiosInstance.get(`/drills/${drillId}`);
      const d = res.data || {};

      setForm((p) => ({
        ...p,
        title: d.title || "",
        goal: d.goal || "",
        description: d.description || "",
        variations: d.variations || "",

        category: d.category || "",
        level: d.level || "",
        skill_focus: d.skill_focus || "",

        players: d.players || "",
        equipment: d.equipment || "",
        rpe: d.rpe ?? "",
        duration_min: d.duration_min ?? "",
        duration_max: d.duration_max ?? "",

        intensity_type: d.intensity_type || "",
        training_goal: d.training_goal || "",
        complexity_level: d.complexity_level || "",
        decision_level: d.decision_level || "",
        age_min: d.age_min ?? "",
        age_max: d.age_max ?? "",
        type_of_drill: d.type_of_drill || "",

        setup: d.setup || "",
        instructions: d.instructions || "",
        coaching_points: d.coaching_points || "",
        common_mistakes: d.common_mistakes || "",
        progressions: d.progressions || "",
        regressions: d.regressions || "",

        image_urls_text: Array.isArray(d.image_urls) ? d.image_urls.join("\n") : "",
        video_urls_text: Array.isArray(d.video_urls) ? d.video_urls.join("\n") : "",

        skill_domains: Array.isArray(d.skill_domains) ? d.skill_domains : [],
        game_phases: Array.isArray(d.game_phases) ? d.game_phases : [],
        tactical_focus: Array.isArray(d.tactical_focus) ? d.tactical_focus : [],
        technical_focus: Array.isArray(d.technical_focus) ? d.technical_focus : [],
        position_focus: Array.isArray(d.position_focus) ? d.position_focus : [],
        zone_focus: Array.isArray(d.zone_focus) ? d.zone_focus : [],
      }));
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

  const computedPayload = useMemo(() => {
    return {
      title: form.title.trim(),
      goal: form.goal.trim() || null,
      description: form.description.trim() || null,
      variations: form.variations.trim() || null,

      category: form.category || null,
      level: form.level || null,
      skill_focus: form.skill_focus.trim() || null,

      players: form.players.trim() || null,
      equipment: form.equipment.trim() || null,
      rpe: toIntOrNull(form.rpe),
      duration_min: toIntOrNull(form.duration_min),
      duration_max: toIntOrNull(form.duration_max),

      intensity_type: form.intensity_type || null,
      training_goal: form.training_goal || null,
      complexity_level: form.complexity_level || null,
      decision_level: form.decision_level || null,
      age_min: toIntOrNull(form.age_min),
      age_max: toIntOrNull(form.age_max),
      type_of_drill: form.type_of_drill || null,

      skill_domains: mergeUnique(form.skill_domains, splitCommaList(form.other_skill_domains)),
      game_phases: mergeUnique(form.game_phases, splitCommaList(form.other_game_phases)),
      tactical_focus: mergeUnique(form.tactical_focus, splitCommaList(form.other_tactical_focus)),
      technical_focus: mergeUnique(form.technical_focus, splitCommaList(form.other_technical_focus)),
      position_focus: mergeUnique(form.position_focus, splitCommaList(form.other_position_focus)),
      zone_focus: mergeUnique(form.zone_focus, splitCommaList(form.other_zone_focus)),

      setup: form.setup.trim() || null,
      instructions: form.instructions.trim() || null,
      coaching_points: form.coaching_points.trim() || null,
      common_mistakes: form.common_mistakes.trim() || null,
      progressions: form.progressions.trim() || null,
      regressions: form.regressions.trim() || null,

      image_urls: linesToList(form.image_urls_text),
      video_urls: linesToList(form.video_urls_text),
    };
  }, [form]);

  const save = async () => {
    setError("");
    if (!form.title.trim()) {
      setError("Името е задължително.");
      return;
    }

    try {
      setSaving(true);

      // Админ редакция: PATCH /drills/{id} (при теб това е админският update)
      await axiosInstance.patch(`/drills/${drillId}`, computedPayload);

      alert("Промените са запазени.");
      navigate("/admin/drills");
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="uiPage">Зареждане…</div>;

  return (
    <div className="uiPage" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 12 }}>
        <Button as={Link} to="/admin/drills" variant="secondary" size="sm">
          ← Назад към всички упражнения
        </Button>
      </div>

      <h2 style={{ marginTop: 0 }}>Администраторска редакция</h2>

      {error ? <div className="uiAlert uiAlert--danger">Грешка: {error}</div> : null}

      <SectionTitle>Основни</SectionTitle>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Име *">
          <input name="title" value={form.title} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>

        <Field label="Цел">
          <textarea name="goal" value={form.goal} onChange={onChange} rows={2} style={{ width: "100%", padding: 10 }} />
        </Field>

        <Field label="Описание">
          <textarea name="description" value={form.description} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
        </Field>

        <Field label="Вариации">
          <textarea name="variations" value={form.variations} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
      </div>

      <SectionTitle>Категоризация</SectionTitle>
      <Row>
        <Field label="Категория">
          <select name="category" value={form.category} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.категории.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ниво">
          <select name="level" value={form.level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.нива.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <Field label="Фокус на умението">
        <input name="skill_focus" value={form.skill_focus} onChange={onChange} style={{ width: "100%", padding: 10 }} />
      </Field>

      <SectionTitle>Организация и метрики</SectionTitle>
      <Row>
        <Field label="Играчи">
          <input name="players" value={form.players} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>

        <Field label="Оборудване">
          <input name="equipment" value={form.equipment} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
      </Row>

      <Row cols={3}>
        <Field label="RPE (0–10)">
          <input name="rpe" value={form.rpe} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Продължителност (мин) – минимум">
          <input name="duration_min" value={form.duration_min} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Продължителност (мин) – максимум">
          <input name="duration_max" value={form.duration_max} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
      </Row>

      <SectionTitle>Интелигентни полета (за генератора)</SectionTitle>
      <Row>
        <Field label="Тип интензивност">
          <select name="intensity_type" value={form.intensity_type} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.типИнтензивност.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Основна цел на тренировка">
          <select name="training_goal" value={form.training_goal} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.целТренировка.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <Row>
        <Field label="Ниво на сложност">
          <select name="complexity_level" value={form.complexity_level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.нивоСложност.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ниво на вземане на решения">
          <select name="decision_level" value={form.decision_level} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.нивоРешение.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <Row cols={3}>
        <Field label="Минимална възраст">
          <input name="age_min" value={form.age_min} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Максимална възраст">
          <input name="age_max" value={form.age_max} onChange={onChange} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Тип упражнение">
          <select name="type_of_drill" value={form.type_of_drill} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.типУпражнение.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <SectionTitle>Етикети (за генератора)</SectionTitle>
      <div style={{ display: "grid", gap: 12 }}>
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
      </div>

      <SectionTitle>Методика</SectionTitle>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Подготовка / подредба">
          <textarea name="setup" value={form.setup} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Инструкции">
          <textarea name="instructions" value={form.instructions} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Ключови треньорски насоки">
          <textarea name="coaching_points" value={form.coaching_points} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Чести грешки">
          <textarea name="common_mistakes" value={form.common_mistakes} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Прогресии (надграждане)">
          <textarea name="progressions" value={form.progressions} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
        <Field label="Регресии (олекотяване)">
          <textarea name="regressions" value={form.regressions} onChange={onChange} rows={3} style={{ width: "100%", padding: 10 }} />
        </Field>
      </div>

      <SectionTitle>Медия</SectionTitle>
      <Row>
        <Field label="Линкове към изображения (по 1 на ред)">
          <textarea name="image_urls_text" value={form.image_urls_text} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
        </Field>

        <Field label="Линкове към видеа (по 1 на ред)">
          <textarea name="video_urls_text" value={form.video_urls_text} onChange={onChange} rows={4} style={{ width: "100%", padding: 10 }} />
        </Field>
      </Row>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Button
          onClick={save}
          disabled={saving}
        >
          {saving ? "Запазване…" : "Запази промените"}
        </Button>

        <Button
          onClick={() => navigate(-1)}
          disabled={saving}
          variant="secondary"
        >
          Назад
        </Button>
      </div>
    </div>
  );
}
