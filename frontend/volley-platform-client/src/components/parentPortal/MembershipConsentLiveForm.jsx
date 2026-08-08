import { useState } from "react";

import { Button, Input } from "../ui";
import { resolveStaticUrl } from "../../utils/staticUrl";

const EMPTY_FIELDS = {
  parent_full_name: "",
  parent_egn: "",
  parent_address: "",
  parent_phone: "",
  child_first_name: "",
  child_middle_name: "",
  child_last_name: "",
  child_egn: "",
  child_place_of_birth: "",
  child_address: "",
  child_phone: "",
  gdpr_accepted: false,
  signature_name: "",
};

/**
 * Жива уеб форма за клубно заявление — същият UI за родител и за демо в Админ БФВ.
 *
 * mode="live"  → реален submit (onSubmit)
 * mode="demo"  → попълва се, но не записва (onDemoSubmit optional)
 */
export default function MembershipConsentLiveForm({
  mode = "live",
  meta,
  initialFields,
  busy = false,
  error = "",
  onSubmit,
  onDemoSubmit,
  introText = "Преди да ползвате портала е необходимо да попълните и подпишете заявлението към клуба.",
}) {
  const [fields, setFields] = useState(() => ({ ...EMPTY_FIELDS, ...(initialFields || {}) }));
  const [localError, setLocalError] = useState("");

  const setField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const isDemo = mode === "demo";
  const displayError = error || localError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    if (!fields.gdpr_accepted) {
      setLocalError("Моля, потвърдете съгласието за обработка на личните данни.");
      return;
    }
    const parentEgn = String(fields.parent_egn || "").replace(/\D/g, "");
    const childEgn = String(fields.child_egn || "").replace(/\D/g, "");
    if (parentEgn.length !== 10 || childEgn.length !== 10) {
      setLocalError("ЕГН трябва да е 10 цифри.");
      return;
    }
    const first = String(fields.child_first_name || "").trim();
    const middle = String(fields.child_middle_name || "").trim();
    const last = String(fields.child_last_name || "").trim();
    const nameOk = (s) => s.length >= 3 && /[A-Za-zА-Яа-яЁёІіЇїЄє]/.test(s);
    if (!first || !middle || !last) {
      setLocalError("Попълнете трите имена на състезателя (собствено, бащино и фамилия). Без бащино име заявлението не се приема.");
      return;
    }
    if (!nameOk(first) || !nameOk(middle) || !nameOk(last)) {
      setLocalError("Всяко от трите имена трябва да е поне 3 символа и да съдържа букви.");
      return;
    }
    const composedTokens = `${first} ${middle} ${last}`.split(/\s+/).filter(Boolean);
    if (composedTokens.length < 3) {
      setLocalError("Трите имена на състезателя са задължителни (собствено, бащино и фамилия).");
      return;
    }
    const place = String(fields.child_place_of_birth || "").trim();
    if (place.length < 2) {
      setLocalError("Градът на раждане е задължителен.");
      return;
    }
    if (place.length > 25) {
      setLocalError("Градът на раждане е твърде дълъг (макс. 25 символа).");
      return;
    }
    const payload = {
      ...fields,
      child_first_name: first,
      child_middle_name: middle,
      child_last_name: last,
      child_place_of_birth: place,
      parent_egn: parentEgn,
      child_egn: childEgn,
    };
    if (isDemo) {
      onDemoSubmit?.(payload);
      return;
    }
    await onSubmit?.(payload);
  };

  return (
    <div className={`membershipConsentSheet${isDemo ? " membershipConsentSheet--demo" : ""}`}>
      {isDemo ? (
        <p className="membershipConsentDemoBanner">
          Демо: попълни полетата както родителят. Тук не се записва нищо — само преглед на живата форма.
        </p>
      ) : introText ? (
        <p className="membershipConsentIntro">{introText}</p>
      ) : null}

      <form className="membershipConsentForm" onSubmit={handleSubmit}>
        <div className="membershipConsentLogoRow">
          {meta?.bvf_logo_url ? (
            <img
              className="membershipConsentLogo"
              src={resolveStaticUrl(meta.bvf_logo_url) || "/bfvb-logo.png"}
              alt="БФВ"
              onError={(e) => {
                e.currentTarget.src = "/bfvb-logo.png";
              }}
            />
          ) : (
            <img className="membershipConsentLogo" src="/bfvb-logo.png" alt="БФВ" />
          )}
          <div className="membershipConsentLogoSpacer" />
          {meta?.club_logo_url ? (
            <img
              className="membershipConsentLogo"
              src={resolveStaticUrl(meta.club_logo_url)}
              alt={meta.club_name || "Клуб"}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="membershipConsentLogoPlaceholder">Клуб</span>
          )}
        </div>
        <h2 className="membershipConsentTitle">ЗАЯВЛЕНИЕ</h2>
        {meta?.addressee ? <p className="membershipConsentAddressee">{meta.addressee}</p> : null}

        <section className="membershipConsentBlock">
          <h3 className="membershipConsentBlockTitle">От родителя / настойника</h3>
          <div className="membershipConsentGrid">
            <label className="membershipConsentField membershipConsentField--full">
              <span>Три имена</span>
              <Input
                required
                autoComplete="name"
                value={fields.parent_full_name}
                onChange={(e) => setField("parent_full_name", e.target.value)}
                placeholder="Име Презиме Фамилия"
              />
            </label>
            <label className="membershipConsentField">
              <span>ЕГН</span>
              <Input
                required
                inputMode="numeric"
                maxLength={10}
                value={fields.parent_egn}
                onChange={(e) => setField("parent_egn", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 цифри"
              />
            </label>
            <label className="membershipConsentField">
              <span>Телефон</span>
              <Input
                required
                inputMode="tel"
                autoComplete="tel"
                value={fields.parent_phone}
                onChange={(e) => setField("parent_phone", e.target.value)}
                placeholder="08xxxxxxxx"
              />
            </label>
            <label className="membershipConsentField membershipConsentField--full">
              <span>Адрес</span>
              <Input
                required
                autoComplete="street-address"
                value={fields.parent_address}
                onChange={(e) => setField("parent_address", e.target.value)}
                placeholder="гр./с., ул., №"
              />
            </label>
          </div>
        </section>

        <p className="membershipConsentBridge">в качеството си на родител / настойник на сина / дъщеря ми</p>

        <section className="membershipConsentBlock">
          <h3 className="membershipConsentBlockTitle">Данни на детето / състезателя</h3>
          <p className="uiMuted" style={{ margin: "0 0 10px", fontSize: 13 }}>
            Задължителни са <strong>трите имена</strong> — собствено, бащино и фамилия. Без бащино име заявлението не се приема.
          </p>
          <div className="membershipConsentGrid">
            <label className="membershipConsentField membershipConsentField--full">
              <span>Собствено име *</span>
              <Input
                required
                minLength={3}
                maxLength={25}
                value={fields.child_first_name}
                onChange={(e) => setField("child_first_name", e.target.value)}
                placeholder="напр. Иван"
                autoComplete="given-name"
              />
            </label>
            <label className="membershipConsentField membershipConsentField--full">
              <span>Бащино име *</span>
              <Input
                required
                minLength={3}
                maxLength={25}
                value={fields.child_middle_name}
                onChange={(e) => setField("child_middle_name", e.target.value)}
                placeholder="напр. Петров"
              />
            </label>
            <label className="membershipConsentField membershipConsentField--full">
              <span>Фамилия *</span>
              <Input
                required
                minLength={3}
                maxLength={25}
                value={fields.child_last_name}
                onChange={(e) => setField("child_last_name", e.target.value)}
                placeholder="напр. Иванов"
                autoComplete="family-name"
              />
            </label>
            <label className="membershipConsentField">
              <span>ЕГН *</span>
              <Input
                required
                inputMode="numeric"
                maxLength={10}
                value={fields.child_egn}
                onChange={(e) => setField("child_egn", e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 цифри"
              />
            </label>
            <label className="membershipConsentField">
              <span>Град на раждане *</span>
              <Input
                required
                minLength={2}
                maxLength={25}
                value={fields.child_place_of_birth}
                onChange={(e) => {
                  const place = e.target.value;
                  setFields((prev) => ({
                    ...prev,
                    child_place_of_birth: place,
                    // Националността се записва на състезателя от града (България по подразбиране).
                  }));
                }}
                placeholder="напр. София"
                autoComplete="address-level2"
              />
              {String(fields.child_place_of_birth || "").trim() ? (
                <span className="uiMuted" style={{ fontSize: 12 }}>
                  Националност: България (попълва се автоматично от града)
                </span>
              ) : null}
            </label>
            <label className="membershipConsentField">
              <span>Телефон (по желание)</span>
              <Input
                inputMode="tel"
                value={fields.child_phone}
                onChange={(e) => setField("child_phone", e.target.value)}
              />
            </label>
            <label className="membershipConsentField membershipConsentField--full">
              <span>Адрес (по желание)</span>
              <Input value={fields.child_address} onChange={(e) => setField("child_address", e.target.value)} />
            </label>
          </div>
        </section>

        {meta?.body_text ? (
          <section className="membershipConsentTextBlock">
            <h3 className="membershipConsentBlockTitle">Декларация</h3>
            <div className="membershipConsentProse">{meta.body_text}</div>
          </section>
        ) : null}

        {meta?.gdpr_text ? (
          <section className="membershipConsentTextBlock">
            <h3 className="membershipConsentBlockTitle">Лични данни</h3>
            <div className="membershipConsentProse membershipConsentProse--scroll">{meta.gdpr_text}</div>
          </section>
        ) : null}

        <label className="membershipConsentCheck">
          <input
            type="checkbox"
            checked={fields.gdpr_accepted}
            onChange={(e) => setField("gdpr_accepted", e.target.checked)}
          />
          <span>Съгласен/на съм с обработката на личните данни, описана по-горе.</span>
        </label>

        <div className="membershipConsentSignRow">
          <label className="membershipConsentField membershipConsentField--full">
            <span>Подпис (име и фамилия, както в личната карта)</span>
            <Input
              required
              value={fields.signature_name}
              onChange={(e) => setField("signature_name", e.target.value)}
              placeholder="Напр. Иван Петров"
            />
          </label>
          <p className="membershipConsentDateHint">
            Датата се записва автоматично при подпис:{" "}
            <strong>{new Date().toLocaleDateString("bg-BG")}</strong>
          </p>
        </div>

        {displayError ? <p className="membershipConsentError">{displayError}</p> : null}

        <div className="membershipConsentActions">
          <Button type="submit" disabled={busy} style={{ width: "100%", minHeight: 44 }}>
            {busy ? "Запис…" : isDemo ? "Симулирай подпис (без запис)" : "Подпиши заявлението"}
          </Button>
          {!isDemo ? (
            <p className="membershipConsentAfterHint">
              След подпис се генерира PDF и порталът се отключва веднага.
            </p>
          ) : (
            <p className="membershipConsentAfterHint">
              При реален подпис системата създава PDF в стила на бланката и го записва в Документи.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
