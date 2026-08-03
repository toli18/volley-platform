import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import BvfClubAthletesSekCard from "../../components/athletes/BvfClubAthletesSekCard";
import MembershipConsentTemplateCard from "../../components/athletes/MembershipConsentTemplateCard";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

function statusLabel(status) {
  if (status === "linked") return "В платформата";
  if (status === "egn_match") return "ЕГН съвпадение";
  return "Нов";
}

export default function CoachBvfAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const role = normalizeRole(user);
  const allowed = role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sexFilter, setSexFilter] = useState("all");
  const [onlyNew, setOnlyNew] = useState(true);
  const [pageTab, setPageTab] = useState("athletes"); // athletes | link | consent

  const permanent = Boolean(
    status?.permanent_link || status?.has_bvf_api_key || status?.has_bvf_credentials,
  );

  const loadStatus = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_STATUS);
      setStatus(res.data);
      return res.data;
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при зареждане на БФВ статуса."));
      return null;
    }
  };

  useEffect(() => {
    if (allowed) loadStatus();
  }, [allowed]);

  const saveApiKey = async () => {
    const key = apiKey.trim();
    if (!key.startsWith("bfv_")) {
      toast.error("Очаква се ключ, започващ с bfv_ (от Интеграции → API токени).");
      return;
    }
    try {
      setBusy(true);
      const body = { api_key: key };
      if (status?.bvf_club_id) body.bvf_club_id = status.bvf_club_id;
      const res = await axiosInstance.put(API_PATHS.BVF_ADMIN_LINK_API_KEY, body);
      setApiKey("");
      setStatus((prev) => ({
        ...(prev || {}),
        ...res.data,
        linked_athletes: prev?.linked_athletes || 0,
      }));
      toast.success(
        `API ключ записан · БФВ #${res.data.bvf_club_id} (${res.data.bvf_club_name}). Префикс: ${res.data.bvf_api_key_prefix || "—"}.`,
      );
      await loadStatus();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на API ключ."));
    } finally {
      setBusy(false);
    }
  };

  const authorizeClub = async () => {
    if (!username.trim() || !password) {
      toast.error("Въведи клубен потребител и парола от db.bvf.bg.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.put(API_PATHS.BVF_ADMIN_LINK_CLUB, {
        username: username.trim(),
        password,
      });
      setPassword("");
      setStatus((prev) => ({
        ...(prev || {}),
        ...res.data,
        linked_athletes: prev?.linked_athletes || 0,
      }));
      toast.success(
        `Постоянна връзка: БФВ #${res.data.bvf_club_id} (${res.data.bvf_club_name}).`,
      );
      await loadStatus();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна оторизация."));
    } finally {
      setBusy(false);
    }
  };

  const unlinkClub = async () => {
    if (!window.confirm("Премахва връзката, API ключа и записаните credentials. Продължаваш?")) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.BVF_ADMIN_UNLINK_CLUB);
      setPreview(null);
      setSelected(new Set());
      toast.success("Връзката с БФВ е премахната.");
      await loadStatus();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно премахване."));
    } finally {
      setBusy(false);
    }
  };

  const fetchPlayers = async () => {
    if (!status?.bvf_club_id) {
      toast.error("Първо запази API ключ (стъпка 1).");
      return;
    }
    if (!permanent) {
      toast.error("Нужна е постоянна връзка — запази API ключ или свържи с потребител/парола.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PLAYERS_FETCH, {});
      setPreview(res.data);
      setSelected(new Set());
      toast.success(`Заредени ${res.data.total} състезатели от БФВ.`);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане от БФВ."));
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const rows = preview?.players || [];
    const qq = q.trim().toLowerCase();
    const yf = yearFrom ? Number(yearFrom) : null;
    const yt = yearTo ? Number(yearTo) : null;
    return rows.filter((r) => {
      if (onlyNew && r.status === "linked") return false;
      if (sexFilter === "male" && r.sex !== 0) return false;
      if (sexFilter === "female" && r.sex !== 1) return false;
      if (Number.isFinite(yf) && (r.birthYear == null || r.birthYear < yf)) return false;
      if (Number.isFinite(yt) && (r.birthYear == null || r.birthYear > yt)) return false;
      if (!qq) return true;
      const hay = `${r.name || ""} ${r.bvf_player_number || ""} ${r.currentCoach || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [preview, q, yearFrom, yearTo, sexFilter, onlyNew]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelected(new Set(filtered.filter((r) => r.status !== "linked").map((r) => r.bvf_player_id)));
  };

  const clearSelected = () => setSelected(new Set());

  const doImport = async () => {
    if (!selected.size) {
      toast.error("Избери поне един състезател.");
      return;
    }
    if (!status?.bvf_club_id) {
      toast.error("Първо свържи клуба с БФВ.");
      return;
    }
    const players = (preview?.players || [])
      .filter((r) => selected.has(r.bvf_player_id))
      .map((r) => r._raw || r);
    if (!players.length) {
      toast.error("Няма данни за избраните — зареди списъка наново.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_PLAYERS_IMPORT, { players });
      toast.success(`Импорт: нови ${res.data.created}, свързани ${res.data.linked}.`);
      setSelected(new Set());
      await loadStatus();
      if (permanent) {
        const refreshed = await axiosInstance.post(API_PATHS.BVF_ADMIN_PLAYERS_FETCH, {});
        setPreview(refreshed.data);
      }
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен импорт."));
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className="uiPage">
        <EmptyState title="Няма достъп" description="Модулът е за главен треньор / администратор." />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Администрация БФВ"
        subtitle="Връзка с db.bvf.bg, състезатели към СЕК и клубно заявление."
        actions={
          <>
            <Link to="/coach/bvf-card-indexes">
              <Button variant="secondary">Картотечни отбори</Button>
            </Link>
            <Link to="/coach/bvf">
              <Button variant="secondary">Назад към БФВ</Button>
            </Link>
          </>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={`uiButton${pageTab === "athletes" ? "" : " uiButton--secondary"}`}
          onClick={() => setPageTab("athletes")}
        >
          Състезатели
        </button>
        <button
          type="button"
          className={`uiButton${pageTab === "link" ? "" : " uiButton--secondary"}`}
          onClick={() => setPageTab("link")}
        >
          Връзка / импорт
        </button>
        <button
          type="button"
          className={`uiButton${pageTab === "consent" ? "" : " uiButton--secondary"}`}
          onClick={() => setPageTab("consent")}
        >
          Клубно заявление
        </button>
      </div>

      {pageTab === "athletes" ? <BvfClubAthletesSekCard toast={toast} permanent={permanent} /> : null}

      {pageTab === "consent" ? <MembershipConsentTemplateCard toast={toast} /> : null}

      {pageTab === "link" ? (
        <>
      <Card title="1. API ключ (препоръчително)">
        <p className="uiMuted" style={{ marginTop: 0 }}>
          Платформа: <strong>{status?.club_name || "—"}</strong>
          {status?.bvf_club_id ? (
            <>
              {" "}
              · БФВ #{status.bvf_club_id}
              {status.bvf_club_name ? ` (${status.bvf_club_name})` : ""} · свързани спортисти:{" "}
              <strong>{status.linked_athletes ?? 0}</strong>
            </>
          ) : (
            " · още не е свързан"
          )}
        </p>

        {permanent ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
              Постоянната връзка е активна
              {status?.auth_mode === "api_key" && status?.bvf_api_key_prefix ? (
                <>
                  {" "}
                  чрез API ключ <code>{status.bvf_api_key_prefix}…</code>
                </>
              ) : null}
              {status?.auth_mode === "password" && status?.bvf_username ? (
                <>
                  {" "}
                  чрез потребител <code>{status.bvf_username}</code>
                </>
              ) : null}
              . Сървърът вика БФВ автоматично — без ръчен token.
            </p>
            <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Смени API ключ</span>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder="bfv_…"
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button type="button" disabled={busy || !apiKey.trim().startsWith("bfv_")} onClick={saveApiKey}>
                  Запази нов ключ
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={unlinkClub}>
                  Премахни връзката
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 0 }}>
              В{" "}
              <a href="https://db.bvf.bg" target="_blank" rel="noreferrer">
                db.bvf.bg
              </a>
              {" → "}
              Интеграции → API токени създай ключ (четене) и го постави тук. Ключът се показва само веднъж в БФВ.
            </p>
            <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>API ключ (bfv_…)</span>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder="bfv_…"
                />
              </label>
              <Button type="button" disabled={busy || !apiKey.trim().startsWith("bfv_")} onClick={saveApiKey}>
                Запази API ключ и свържи клуба
              </Button>
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="uiLinkButton"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#64748b",
                  fontSize: 13,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                onClick={() => setShowPasswordFallback((v) => !v)}
              >
                {showPasswordFallback ? "Скрий" : "Алтернатива"}: потребител / парола (стар начин)
              </button>
              {showPasswordFallback ? (
                <div style={{ display: "grid", gap: 10, maxWidth: 420, marginTop: 10 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>БФВ потребител (клубен)</span>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="club username"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Парола</span>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !username.trim() || !password}
                    onClick={authorizeClub}
                  >
                    Оторизирай с потребител / парола
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <Card
        title="2. Зареди състезатели от БФВ"
        actions={
          <Button type="button" variant="secondary" disabled={busy || !permanent} onClick={fetchPlayers}>
            Зареди от БФВ
          </Button>
        }
      >
        <p className="uiMuted" style={{ marginTop: 0 }}>
          {permanent
            ? "Списъкът идва директно от федерацията през API ключа. Импортират се само отметнатите."
            : "След запазване на API ключ можеш да заредиш състезателите."}
        </p>

        {preview ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <span className="uiBadge">Общо: {preview.total}</span>
              <span className="uiBadge uiBadge--success">В платформата: {preview.already_linked}</span>
              <span className="uiBadge uiBadge--warning">ЕГН match: {preview.egn_matches}</span>
              <span className="uiBadge">Нови: {preview.new}</span>
              <span className="uiBadge">Филтрирани: {filtered.length}</span>
              <span className="uiBadge uiBadge--danger">Избрани: {selected.size}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 160 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Търсене</span>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="име / № / треньор" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Роден от</span>
                <Input value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} style={{ width: 90 }} placeholder="2012" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>до</span>
                <Input value={yearTo} onChange={(e) => setYearTo(e.target.value)} style={{ width: 90 }} placeholder="2017" />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Пол</span>
                <select className="uiInput" value={sexFilter} onChange={(e) => setSexFilter(e.target.value)}>
                  <option value="all">Всички</option>
                  <option value="male">Момчета</option>
                  <option value="female">Момичета</option>
                </select>
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 8 }}>
                <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Само нови</span>
              </label>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Button type="button" size="sm" variant="secondary" onClick={selectFiltered}>
                Маркирай филтрираните
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={clearSelected}>
                Изчисти избора
              </Button>
              <Button type="button" size="sm" disabled={busy || !selected.size} onClick={doImport}>
                Импортирай избраните ({selected.size})
              </Button>
            </div>

            <div style={{ overflowX: "auto", maxHeight: 480, border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <table className="uiTable" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Име</th>
                    <th>№</th>
                    <th>Год.</th>
                    <th>Треньор</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.bvf_player_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(r.bvf_player_id)}
                          onChange={() => toggle(r.bvf_player_id)}
                          disabled={r.status === "linked"}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.bvf_player_number || "—"}</td>
                      <td>{r.birthYear || "—"}</td>
                      <td>{r.currentCoach || "—"}</td>
                      <td>
                        <span
                          className={`uiBadge${
                            r.status === "linked" ? " uiBadge--success" : r.status === "egn_match" ? " uiBadge--warning" : ""
                          }`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ color: "#64748b" }}>
                        Няма редове по филтъра.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            title="Няма зареден списък"
            description={
              permanent
                ? "Натисни „Зареди от БФВ“ — без ръчен token."
                : "Първо запази API ключ от Интеграции в db.bvf.bg."
            }
          />
        )}
      </Card>
        </>
      ) : null}
    </div>
  );
}
