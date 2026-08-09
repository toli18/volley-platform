import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";
import { resolveStaticUrl } from "../utils/staticUrl";
import { Button, Input } from "../components/ui";
import "./PublicClubPage.css";

const YEARS = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - 5 - i);

function formatBgDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("bg-BG", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

export default function PublicClubPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [teamId, setTeamId] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [slotKey, setSlotKey] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const [form, setForm] = useState({
    child_first_name: "",
    child_last_name: "",
    child_birth_year: String(YEARS[6] || 2015),
    child_gender: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    note: "",
    website: "",
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      setError("");
      setLogoFailed(false);
      try {
        const res = await axiosInstance.get(API_PATHS.PUBLIC_CLUB_PAGE(slug));
        if (!alive) return;
        setPage(res.data);
      } catch (err) {
        if (!alive) return;
        setError(normalizeError(err, "Страницата не е намерена или не е публична."));
        setPage(null);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!teamId || !slug) {
      setSlots([]);
      setSlotKey("");
      return;
    }
    let alive = true;
    (async () => {
      setSlotsBusy(true);
      try {
        const res = await axiosInstance.get(API_PATHS.PUBLIC_CLUB_UPCOMING_TRAININGS(slug, teamId), {
          params: { limit: 5 },
        });
        if (!alive) return;
        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        setSlots(items);
        setSlotKey(items[0]?.slot_key || "");
      } catch {
        if (!alive) return;
        setSlots([]);
        setSlotKey("");
      } finally {
        if (alive) setSlotsBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, teamId]);

  const selectedSlot = slots.find((s) => s.slot_key === slotKey) || null;
  const step = !teamId ? 1 : !selectedSlot ? 2 : 3;

  const submit = async (e) => {
    e.preventDefault();
    if (!teamId || !selectedSlot) {
      setDoneMsg("Избери група и тренировка за пробна.");
      return;
    }
    setSending(true);
    setDoneMsg("");
    try {
      const res = await axiosInstance.post(API_PATHS.PUBLIC_CLUB_ENROLL(slug), {
        ...form,
        child_birth_year: Number(form.child_birth_year),
        preferred_team_id: Number(teamId),
        trial_date: selectedSlot.date,
        trial_time: selectedSlot.start_time,
        trial_rule_id: selectedSlot.rule_id || null,
        child_gender: form.child_gender || null,
      });
      setDoneMsg(res.data?.message || "Заявката е изпратена.");
      setForm((p) => ({
        ...p,
        child_first_name: "",
        child_last_name: "",
        note: "",
        parent_phone: "",
        parent_email: "",
      }));
    } catch (err) {
      setDoneMsg(normalizeError(err, "Неуспешно изпращане."));
    } finally {
      setSending(false);
    }
  };

  if (busy) {
    return (
      <div className="publicClub">
        <p className="publicClub__muted">Зареждане…</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="publicClub">
        <h1>Клубна страница</h1>
        <p>{error || "Няма данни."}</p>
      </div>
    );
  }

  const coaches = page.coaches || [];
  const halls = page.halls || [];
  const hasAbout =
    Boolean(page.about) ||
    Boolean(page.contact_phone) ||
    Boolean(page.contact_email) ||
    Boolean(page.contact_name) ||
    Boolean(page.website_url) ||
    Boolean(page.city) ||
    Boolean(page.address) ||
    coaches.length > 0 ||
    halls.length > 0;
  const logoSrc = resolveStaticUrl(page.logo_url);

  return (
    <div className="publicClub">
      <div className="publicClub__top">
        <nav className="publicClub__nav" aria-label="Клубна страница">
          <a href="#zapisvane" className="is-cta">
            Записване
          </a>
          {hasAbout ? <a href="#za-kluba">За клуба</a> : null}
        </nav>
      </div>

      <section id="zapisvane" className="publicClub__first">
        <header className="publicClub__hero">
          {logoSrc && !logoFailed ? (
            <img
              className="publicClub__logo"
              src={logoSrc}
              alt=""
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="publicClub__logoFallback">{(page.name || "?").slice(0, 1)}</div>
          )}
          <div className="publicClub__heroText">
            <h1>{page.name}</h1>
            {page.tagline ? <p className="publicClub__tagline">{page.tagline}</p> : null}
          </div>
        </header>

        <div className="publicClub__enroll">
          <h2>Записване за пробна тренировка</h2>
          <p className="publicClub__sectionLead">
            Избери група по пол и години → виж следващите 5 тренировки → попълни данните.
            Треньорът получава известие.
          </p>

          <div className="publicClub__steps">
            <span className={`publicClub__step${step >= 1 ? " is-on" : ""}`}>1. Група</span>
            <span className={`publicClub__step${step >= 2 ? " is-on" : ""}`}>2. Тренировка</span>
            <span className={`publicClub__step${step >= 3 ? " is-on" : ""}`}>3. Данни</span>
          </div>

          <div className="publicClub__chips" style={{ marginBottom: 12 }}>
            {(page.teams || []).map((t) => {
              const label = t.hint || t.gender_label || t.name;
              const gender =
                String(t.gender || "").toLowerCase() === "female"
                  ? "female"
                  : String(t.gender || "").toLowerCase() === "male"
                    ? "male"
                    : "";
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`publicClub__chip${gender ? ` publicClub__chip--${gender}` : ""}${
                    String(teamId) === String(t.id) ? " is-active" : ""
                  }`}
                  onClick={() => setTeamId(String(t.id))}
                >
                  <span className="publicClub__chipHint">{label}</span>
                </button>
              );
            })}
          </div>

          {!(page.teams || []).length ? (
            <p className="publicClub__muted">В момента няма отворени групи за записване.</p>
          ) : !teamId ? (
            <p className="publicClub__muted">Първо избери група (пол и години).</p>
          ) : slotsBusy ? (
            <p className="publicClub__muted">Зареждане на тренировки…</p>
          ) : slots.length === 0 ? (
            <p className="publicClub__muted">Няма насрочени тренировки за тази група в близките дни.</p>
          ) : (
            <div className="publicClub__slots">
              {slots.map((s) => {
                const gender =
                  String(s.team_gender || "").toLowerCase() === "female"
                    ? "female"
                    : String(s.team_gender || "").toLowerCase() === "male"
                      ? "male"
                      : "";
                return (
                <button
                  key={s.slot_key}
                  type="button"
                  className={`publicClub__slot${gender ? ` publicClub__slot--${gender}` : ""}${
                    slotKey === s.slot_key ? " is-active" : ""
                  }`}
                  onClick={() => setSlotKey(s.slot_key)}
                >
                  <span className="publicClub__slotRadio" aria-hidden>
                    {slotKey === s.slot_key ? "●" : "○"}
                  </span>
                  <span className="publicClub__slotBody">
                    <strong className="publicClub__slotTitle">
                      {formatBgDate(s.date)} · {s.start_time}
                      {s.end_time ? `–${s.end_time}` : ""}
                      {s.location ? (
                        <>
                          {" · "}
                          <span className="publicClub__slotHallInline">{s.location}</span>
                        </>
                      ) : null}
                    </strong>
                    {s.location_address ? (
                      <div className="publicClub__slotAddress">{s.location_address}</div>
                    ) : null}
                    {s.team_label || s.team_name ? (
                      <div className="publicClub__slotTeam">{s.team_label || s.team_name}</div>
                    ) : null}
                  </span>
                </button>
                );
              })}
            </div>
          )}

          <form onSubmit={submit} className="publicClub__form">
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
              style={{ position: "absolute", left: -9999, opacity: 0, height: 0 }}
              aria-hidden
            />
            <div className="publicClub__formRow">
              <Input
                required
                placeholder="Име на детето"
                value={form.child_first_name}
                onChange={(e) => setForm((p) => ({ ...p, child_first_name: e.target.value }))}
              />
              <Input
                placeholder="Фамилия"
                value={form.child_last_name}
                onChange={(e) => setForm((p) => ({ ...p, child_last_name: e.target.value }))}
              />
            </div>
            <div className="publicClub__formRow">
              <label className="publicClub__label">
                Година на раждане
                <select
                  value={form.child_birth_year}
                  onChange={(e) => setForm((p) => ({ ...p, child_birth_year: e.target.value }))}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="publicClub__label">
                Пол
                <select
                  value={form.child_gender}
                  onChange={(e) => setForm((p) => ({ ...p, child_gender: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="female">Момиче</option>
                  <option value="male">Момче</option>
                </select>
              </label>
            </div>
            <Input
              required
              placeholder="Име на родител"
              value={form.parent_name}
              onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))}
            />
            <Input
              required
              placeholder="Телефон на родител"
              value={form.parent_phone}
              onChange={(e) => setForm((p) => ({ ...p, parent_phone: e.target.value }))}
            />
            <Input
              placeholder="Имейл (по желание)"
              value={form.parent_email}
              onChange={(e) => setForm((p) => ({ ...p, parent_email: e.target.value }))}
            />
            <textarea
              placeholder="Бележка (по желание)"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              rows={3}
            />
            {selectedSlot ? (
              <p className="publicClub__muted" style={{ margin: 0 }}>
                Пробна: {formatBgDate(selectedSlot.date)} · {selectedSlot.start_time}
                {selectedSlot.end_time ? `–${selectedSlot.end_time}` : ""}
                {selectedSlot.location ? ` · ${selectedSlot.location}` : ""}
                {selectedSlot.location_address ? ` · ${selectedSlot.location_address}` : ""}
              </p>
            ) : null}
            <Button disabled={sending || !teamId || !selectedSlot} type="submit">
              {sending ? "Изпращане…" : "Запиши пробна тренировка"}
            </Button>
            {doneMsg ? <p className="publicClub__done">{doneMsg}</p> : null}
          </form>
        </div>
      </section>

      {hasAbout ? (
        <section id="za-kluba" className="publicClub__section publicClub__about">
          <h2>За клуба</h2>
          {page.full_name && page.full_name !== page.name ? (
            <p className="publicClub__muted" style={{ marginTop: 0 }}>
              {page.full_name}
            </p>
          ) : null}
          {page.about ? <p className="publicClub__aboutText">{page.about}</p> : null}

          <div className="publicClub__aboutGrid">
            <div className="publicClub__card">
              <strong>Контакти</strong>
              {(page.city || page.address) ? (
                <div className="publicClub__muted" style={{ marginTop: 8 }}>
                  {[page.city, page.address].filter(Boolean).join(", ")}
                </div>
              ) : null}
              {page.contact_name || page.contact_phone ? (
                <ul className="publicClub__coachList">
                  <li>
                    {page.contact_name ? (
                      <span className="publicClub__coachName">{page.contact_name}</span>
                    ) : null}
                    <span className="publicClub__muted">
                      Председател
                      {page.contact_phone ? ` · ${page.contact_phone}` : ""}
                    </span>
                  </li>
                </ul>
              ) : (
                <div className="publicClub__muted" style={{ marginTop: 8 }}>
                  —
                </div>
              )}
              {page.contact_email ? (
                <div className="publicClub__muted" style={{ marginTop: 8 }}>
                  Имейл: {page.contact_email}
                </div>
              ) : null}
              {page.website_url ? (
                <div className="publicClub__actions">
                  <a href={page.website_url} target="_blank" rel="noreferrer">
                    <Button type="button" size="sm" variant="secondary">
                      Уебсайт
                    </Button>
                  </a>
                </div>
              ) : null}
            </div>

            {coaches.length ? (
              <div className="publicClub__card">
                <strong>Треньори</strong>
                <ul className="publicClub__coachList">
                  {coaches.map((c) => (
                    <li key={c.id}>
                      <span className="publicClub__coachName">{c.name}</span>
                      <span className="publicClub__muted">
                        {c.role_label || "Треньор"}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {halls.length ? (
              <div className="publicClub__card">
                <strong>Зали</strong>
                <ul className="publicClub__coachList">
                  {halls.map((h) => (
                    <li key={h.id}>
                      <span className="publicClub__coachName">{h.name}</span>
                      {h.address ? <span className="publicClub__muted">{h.address}</span> : null}
                      {h.google_maps_url ? (
                        <a
                          href={h.google_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="publicClub__mapsLink"
                        >
                          Карта
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
