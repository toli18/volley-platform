import { Input } from "../ui";
import { DEFAULT_NATIONALITY } from "../../utils/athleteIdentity";

/**
 * Shared identity fields for create/edit athlete forms.
 * mode="minimal" — само полета за бързо създаване от треньор.
 * When identityLocked (linked to BVF), name/birth/city/nationality/gender/egn are read-only.
 */
export default function AthleteIdentityFields({
  form,
  setForm,
  identityLocked = false,
  showEgn = true,
  showLegacyNameHint = false,
  mode = "full",
}) {
  const patch = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const onPlaceChange = (value) => {
    setForm((p) => {
      const next = { ...p, place_of_birth: value };
      // При попълнен град → националност България (ако още няма друга изрична)
      if (value.trim()) {
        if (!p.nationality || p.nationality === DEFAULT_NATIONALITY || !(p.nationality || "").trim()) {
          next.nationality = DEFAULT_NATIONALITY;
        }
      }
      return next;
    });
  };

  if (mode === "minimal") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          Минимални данни за старт. Родителят попълва трите имена, ЕГН, град и дата чрез заявлението
          за прием. Ти добавяш снимка за СЕК.
        </p>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Собствено име *</span>
          <Input
            value={form.first_name}
            onChange={(e) => patch("first_name", e.target.value)}
            placeholder="мин. 3 символа"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Година на раждане *</span>
          <Input
            type="number"
            inputMode="numeric"
            value={form.birth_year}
            onChange={(e) => patch("birth_year", e.target.value)}
            placeholder="напр. 2013"
            min={1970}
            max={new Date().getFullYear()}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Пол *</span>
          <Input as="select" value={form.gender} onChange={(e) => patch("gender", e.target.value)}>
            <option value="">Избери</option>
            <option value="male">Мъж</option>
            <option value="female">Жена</option>
          </Input>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Телефон на родител *</span>
          <Input
            value={form.parent_phone}
            onChange={(e) => patch("parent_phone", e.target.value)}
            placeholder="за родителски вход"
            inputMode="tel"
          />
        </label>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {identityLocked ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          Идентичността е заключена след връзка с БФВ. Редактират се само контакти и бележки.
        </p>
      ) : null}

      {showLegacyNameHint && form.athlete_name && !form.first_name ? (
        <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
          Старо име в едно поле: <strong>{form.athlete_name}</strong> — раздели го на три полета по-долу.
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Собствено име *</span>
          <Input
            value={form.first_name}
            disabled={identityLocked}
            onChange={(e) => patch("first_name", e.target.value)}
            placeholder="мин. 3 символа"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Бащино име *</span>
          <Input
            value={form.middle_name}
            disabled={identityLocked}
            onChange={(e) => patch("middle_name", e.target.value)}
            placeholder="мин. 3 символа"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Фамилия *</span>
          <Input
            value={form.last_name}
            disabled={identityLocked}
            onChange={(e) => patch("last_name", e.target.value)}
            placeholder="мин. 3 символа"
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Дата на раждане *</span>
        <Input
          type="date"
          value={form.birth_date}
          disabled={identityLocked}
          onChange={(e) => patch("birth_date", e.target.value)}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Град на раждане *</span>
        <Input
          value={form.place_of_birth}
          disabled={identityLocked}
          onChange={(e) => onPlaceChange(e.target.value)}
          placeholder="напр. Троян"
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Националност</span>
        <Input
          value={form.nationality}
          disabled={identityLocked}
          onChange={(e) => patch("nationality", e.target.value)}
          placeholder={DEFAULT_NATIONALITY}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Пол *</span>
        <Input
          as="select"
          value={form.gender}
          disabled={identityLocked}
          onChange={(e) => patch("gender", e.target.value)}
        >
          <option value="">Избери</option>
          <option value="male">Мъж</option>
          <option value="female">Жена</option>
        </Input>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Състезателен номер (№ екип)</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={form.jersey_number ?? ""}
          onChange={(e) => patch("jersey_number", e.target.value)}
          placeholder="0–99 · уникален по пол в клуба"
        />
        <span className="uiMuted" style={{ fontSize: 11 }}>
          Попълва се в тимов лист и статистика. За конкретен мач може да се смени.
        </span>
      </label>

      {showEgn ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>ЕГН (за БФВ)</span>
          <Input
            value={form.egn || ""}
            disabled={identityLocked}
            onChange={(e) => patch("egn", e.target.value)}
            placeholder="по избор сега — задължително при картотекиране"
            maxLength={10}
          />
        </label>
      ) : null}

      <Input
        placeholder="Телефон на състезател"
        value={form.athlete_phone}
        onChange={(e) => patch("athlete_phone", e.target.value)}
      />
      <Input
        placeholder="Име на родител"
        value={form.parent_name}
        onChange={(e) => patch("parent_name", e.target.value)}
      />
      <Input
        placeholder="Телефон на родител"
        value={form.parent_phone}
        onChange={(e) => patch("parent_phone", e.target.value)}
      />
      <Input
        as="textarea"
        rows={2}
        placeholder="Бележка"
        value={form.notes}
        onChange={(e) => patch("notes", e.target.value)}
      />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={Boolean(form.is_active)}
          onChange={(e) => patch("is_active", e.target.checked)}
        />
        Активен състезател
      </label>
    </div>
  );
}
