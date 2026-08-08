import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";
import { competitionKindLabel } from "../utils/competitionKinds";
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

  const orgMeta = [
    page.bvf_region ? `Регион ${page.bvf_region}` : null,
    page.license_number ? `Лиценз ${page.license_number}` : null,
  ].filter(Boolean);

  const fbEmbed = page.facebook_page_url
    ? `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
        page.facebook_page_url,
      )}&tabs=timeline&width=500&height=560&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=false`
    : null;

  return (
    <div className="publicClub">
      <div className="publicClub__top">
        <nav className="publicClub__nav" aria-label="Клубна страница">
          <a href="#za-kluba">За клуба</a>
          <a href="#treniori">Треньори</a>
          <a href="#kalendar">Календар</a>
          {fbEmbed ? <a href="#novini">Новини</a> : null}
          <a href="#zapisvane" className="is-cta">
            Пробна тренировка
          </a>
        </nav>
      </div>

      <header className="publicClub__hero">
        {page.logo_url ? (
          <img className="publicClub__logo" src={page.logo_url} alt="" />
        ) : (
          <div className="publicClub__logoFallback">{(page.name || "?").slice(0, 1)}</div>
        )}
        <div>
          <h1>{page.name}</h1>
          {page.full_name && page.full_name !== page.name ? (
            <p className="publicClub__muted">{page.full_name}</p>
          ) : null}
          {page.tagline ? <p className="publicClub__tagline">{page.tagline}</p> : null}
          <p className="publicClub__meta">
            {[page.city, page.address].filter(Boolean).join(" · ")}
            {orgMeta.length ? ` · ${orgMeta.join(" · ")}` : ""}
          </p>
        </div>
      </header>

      <section id="za-kluba" className="publicClub__section">
        <h2>За клуба</h2>
        {page.about ? <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{page.about}</p> : null}
        <div className="publicClub__cards">
          <div className="publicClub__card">
            <strong>Контакти</strong>
            <div className="publicClub__muted">
              {[
                page.contact_phone ? `Тел: ${page.contact_phone}` : null,
                page.contact_email ? `Имейл: ${page.contact_email}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </div>
            <div className="publicClub__actions">
              {page.website_url ? (
                <a href={page.website_url} target="_blank" rel="noreferrer">
                  <Button type="button" size="sm" variant="secondary">
                    Уебсайт
                  </Button>
                </a>
              ) : null}
              {page.facebook_page_url ? (
                <a href={page.facebook_page_url} target="_blank" rel="noreferrer">
                  <Button type="button" size="sm" variant="secondary">
                    Facebook
                  </Button>
                </a>
              ) : null}
              <a href="#zapisvane">
                <Button type="button" size="sm">
                  Запиши пробна
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {(page.coaches || []).length ? (
        <section id="treniori" className="publicClub__section">
          <h2>Треньори</h2>
          <div className="publicClub__cards">
            {page.coaches.map((c) => (
              <div key={c.id} className="publicClub__card">
                <strong>{c.name}</strong>
                <div className="publicClub__muted">
                  {c.role_label || "Треньор"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section id="kalendar" className="publicClub__section">
        <h2>Календар на събитията</h2>
        <p className="publicClub__sectionLead">Предстоящи състезания и турнири на клуба.</p>
        {(page.tournaments || []).length ? (
          <div className="publicClub__cards">
            {page.tournaments.map((t) => (
              <div key={t.id} className="publicClub__card publicClub__eventCard">
                <strong>
                  {formatBgDate(t.date)} · {t.start_time}
                  {t.end_time ? `–${t.end_time}` : ""}
                </strong>
                <div className="publicClub__eventMeta">
                  {competitionKindLabel(t)}
                  {t.team_name ? ` · ${t.team_name}` : ""}
                  {t.location ? ` · ${t.location}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="publicClub__muted">Няма предстоящи събития в календара.</p>
        )}
      </section>

      {fbEmbed ? (
        <section id="novini" className="publicClub__section">
          <h2>Новини</h2>
          <p className="publicClub__sectionLead">
            Актуални публикации от Facebook страницата на клуба.
          </p>
          <iframe
            title="Facebook новини"
            className="publicClub__fb"
            src={fbEmbed}
            scrolling="no"
            frameBorder="0"
            allow="encrypted-media"
          />
          <div className="publicClub__actions">
            <a href={page.facebook_page_url} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="secondary">
                Отвори във Facebook
              </Button>
            </a>
          </div>
        </section>
      ) : null}

      <section id="zapisvane" className="publicClub__section publicClub__enroll">
        <h2>Пробна тренировка</h2>
        <p className="publicClub__sectionLead">
          Избери група → виж следващите 5 тренировки → запиши се за тази, на която можеш да дойдеш.
          Треньорът получава известие. След пробната и приемането ще получиш вход за родителски профил.
        </p>

        <div className="publicClub__steps">
          <span className={`publicClub__step${step >= 1 ? " is-on" : ""}`}>1. Група</span>
          <span className={`publicClub__step${step >= 2 ? " is-on" : ""}`}>2. Тренировка</span>
          <span className={`publicClub__step${step >= 3 ? " is-on" : ""}`}>3. Данни</span>
        </div>

        <div className="publicClub__chips" style={{ marginBottom: 12 }}>
          {(page.teams || []).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`publicClub__chip${String(teamId) === String(t.id) ? " is-active" : ""}`}
              onClick={() => setTeamId(String(t.id))}
            >
              <span className="publicClub__chipName">{t.name}</span>
              {t.hint ? <span className="publicClub__chipHint">{t.hint}</span> : null}
            </button>
          ))}
        </div>

        {!(page.teams || []).length ? (
          <p className="publicClub__muted">В момента няма отворени групи за записване.</p>
        ) : !teamId ? (
          <p className="publicClub__muted">Първо избери група по име.</p>
        ) : slotsBusy ? (
          <p className="publicClub__muted">Зареждане на тренировки…</p>
        ) : slots.length === 0 ? (
          <p className="publicClub__muted">Няма насрочени тренировки за тази група в близките дни.</p>
        ) : (
          <div className="publicClub__slots">
            {slots.map((s) => (
              <button
                key={s.slot_key}
                type="button"
                className={`publicClub__slot${slotKey === s.slot_key ? " is-active" : ""}`}
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
                  <div className="publicClub__slotTeam">{s.team_name}</div>
                </span>
              </button>
            ))}
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
            </p>
          ) : null}
          <Button disabled={sending || !teamId || !selectedSlot} type="submit">
            {sending ? "Изпращане…" : "Запиши пробна тренировка"}
          </Button>
          {doneMsg ? <p className="publicClub__done">{doneMsg}</p> : null}
        </form>
      </section>
    </div>
  );
}
