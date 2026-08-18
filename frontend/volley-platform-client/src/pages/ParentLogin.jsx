import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { parentPortalPath, setParentToken } from "../utils/parentAuth";
import { teamRoomLoginPath } from "../utils/teamRoomAuth";
import {
  clearRememberedLogin,
  loadRememberedLogin,
  saveRememberedLogin,
} from "../utils/portalLoginRemember";
import { Button, Card, Input } from "../components/ui";
import LoginIntro from "../components/auth/LoginIntro";
import BrandTriLine from "../components/shared/BrandTriLine";
import PlatformBrandTitle from "../components/shared/PlatformBrandTitle";

function ParentLoginShell({ children }) {
  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img src="/bfvb-logo.png" alt="БФВ" className="parentPortalLogo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div>
            <div className="parentPortalBrand">
              <PlatformBrandTitle />
            </div>
            <div className="parentPortalBrandSub">Единна общност на треньорите в България</div>
            <BrandTriLine className="brandTriLine--portal" />
          </div>
        </div>
      </header>
      <main className="parentPortalMain">{children}</main>
      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}

export default function ParentLogin() {
  const navigate = useNavigate();
  const remembered = loadRememberedLogin("parent");
  const [phone, setPhone] = useState(remembered.phone);
  const [birthYear, setBirthYear] = useState(remembered.birthYear);
  const [remember, setRemember] = useState(remembered.remember);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState(null);

  const submit = async (athleteId = null) => {
    const parent_phone = phone.trim();
    const year = Number(birthYear);
    if (!parent_phone || !Number.isFinite(year) || year < 1990 || year > 2025) {
      setError("Въведете телефон и година на раждане на детето (4 цифри).");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const body = { parent_phone, birth_year: year };
      if (athleteId != null) body.athlete_id = athleteId;
      const res = await axiosInstance.post(API_PATHS.PARENT_AUTH_LOGIN, body);
      const data = res.data || {};
      if (data.needs_selection && Array.isArray(data.candidates) && data.candidates.length) {
        setCandidates(data.candidates);
        return;
      }
      if (!data.access_token) {
        setError("Входът не успя. Проверете данните или се свържете с треньора.");
        return;
      }
      if (remember) saveRememberedLogin("parent", { phone: parent_phone, birthYear: String(year) });
      else clearRememberedLogin("parent");
      setParentToken(data.access_token);
      navigate(parentPortalPath(), { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Невалиден телефон или година на раждане.");
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ParentLoginShell>
      <LoginIntro />
      <div className="parentPortalPage parentLoginPage">
        <header className="parentPortalHero">
          <h1 className="parentPortalHeroTitle">Родителски профил</h1>
          <p className="parentPortalHeroSub">Вход с телефон и година на раждане на детето</p>
        </header>

        <Card title="Вход">
          {!candidates ? (
            <form
              className="parentLoginForm"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="uiLabel" htmlFor="parent-phone">
                Телефон на родител
              </label>
              <Input
                id="parent-phone"
                type="tel"
                autoComplete="tel"
                placeholder="0888 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <label className="uiLabel" htmlFor="parent-birth-year" style={{ marginTop: 12 }}>
                Година на раждане на детето
              </label>
              <Input
                id="parent-birth-year"
                type="number"
                inputMode="numeric"
                min={1990}
                max={2025}
                placeholder="напр. 2012"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />
              <p className="uiHint parentLoginHint">
                Използвайте телефона и годината на раждане, записани при клуба. Телефонът трябва да съвпада с данните при състезателя.
              </p>

              <label className="parentLoginRemember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setRemember(on);
                    if (!on) clearRememberedLogin("parent");
                  }}
                />
                <span>Запомни профила на това устройство</span>
              </label>

              {error ? <p className="uiErrorText">{error}</p> : null}

              <Button type="submit" disabled={busy} style={{ marginTop: 14 }}>
                {busy ? "Влизане..." : "Вход"}
              </Button>
            </form>
          ) : (
            <div className="parentLoginSelect">
              <p className="uiHint">Намерени са няколко деца с тези данни. Изберете отбор:</p>
              <div className="parentLoginCandidateList">
                {candidates.map((c) => (
                  <button
                    key={c.athlete_id}
                    type="button"
                    className="parentLoginCandidateBtn"
                    disabled={busy}
                    onClick={() => submit(c.athlete_id)}
                  >
                    <span className="parentLoginCandidateName">{c.athlete_name}</span>
                    {c.teams?.length ? (
                      <span className="parentLoginCandidateTeams">{c.teams.join(", ")}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                style={{ marginTop: 12 }}
                onClick={() => {
                  setCandidates(null);
                  setError("");
                }}
              >
                Назад
              </Button>
              {error ? <p className="uiErrorText">{error}</p> : null}
            </div>
          )}
        </Card>

        <p className="parentLoginAltLink">
          Отборна стая за състезател?{" "}
          <Link to={teamRoomLoginPath()} className="parentLoginAltLinkA">
            Вход в отборната стая
          </Link>
        </p>
      </div>
    </ParentLoginShell>
  );
}
