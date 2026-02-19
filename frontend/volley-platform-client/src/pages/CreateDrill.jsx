import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../utils/apiClient";
import { normalizeDrillPayload, validateGeneratorMinimums } from "../utils/drillCanonical";

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

// Подредени стойности за падащи менюта (можеш да ги донастроиш)
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
  типУпражнение: [
    "Индивидуално",
    "По двойки",
    "Групово",
    "Отборно",
    "Игра 6:6",
    "Ситуативно",
    "Друго",
  ],
  фокусУмение: ["Сервис", "Посрещане", "Разпределяне", "Нападение", "Блокада", "Защита", "Преход", "Комуникация", "Координация", "Общо"],
  играчиОпции: ["Индивидуално", "По двойки", "3v3", "4v4", "5v5", "6v6", "Смесени групи"],
  оборудванеОпции: ["Без уреди", "Топки", "Конуси", "Ластици", "Маркировка", "Мрежа", "Стена", "Смесено"],

  // Отметки (таг групи)
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
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
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
        <input
          value={otherValue || ""}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="напр. Подавач, Комбинации, 6:6"
          style={{ width: "100%", padding: 10 }}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Разделяй със запетаи.</div>
      </div>
    </div>
  );
}

export default function CreateDrill() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
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

    // тагове
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

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const payload = useMemo(() => {
    const extraSkillDomains = splitCommaList(form.other_skill_domains);
    const extraGamePhases = splitCommaList(form.other_game_phases);
    const extraTactical = splitCommaList(form.other_tactical_focus);
    const extraTechnical = splitCommaList(form.other_technical_focus);
    const extraPosition = splitCommaList(form.other_position_focus);
    const extraZone = splitCommaList(form.other_zone_focus);

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

      // тагове като масиви
      skill_domains: mergeUnique(form.skill_domains, extraSkillDomains),
      game_phases: mergeUnique(form.game_phases, extraGamePhases),
      tactical_focus: mergeUnique(form.tactical_focus, extraTactical),
      technical_focus: mergeUnique(form.technical_focus, extraTechnical),
      position_focus: mergeUnique(form.position_focus, extraPosition),
      zone_focus: mergeUnique(form.zone_focus, extraZone),

      // методика
      setup: form.setup.trim() || null,
      instructions: form.instructions.trim() || null,
      coaching_points: form.coaching_points.trim() || null,
      common_mistakes: form.common_mistakes.trim() || null,
      progressions: form.progressions.trim() || null,
      regressions: form.regressions.trim() || null,

      // медия
      image_urls: linesToList(form.image_urls_text),
      video_urls: linesToList(form.video_urls_text),
    };
  }, [form]);

  const submit = async () => {
    setError("");
    if (!form.title.trim()) {
      setError("Моля, въведи име на упражнението.");
      return;
    }

    try {
      setSubmitting(true);
      const normalized = normalizeDrillPayload(payload);
      const missing = validateGeneratorMinimums(normalized);
      if (missing.length > 0) {
        setError(`Липсват задължителни полета за генератора: ${missing.join(", ")}.`);
        setSubmitting(false);
        return;
      }

      // Треньор изпраща за одобрение (pending)
      // Твоят backend приема POST /drills
      await axiosInstance.post("/drills", normalized);

      alert("Упражнението е изпратено за одобрение.");
      navigate("/my-drills");
    } catch (e) {
      setError(normalizeFastApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/drills">← Назад към упражненията</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>Добави упражнение (подробно)</h2>

      {error ? (
        <div style={{ background: "#ffdddd", padding: 10, borderRadius: 8, color: "#a00", marginBottom: 12 }}>
          Грешка: {error}
        </div>
      ) : null}

      <SectionTitle>Основни</SectionTitle>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Име *">
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
            placeholder="напр. „Посрещане в тройки“"
          />
        </Field>

        <Field label="Цел">
          <textarea
            name="goal"
            value={form.goal}
            onChange={onChange}
            rows={2}
            style={{ width: "100%", padding: 10 }}
            placeholder="Какво точно развива упражнението?"
          />
        </Field>

        <Field label="Описание">
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            style={{ width: "100%", padding: 10 }}
            placeholder="Подробно описание на организацията и задачите."
          />
        </Field>

        <Field label="Вариации">
          <textarea
            name="variations"
            value={form.variations}
            onChange={onChange}
            rows={3}
            style={{ width: "100%", padding: 10 }}
            placeholder="Възможни промени/надграждания на упражнението."
          />
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
        <select name="skill_focus" value={form.skill_focus} onChange={onChange} style={{ width: "100%", padding: 10 }}>
          <option value="">— Избери —</option>
          {OPTIONS.фокусУмение.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Field>

      <SectionTitle>Организация и метрики</SectionTitle>
      <Row>
        <Field label="Играчи">
          <select name="players" value={form.players} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.играчиОпции.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Оборудване">
          <select name="equipment" value={form.equipment} onChange={onChange} style={{ width: "100%", padding: 10 }}>
            <option value="">— Избери —</option>
            {OPTIONS.оборудванеОпции.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <Row cols={3}>
        <Field label="RPE (0–10)" hint="Субективна трудност на натоварването.">
          <input name="rpe" value={form.rpe} onChange={onChange} style={{ width: "100%", padding: 10 }} placeholder="напр. 6" />
        </Field>
        <Field label="Продължителност (мин) – минимум">
          <input
            name="duration_min"
            value={form.duration_min}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
            placeholder="напр. 8"
          />
        </Field>
        <Field label="Продължителност (мин) – максимум">
          <input
            name="duration_max"
            value={form.duration_max}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
            placeholder="напр. 12"
          />
        </Field>
      </Row>

      <SectionTitle>Интелигентни полета (за генератора)</SectionTitle>
      <Row>
        <Field label="Тип интензивност">
          <select
            name="intensity_type"
            value={form.intensity_type}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="">— Избери —</option>
            {OPTIONS.типИнтензивност.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Основна цел на тренировка">
          <select
            name="training_goal"
            value={form.training_goal}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
          >
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
          <select
            name="complexity_level"
            value={form.complexity_level}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
          >
            <option value="">— Избери —</option>
            {OPTIONS.нивоСложност.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ниво на вземане на решения">
          <select
            name="decision_level"
            value={form.decision_level}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
          >
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
          <input name="age_min" value={form.age_min} onChange={onChange} style={{ width: "100%", padding: 10 }} placeholder="напр. 10" />
        </Field>
        <Field label="Максимална възраст">
          <input name="age_max" value={form.age_max} onChange={onChange} style={{ width: "100%", padding: 10 }} placeholder="напр. 18" />
        </Field>
        <Field label="Тип упражнение">
          <select
            name="type_of_drill"
            value={form.type_of_drill}
            onChange={onChange}
            style={{ width: "100%", padding: 10 }}
          >
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
          <textarea
            name="coaching_points"
            value={form.coaching_points}
            onChange={onChange}
            rows={3}
            style={{ width: "100%", padding: 10 }}
          />
        </Field>
        <Field label="Чести грешки">
          <textarea
            name="common_mistakes"
            value={form.common_mistakes}
            onChange={onChange}
            rows={3}
            style={{ width: "100%", padding: 10 }}
          />
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
          <textarea
            name="image_urls_text"
            value={form.image_urls_text}
            onChange={onChange}
            rows={4}
            style={{ width: "100%", padding: 10 }}
            placeholder="https://...jpg"
          />
        </Field>

        <Field label="Линкове към видеа (по 1 на ред)">
          <textarea
            name="video_urls_text"
            value={form.video_urls_text}
            onChange={onChange}
            rows={4}
            style={{ width: "100%", padding: 10 }}
            placeholder="https://youtube.com/..."
          />
        </Field>
      </Row>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={submit}
          disabled={submitting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#0b66c3",
            color: "white",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Изпращане…" : "Изпрати за одобрение"}
        </button>

        <button
          onClick={() => navigate(-1)}
          disabled={submitting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "white",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          Назад
        </button>
      </div>
    </div>
  );
}
