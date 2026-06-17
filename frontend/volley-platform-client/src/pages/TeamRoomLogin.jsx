import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { parentLoginPath } from "../utils/parentAuth";
import { setTeamRoomToken, teamRoomPortalPath } from "../utils/teamRoomAuth";
import { Button, Card, Input } from "../components/ui";
import LoginIntro from "../components/auth/LoginIntro";

function TeamRoomLoginShell({ children }) {
  return (
    <div className="teamRoomShell teamRoomShell--login">
      <header className="teamRoomLoginHeader">
        <img src="/bfvb-logo.png" alt="БФВ" className="teamRoomLoginLogo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <div>
          <div className="teamRoomLoginBrand">Отборна стая</div>
          <div className="teamRoomLoginBrandSub">Българска федерация по волейбол</div>
        </div>
      </header>
      <main className="teamRoomMain teamRoomMain--login">{children}</main>
    </div>
  );
}

export default function TeamRoomLogin() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState(null);

  const submit = async (athleteId = null) => {
    const parent_phone = phone.trim();
    const year = Number(birthYear);
    if (!parent_phone || !Number.isFinite(year) || year < 1990 || year > 2025) {
      setError("Въведете телефон и година на раждане (4 цифри).");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const body = { parent_phone, birth_year: year };
      if (athleteId != null) body.athlete_id = athleteId;
      const res = await axiosInstance.post(API_PATHS.ATHLETE_ROOM_AUTH_LOGIN, body);
      const data = res.data || {};
      if (data.needs_selection && Array.isArray(data.candidates) && data.candidates.length) {
        setCandidates(data.candidates);
        return;
      }
      if (!data.access_token) {
        setError("Входът не успя. Проверете данните или се свържете с треньора.");
        return;
      }
      setTeamRoomToken(data.access_token);
      navigate(teamRoomPortalPath(), { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Невалиден телефон или година на раждане.");
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TeamRoomLoginShell>
      <LoginIntro visibleMs={1800} fadeMs={600} />
      <div className="teamRoomLoginPage">
        <header className="teamRoomHero">
          <h1 className="teamRoomHeroTitle">Вход в отборната стая</h1>
          <p className="teamRoomHeroSub">Телефон на родител и година на раждане на състезателя</p>
        </header>

        <Card title="Вход" className="teamRoomLoginCard">
          {!candidates ? (
            <form
              className="parentLoginForm"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="uiLabel" htmlFor="room-phone">
                Телефон на родител
              </label>
              <Input
                id="room-phone"
                type="tel"
                autoComplete="tel"
                placeholder="0888 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <label className="uiLabel" htmlFor="room-birth-year" style={{ marginTop: 12 }}>
                Година на раждане
              </label>
              <Input
                id="room-birth-year"
                type="number"
                inputMode="numeric"
                min={1990}
                max={2025}
                placeholder="напр. 2012"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />

              {error ? <p className="uiErrorText">{error}</p> : null}

              <Button type="submit" disabled={busy} className="teamRoomPrimaryBtn" style={{ marginTop: 14 }}>
                {busy ? "Влизане..." : "Вход"}
              </Button>
            </form>
          ) : (
            <div className="parentLoginSelect">
              <p className="uiHint">Изберете профил:</p>
              <div className="parentLoginCandidateList">
                {candidates.map((c) => (
                  <button
                    key={c.athlete_id}
                    type="button"
                    className="teamRoomCandidateBtn"
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

        <p className="teamRoomAltLogin">
          Родителски профил?{" "}
          <Link to={parentLoginPath()} className="teamRoomAltLoginLink">
            Вход за родители
          </Link>
        </p>
      </div>
    </TeamRoomLoginShell>
  );
}
