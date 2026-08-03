import { useState } from "react";

import { Button, Input } from "../ui";
import { resolveStaticUrl } from "../../utils/staticUrl";

function splitThreeNames(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    athlete_first_name: parts[0] || "",
    athlete_middle_name: parts[1] || "",
    athlete_last_name: parts.slice(2).join(" ") || "",
  };
}

/**
 * Жива Форма 0-3 / 0-3 А — оформление близо до официалната бланка.
 */
export default function CardingFormLiveForm({
  meta,
  initialFields,
  busy = false,
  error = "",
  onSubmit,
}) {
  const initial = initialFields || {};
  const [fields, setFields] = useState(() => ({
    parent1_full_name: initial.parent1_full_name || "",
    parent1_egn: initial.parent1_egn || "",
    parent2_full_name: initial.parent2_full_name || "",
    parent2_egn: initial.parent2_egn || "",
    athlete_full_name: [initial.athlete_first_name, initial.athlete_middle_name, initial.athlete_last_name]
      .filter(Boolean)
      .join(" "),
    athlete_egn: initial.athlete_egn || "",
    city: initial.city || "",
    rules_accepted: false,
    signature_parent1: "",
    signature_parent2: "",
    signature_athlete: "",
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
    const names = splitThreeNames(fields.athlete_full_name);
    const tokens = String(fields.athlete_full_name || "").trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 3) {
      setLocalError("Попълнете трите имена на състезателя (собствено, бащино и фамилия).");
      return;
    }
    const nameOk = (s) => s.length >= 3 && /[A-Za-zА-Яа-яЁёІіЇїЄє]/.test(s);
    if (!nameOk(names.athlete_first_name) || !nameOk(names.athlete_middle_name) || !nameOk(names.athlete_last_name)) {
      setLocalError("Всяко от трите имена трябва да е поне 3 символа и да съдържа букви.");
      return;
    }
    const p1 = String(fields.parent1_egn || "").replace(/\D/g, "");
    const ae = String(fields.athlete_egn || "").replace(/\D/g, "");
    if (p1.length !== 10 || ae.length !== 10) {
      setLocalError("ЕГН трябва да е 10 цифри.");
      return;
    }
    if (!String(fields.parent1_full_name || "").trim() || !String(fields.signature_parent1 || "").trim()) {
      setLocalError("Попълнете име и подпис на родител 1.");
      return;
    }
    const p2name = String(fields.parent2_full_name || "").trim();
    const p2egn = String(fields.parent2_egn || "").replace(/\D/g, "");
    if (!p2name || p2egn.length !== 10) {
      setLocalError("Попълнете трите имена и ЕГН на родител 2.");
      return;
    }
    if (!String(fields.signature_parent2 || "").trim()) {
      setLocalError("Подписът на родител 2 е задължителен.");
      return;
    }
    if (is03a && !String(fields.signature_athlete || "").trim()) {
      setLocalError("За Форма 0-3 А е нужен подпис на състезателя.");
      return;
    }
    await onSubmit?.({
      parent1_full_name: fields.parent1_full_name.trim(),
      parent1_egn: p1,
      parent2_full_name: p2name,
      parent2_egn: p2egn,
      athlete_first_name: names.athlete_first_name,
      athlete_middle_name: names.athlete_middle_name,
      athlete_last_name: names.athlete_last_name,
      athlete_egn: ae,
      city: String(fields.city || "").trim() || null,
      rules_accepted: true,
      signature_parent1: fields.signature_parent1.trim(),
      signature_parent2: fields.signature_parent2.trim(),
      signature_athlete: String(fields.signature_athlete || "").trim() || null,
    });
  };

  const nameEgnRow = (nameValue, onName, egnValue, onEgn, placeholder, required) => (
    <div className="cardingFormNameEgn">
      <label className="cardingFormField cardingFormField--grow">
        <span>(три имена)</span>
        <Input value={nameValue} onChange={onName} placeholder={placeholder} required={required} />
      </label>
      <label className="cardingFormField cardingFormField--egn">
        <span>ЕГН:</span>
        <Input value={egnValue} onChange={onEgn} placeholder="__________" inputMode="numeric" required={required} />
      </label>
    </div>
  );

  return (
    <form className="cardingFormSheet" onSubmit={handleSubmit}>
      <div className="cardingFormHeader">
        <img
          className="cardingFormLogo"
          src={
            meta?.bvf_logo_url
              ? resolveStaticUrl(meta.bvf_logo_url) || "/bfvb-logo.png"
              : "/bfvb-logo.png"
          }
          alt="БФВ"
          onError={(e) => {
            if (e.currentTarget.getAttribute("data-fallback") === "1") return;
            e.currentTarget.setAttribute("data-fallback", "1");
            e.currentTarget.src = "/bfvb-logo.png";
          }}
        />
        <div className="cardingFormHeaderCenter">
          <p className="cardingFormFedTitle">Българска федерация по Волейбол</p>
        </div>
        {meta?.club_logo_url ? (
          <img
            className="cardingFormLogo"
            src={resolveStaticUrl(meta.club_logo_url)}
            alt={meta.club_name || "Клуб"}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="cardingFormKindBadge">{kindLabel}</span>
        )}
      </div>
      <p className="cardingFormKindRight">{kindLabel}</p>
      <hr className="cardingFormRule" />

      <h2 className="cardingFormTitle">ЗАЯВЛЕНИЕ</h2>
      {displayError ? <p className="cardingFormError">{displayError}</p> : null}

      {is03a ? (
        <>
          <p className="cardingFormLead">Долуподписаният/ата:</p>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.athlete_full_name,
              (e) => setField("athlete_full_name", e.target.value),
              fields.athlete_egn,
              (e) => setField("athlete_egn", e.target.value),
              "три имена (състезател 14+)",
              true,
            )}
          </div>
          <p className="cardingFormLead">със съгласието на родителите/попечителите си:</p>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.parent1_full_name,
              (e) => setField("parent1_full_name", e.target.value),
              fields.parent1_egn,
              (e) => setField("parent1_egn", e.target.value),
              "три имена (родител 1)",
              true,
            )}
          </div>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.parent2_full_name,
              (e) => setField("parent2_full_name", e.target.value),
              fields.parent2_egn,
              (e) => setField("parent2_egn", e.target.value),
              "три имена (родител 2)",
              true,
            )}
          </div>
          <p className="cardingFormLead">с настоящото заявявам, че желая да бъда картотекиран/а в</p>
        </>
      ) : (
        <>
          <p className="cardingFormLead">Долуподписаните:</p>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.parent1_full_name,
              (e) => setField("parent1_full_name", e.target.value),
              fields.parent1_egn,
              (e) => setField("parent1_egn", e.target.value),
              "три имена (родител 1)",
              true,
            )}
          </div>
          <p className="cardingFormAnd">и</p>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.parent2_full_name,
              (e) => setField("parent2_full_name", e.target.value),
              fields.parent2_egn,
              (e) => setField("parent2_egn", e.target.value),
              "три имена (родител 2)",
              true,
            )}
          </div>
          <p className="cardingFormLead">родители/настойници на:</p>
          <div className="cardingFormBox">
            {nameEgnRow(
              fields.athlete_full_name,
              (e) => setField("athlete_full_name", e.target.value),
              fields.athlete_egn,
              (e) => setField("athlete_egn", e.target.value),
              "три имена (дете)",
              true,
            )}
          </div>
          <p className="cardingFormLead">с настоящото заявяваме, че желаем детето ни да бъде картотекирано в</p>
        </>
      )}

      <div className="cardingFormClubRow">
        <div className="cardingFormClubBox">{meta?.club_name || "—"}</div>
        <p className="cardingFormSeason">
          за сезон <strong>{meta?.season_label}</strong> г.
        </p>
      </div>

      <p className="cardingFormLegal">
        С подписване на настоящата форма /заявление декларирам, че съм запознат/а и се задължавам да
        спазвам устава, правилниците и наредбите на БФВ…
      </p>

      <label className="cardingFormCheck">
        <input
          type="checkbox"
          checked={fields.rules_accepted}
          onChange={(e) => setField("rules_accepted", e.target.checked)}
        />
        <span>Потвърждавам приемането на правилата на БФВ</span>
      </label>

      <div className="cardingFormMetaRow">
        <label className="cardingFormField">
          <span>Град:</span>
          <Input value={fields.city} onChange={(e) => setField("city", e.target.value)} placeholder="Град" />
        </label>
      </div>

      <p className="cardingFormSigLabel">
        {is03a ? "Състезател и родители/попечители:" : "Родители/настойници:"}
      </p>
      {is03a ? (
        <Input
          value={fields.signature_athlete}
          onChange={(e) => setField("signature_athlete", e.target.value)}
          placeholder="Подпис състезател"
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
        placeholder="Подпис родител 2"
        required
      />

      <Button type="submit" disabled={busy}>
        {busy ? "Запис…" : `Подпиши ${kindLabel}`}
      </Button>
    </form>
  );
}
