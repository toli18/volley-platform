import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sexFilter, setSexFilter] = useState("all");
  const [onlyNew, setOnlyNew] = useState(true);

  const permanent = Boolean(status?.permanent_link || status?.has_bvf_credentials);

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
        `Постоянна връзка: БФВ #${res.data.bvf_club_id} (${res.data.bvf_club_name}). След това token не е нужен.`,
      );
      await loadStatus();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна оторизация."));
    } finally {
      setBusy(false);
    }
  };

  const unlinkClub = async () => {
    if (!window.confirm("Премахва постоянната връзка и записаните БФВ credentials. Продължаваш?")) return;
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
      toast.error("Първо оторизирай клуба (стъпка 1).");
      return;
    }
    if (!permanent) {
      toast.error("Нужна е постоянна връзка с потребител/парола — свържи клуба отново.");
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
        subtitle="Еднократна оторизация с клубен вход в db.bvf.bg → постоянна връзка между системите."
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

      <Card title="1. Оторизирай клуба (еднократно)">
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
              {status?.bvf_username ? (
                <>
                  {" "}
                  за потребител <code>{status.bvf_username}</code>
                </>
              ) : null}
              . Сървърът влиза автоматично в БФВ при нужда — без ръчен token.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="button" variant="secondary" disabled={busy} onClick={unlinkClub}>
                Премахни връзката
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 0 }}>
              Въведи същите данни, с които клубът влиза в{" "}
              <a href="https://db.bvf.bg" target="_blank" rel="noreferrer">
                db.bvf.bg
              </a>
              . Сървърът проверява достъпа live, разпознава клуба от JWT и записва криптирани credentials за
              постоянна връзка.
            </p>
            <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
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
              <Button type="button" disabled={busy || !username.trim() || !password} onClick={authorizeClub}>
                Оторизирай и създай постоянна връзка
              </Button>
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
            ? "Списъкът идва директно от федерацията през постоянната връзка. Импортират се само отметнатите."
            : "След оторизация в стъпка 1 можеш да заредиш състезателите без token."}
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
                : "Първо оторизирай клуба с потребител и парола."
            }
          />
        )}
      </Card>
    </div>
  );
}
