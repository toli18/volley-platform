import { useState } from "react";

import { Button, Input } from "../ui";
import { resolveStaticUrl } from "../../utils/staticUrl";

/**
 * Жива Форма 0-3 (<14) / 0-3 А (14+) за картотекиране.
 */
export default function CardingFormLiveForm({
  meta,
  initialFields,
  busy = false,
  error = "",
  onSubmit,
}) {
  const [fields, setFields] = useState(() => ({
    parent1_full_name: "",
    parent1_egn: "",
    parent2_full_name: "",
    parent2_egn: "",
    athlete_first_name: "",
    athlete_middle_name: "",
    athlete_last_name: "",
    athlete_egn: "",
    city: "",
    rules_accepted: false,
    signature_parent1: "",
    signature_parent2: "",
    signature_athlete: "",
    ...(initialFields || {}),
  }));
  const [localError, setLocalError] = useState("");

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const displayError = error || localError;
  const is03a = meta?.form_kind === "03a";
  const kindLabel = is03a ? "Форма 0-3 А" : "Форма 0-3";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!fields.rules_accepted) {
      setLocalError("Моля, потвърдете, че приемате устава и наредбите на БФВ.");
      return;
    }
    const p1 = String(fields.parent1_egn || "").replace(/\D/g, "");
    const ae = String(fields.athlete_egn || "").replace(/\D/g, "");
    if (p1.length !== 10 || ae.length !== 10) {
      setLocalError("ЕГН трябва да е 10 цифри.");
      return;
    }
    const nameOk = (s) => String(s || "").trim().length >= 3 && /[A-Za-zА-Яа-яЁёІіЇїЄє]/.test(s);
    if (!nameOk(fields.athlete_first_name) || !nameOk(fields.athlete_middle_name) || !nameOk(fields.athlete_last_name)) {
      setLocalError("Попълнете трите имена на състезателя (собствено, бащино, фамилия).");
      return;
    }
    if (!String(fields.parent1_full_name || "").trim() || !String(fields.signature_parent1 || "").trim()) {
      setLocalError("Попълнете име и подпис на родител 1.");
      return;
    }
    const p2name = String(fields.parent2_full_name || "").trim();
    const p2egn = String(fields.parent2_egn || "").replace(/\D/g, "");
    if (p2name && p2egn.length !== 10) {
      setLocalError("ЕГН на родител 2 трябва да е 10 цифри (или оставете празно).");
      return;
    }
    if (is03a && !String(fields.signature_athlete || "").trim()) {
      setLocalError("За Форма 0-3 А е нужен подпис на състезателя.");
      return;
    }
    await onSubmit?.({
      parent1_full_name: fields.parent1_full_name.trim(),
      parent1_egn: p1,
      parent2_full_name: p2name || null,
      parent2_egn: p2egn || null,
      athlete_first_name: String(fields.athlete_first_name).trim(),
      athlete_middle_name: String(fields.athlete_middle_name).trim(),
      athlete_last_name: String(fields.athlete_last_name).trim(),
      athlete_egn: ae,
      city: String(fields.city || "").trim() || null,
      rules_accepted: true,
      signature_parent1: fields.signature_parent1.trim(),
      signature_parent2: String(fields.signature_parent2 || "").trim() || null,
      signature_athlete: String(fields.signature_athlete || "").trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <img
          src={resolveStaticUrl(meta?.bvf_logo_url) || "/bfvb-logo.png"}
          alt="БФВ"
          style={{ width: 44, height: 44, objectFit: "contain" }}
        />
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Българска федерация по Волейбол</p>
          <p style={{ margin: "4px 0 0", fontWeight: 800 }}>{kindLabel}</p>
        </div>
        {meta?.club_logo_url ? (
          <img
            src={resolveStaticUrl(meta.club_logo_url)}
            alt={meta.club_name || "Клуб"}
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700 }}>{kindLabel}</span>
        )}
      </div>

      <p style={{ margin: 0, textAlign: "center", fontWeight: 800, fontSize: 18 }}>ЗАЯВЛЕНИЕ</p>
      <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
        Сезон <strong>{meta?.season_label}</strong> · {meta?.club_name}
      </p>
      <p style={{ margin: 0, fontSize: 13 }}>
        {is03a
          ? "Състезателят (14+) заявява желание за картотекиране със съгласие на родител."
          : "Родителите заявяват желание детето да бъде картотекирано в клуба."}
      </p>

      {displayError ? <p style={{ color: "#b91c1c", margin: 0 }}>{displayError}</p> : null}

      {!is03a ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>Родител / настойник 1</p>
          <Input
            value={fields.parent1_full_name}
            onChange={(e) => setField("parent1_full_name", e.target.value)}
            placeholder="Три имена"
            required
          />
          <Input
            value={fields.parent1_egn}
            onChange={(e) => setField("parent1_egn", e.target.value)}
            placeholder="ЕГН"
            inputMode="numeric"
            required
          />
          <p style={{ margin: 0, fontWeight: 700 }}>Родител 2 (по желание)</p>
          <Input
            value={fields.parent2_full_name}
            onChange={(e) => setField("parent2_full_name", e.target.value)}
            placeholder="Три имена"
          />
          <Input
            value={fields.parent2_egn}
            onChange={(e) => setField("parent2_egn", e.target.value)}
            placeholder="ЕГН"
            inputMode="numeric"
          />
          <p style={{ margin: 0, fontWeight: 700 }}>Състезател (дете)</p>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>Състезател (14+)</p>
        </>
      )}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Input
          value={fields.athlete_first_name}
          onChange={(e) => setField("athlete_first_name", e.target.value)}
          placeholder="Собствено"
          required
        />
        <Input
          value={fields.athlete_middle_name}
          onChange={(e) => setField("athlete_middle_name", e.target.value)}
          placeholder="Бащино"
          required
        />
        <Input
          value={fields.athlete_last_name}
          onChange={(e) => setField("athlete_last_name", e.target.value)}
          placeholder="Фамилия"
          required
        />
      </div>
      <Input
        value={fields.athlete_egn}
        onChange={(e) => setField("athlete_egn", e.target.value)}
        placeholder="ЕГН на състезателя"
        inputMode="numeric"
        required
      />

      {is03a ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>Родител / попечител 1</p>
          <Input
            value={fields.parent1_full_name}
            onChange={(e) => setField("parent1_full_name", e.target.value)}
            placeholder="Три имена"
            required
          />
          <Input
            value={fields.parent1_egn}
            onChange={(e) => setField("parent1_egn", e.target.value)}
            placeholder="ЕГН"
            inputMode="numeric"
            required
          />
          <p style={{ margin: 0, fontWeight: 700 }}>Родител 2 (по желание)</p>
          <Input
            value={fields.parent2_full_name}
            onChange={(e) => setField("parent2_full_name", e.target.value)}
            placeholder="Три имена"
          />
          <Input
            value={fields.parent2_egn}
            onChange={(e) => setField("parent2_egn", e.target.value)}
            placeholder="ЕГН"
            inputMode="numeric"
          />
        </>
      ) : null}

      <Input
        value={fields.city}
        onChange={(e) => setField("city", e.target.value)}
        placeholder="Град"
      />

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={fields.rules_accepted}
          onChange={(e) => setField("rules_accepted", e.target.checked)}
        />
        <span>
          Запознат/а съм и се задължавам да спазвам устава, правилниците и наредбите на БФВ.
        </span>
      </label>

      {is03a ? (
        <Input
          value={fields.signature_athlete}
          onChange={(e) => setField("signature_athlete", e.target.value)}
          placeholder="Подпис състезател (три имена)"
          required
        />
      ) : null}
      <Input
        value={fields.signature_parent1}
        onChange={(e) => setField("signature_parent1", e.target.value)}
        placeholder="Подпис родител 1"
        required
      />
      <Input
        value={fields.signature_parent2}
        onChange={(e) => setField("signature_parent2", e.target.value)}
        placeholder="Подпис родител 2 (по желание)"
      />

      <Button type="submit" disabled={busy}>
        {busy ? "Запис…" : `Подпиши ${kindLabel}`}
      </Button>
    </form>
  );
}
