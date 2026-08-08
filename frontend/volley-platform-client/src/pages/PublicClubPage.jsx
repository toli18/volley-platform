import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { normalizeError } from "../utils/normalizeError";
import { competitionKindLabel } from "../utils/competitionKinds";
import { Button, Input } from "../components/ui";

const YEARS = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - 5 - i);

export default function PublicClubPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [form, setForm] = useState({
    child_first_name: "",
    child_last_name: "",
    child_birth_year: String(YEARS[6] || 2015),
    child_gender: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    preferred_team_id: "",
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

  const hoursByDay = useMemo(() => {
    const map = new Map();
    for (const h of page?.training_hours || []) {
      const key = h.weekday_label || h.weekday;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(h);
    }
    return [...map.entries()];
  }, [page]);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setDoneMsg("");
    try {
      const res = await axiosInstance.post(API_PATHS.PUBLIC_CLUB_ENROLL(slug), {
        ...form,
        child_birth_year: Number(form.child_birth_year),
        preferred_team_id: form.preferred_team_id ? Number(form.preferred_team_id) : null,
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
      <div className="uiPage" style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
        <p className="uiMuted">Зареждане…</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="uiPage" style={{ maxWidth: 880, margin: "0 auto", padding: 24 }}>
        <h1>Клубна страница</h1>
        <p>{error || "Няма данни."}</p>
      </div>
    );
  }

  const orgMeta = [
    page.bvf_region ? `Регион ${page.bvf_region}` : null,
    page.license_number ? `Лиценз ${page.license_number}` : null,
    page.bulstat ? `ЕИК ${page.bulstat}` : null,
  ].filter(Boolean);

  return (
    <div className="uiPage publicClubPage" style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px 48px" }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        {page.logo_url ? (
          <img src={page.logo_url} alt="" style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 12 }} />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: "#0f766e",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            {(page.name || "?").slice(0, 1)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: "1.6rem" }}>{page.name}</h1>
          {page.full_name && page.full_name !== page.name ? (
            <p className="uiMuted" style={{ margin: 0, fontSize: 13 }}>
              {page.full_name}
            </p>
          ) : null}
          {page.tagline ? <p className="uiMuted" style={{ margin: "4px 0 0" }}>{page.tagline}</p> : null}
          <p className="uiMuted" style={{ margin: "6px 0 0" }}>
            {[page.city, page.address].filter(Boolean).join(" · ")}
          </p>
          {orgMeta.length ? (
            <p className="uiMuted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {orgMeta.join(" · ")}
            </p>
          ) : null}
        </div>
        <a href="#zapisvane" style={{ textDecoration: "none" }}>
          <Button type="button">Запиши дете</Button>
        </a>
      </header>

      {page.about ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>За клуба</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{page.about}</p>
        </section>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.1rem" }}>Контакти</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {page.contact_phone ? <li>Тел: {page.contact_phone}</li> : null}
          {page.contact_email ? <li>Имейл: {page.contact_email}</li> : null}
          {page.website_url ? (
            <li>
              <a href={page.website_url} target="_blank" rel="noreferrer">
                Уебсайт
              </a>
            </li>
          ) : null}
          {(page.locations || []).length ? (
            <li>Зали / места: {page.locations.join(" · ")}</li>
          ) : null}
        </ul>
      </section>

      {(page.coaches || []).length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Треньори</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {page.coaches.map((c) => (
              <div key={c.id} style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <strong>{c.name}</strong>
                <div className="uiMuted" style={{ fontSize: 13 }}>
                  {c.role_label || "Треньор"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(page.teams || []).length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Отбори / групи</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {page.teams.map((t) => {
              const bits = [t.age_group, t.gender_label, t.season].filter(Boolean);
              return (
                <span
                  key={t.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#f1f5f9",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {t.name}
                  {bits.length ? ` · ${bits.join(" · ")}` : ""}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      {hoursByDay.length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Тренировъчни часове</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {hoursByDay.map(([day, items]) => (
              <div key={day}>
                <strong>{day}</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {items.map((h, i) => (
                    <li key={`${day}-${i}`}>
                      {h.start_time}–{h.end_time}
                      {h.team_name ? ` · ${h.team_name}` : ""}
                      {h.location ? ` · ${h.location}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(page.tournaments || []).length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Предстоящи състезания</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {page.tournaments.map((t) => (
              <li
                key={t.id}
                style={{ padding: "10px 12px", border: "1px solid #ffedd5", borderRadius: 12, background: "#fff7ed" }}
              >
                <strong>
                  {t.date} · {t.start_time}–{t.end_time}
                </strong>
                <div className="uiMuted">
                  {competitionKindLabel(t)}
                  {t.location ? ` · ${t.location}` : ""}
                  {t.team_name ? ` · ${t.team_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(page.news || []).length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Новини</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {page.news.map((n) => (
              <li key={n.id} style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <strong>{n.title}</strong>
                {n.excerpt ? (
                  <p className="uiMuted" style={{ margin: "4px 0 0" }}>
                    {n.excerpt}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(page.photos || []).length ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Снимки</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {page.photos.map((p) => (
              <img
                key={p.id || p.url}
                src={p.url}
                alt={p.caption || ""}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 12 }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section
        id="zapisvane"
        style={{ marginBottom: 24, padding: 16, border: "1px solid #cbd5e1", borderRadius: 16, background: "#f8fafc" }}
      >
        <h2 style={{ fontSize: "1.15rem", marginTop: 0 }}>Запиши детето</h2>
        <p className="uiMuted" style={{ marginTop: 0 }}>
          Оставете заявка. Клубът ще ви покани на пробна тренировка. След приемане ще получите достъп до
          родителския профил.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
            style={{ position: "absolute", left: -9999, opacity: 0, height: 0 }}
            aria-hidden
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Година на раждане</span>
              <select
                value={form.child_birth_year}
                onChange={(e) => setForm((p) => ({ ...p, child_birth_year: e.target.value }))}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Пол</span>
              <select
                value={form.child_gender}
                onChange={(e) => setForm((p) => ({ ...p, child_gender: e.target.value }))}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
              >
                <option value="">—</option>
                <option value="female">Момиче</option>
                <option value="male">Момче</option>
              </select>
            </label>
          </div>
          {(page.teams || []).length ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Желана група</span>
              <select
                value={form.preferred_team_id}
                onChange={(e) => setForm((p) => ({ ...p, preferred_team_id: e.target.value }))}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
              >
                <option value="">Без предпочитание</option>
                {page.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
            placeholder="Бележка"
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            rows={3}
            style={{ padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", fontFamily: "inherit" }}
          />
          <Button disabled={sending} type="submit">
            {sending ? "Изпращане…" : "Изпрати заявка"}
          </Button>
          {doneMsg ? <p style={{ margin: 0 }}>{doneMsg}</p> : null}
        </form>
      </section>
    </div>
  );
}
