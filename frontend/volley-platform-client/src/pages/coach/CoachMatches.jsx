import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { MATCH_STATUS_LABEL, MATCH_SYSTEMS, MATCH_FORMATS } from "../../utils/matchPositions";
import { Button, EmptyState, Input, Modal } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { normalizeError } from "../../utils/normalizeError";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CoachMatches() {
  const { teamId } = useParams();
  const teamIdNum = Number(teamId);
  const navigate = useNavigate();
  const toast = useToast();

  const [teamName, setTeamName] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({
    opponent_name: "",
    match_date: todayIso(),
    venue: "",
    system: "5-1",
    format: "bo5",
  });

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [teamsRes, matchesRes] = await Promise.all([
        axiosInstance.get(API_PATHS.TEAMS_LIST),
        axiosInstance.get(API_PATHS.TEAM_MATCHES(teamIdNum)),
      ]);
      const teams = Array.isArray(teamsRes.data) ? teamsRes.data : [];
      const team = teams.find((t) => Number(t.id) === teamIdNum);
      setTeamName(team?.name || `Отбор #${teamIdNum}`);
      setMatches(Array.isArray(matchesRes.data) ? matchesRes.data : []);
    } catch (err) {
      setError(normalizeError(err, "Грешка при зареждане на мачовете."));
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [teamIdNum]);

  const createMatch = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.TEAM_MATCHES(teamIdNum), {
        opponent_name: form.opponent_name.trim() || null,
        match_date: form.match_date || null,
        venue: form.venue.trim() || null,
        system: form.system || "5-1",
        format: form.format || "bo5",
      });
      setCreateOpen(false);
      toast.success("Мачът е създаден.");
      navigate(`/coach/teams/${teamIdNum}/matches/${res.data.id}`);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно създаване на мач."));
    } finally {
      setBusy(false);
    }
  };

  const deleteMatch = async (m) => {
    const name = m.opponent_name || "този мач";
    const liveNote = m.status === "live" ? " Мачът е в ход — статистиката също ще се изтрие." : "";
    if (!window.confirm(`Изтрий мача срещу ${name}?${liveNote}`)) return;
    try {
      setDeletingId(m.id);
      await axiosInstance.delete(API_PATHS.TEAM_MATCH(teamIdNum, m.id));
      setMatches((prev) => prev.filter((row) => Number(row.id) !== Number(m.id)));
      toast.success("Мачът е изтрит.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изтриване."));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <p className="coachMobileMuted">Зареждане...</p>;
  if (error) return <EmptyState title="Грешка" description={error} />;

  return (
    <section className="coachMobileHubSection">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <Link to={`/coach/teams/${teamIdNum}`} className="coachMobileMuted" style={{ fontSize: 13 }}>
            ← {teamName}
          </Link>
          <h2 style={{ margin: "6px 0 0", fontSize: 20 }}>Мач / Ротации</h2>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Нов мач
        </Button>
      </div>

      {matches.length === 0 ? (
        <EmptyState
          title="Няма мачове"
          description="Създайте мач, изберете до 14 състезатели и задайте номера и позиции."
        />
      ) : (
        <ul className="coachMobileRosterList">
          {matches.map((m) => {
            const href =
              m.status === "finished"
                ? `/coach/teams/${teamIdNum}/matches/${m.id}/report`
                : m.status === "live"
                  ? `/coach/teams/${teamIdNum}/matches/${m.id}/live`
                  : `/coach/teams/${teamIdNum}/matches/${m.id}`;
            return (
              <li key={m.id} className="coachMatchListItem">
                <Link to={href} className="coachMobileRosterRow coachMatchListLink">
                  <span style={{ display: "grid", gap: 2 }}>
                    <strong>{m.opponent_name || "Без противник"}</strong>
                    <span className="coachMobileMuted" style={{ fontSize: 12 }}>
                      {m.match_date || "без дата"} · {m.system} ·{" "}
                      {MATCH_FORMATS.find((f) => f.code === m.format)?.label || m.format || "3 от 5"} ·{" "}
                      {MATCH_STATUS_LABEL[m.status] || m.status}
                      {typeof m.roster_count === "number" ? ` · ${m.roster_count}/14` : ""}
                      {m.has_lineup ? " · шестица ✓" : ""}
                      {m.status === "finished" ? " · отчет" : ""}
                    </span>
                  </span>
                  <span className="coachMobileTeamChevron" aria-hidden>
                    ›
                  </span>
                </Link>
                <button
                  type="button"
                  className="coachMatchDeleteBtn"
                  disabled={busy || deletingId === m.id}
                  title="Изтрий мача"
                  aria-label={`Изтрий мач срещу ${m.opponent_name || "противник"}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteMatch(m);
                  }}
                >
                  {deletingId === m.id ? "…" : "Изтрий"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        dismissable={!busy}
        title="Нов мач"
        size="compact"
      >
        <div style={{ display: "grid", gap: 8 }}>
          <Input
            placeholder="Противник"
            value={form.opponent_name}
            onChange={(e) => setForm((p) => ({ ...p, opponent_name: e.target.value }))}
          />
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Дата</span>
            <Input
              type="date"
              value={form.match_date}
              onChange={(e) => setForm((p) => ({ ...p, match_date: e.target.value }))}
            />
          </label>
          <Input
            placeholder="Място"
            value={form.venue}
            onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
          />
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Схема</span>
            <select
              value={form.system}
              onChange={(e) => setForm((p) => ({ ...p, system: e.target.value }))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d8e1ec",
                fontSize: 15,
                background: "#fff",
              }}
            >
              {MATCH_SYSTEMS.map((s) => (
                <option key={s.code} value={s.code} disabled={!s.enabled}>
                  {s.label}
                  {!s.enabled ? " (скоро)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Формат</span>
            <select
              value={form.format}
              onChange={(e) => setForm((p) => ({ ...p, format: e.target.value }))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d8e1ec",
                fontSize: 15,
                background: "#fff",
              }}
            >
              {MATCH_FORMATS.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label} — {f.hint}
                </option>
              ))}
            </select>
          </label>
          <div className="uiModalActions">
            <Button disabled={busy} onClick={createMatch}>
              {busy ? "Създаване..." : "Създай и избери състав"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>
              Отказ
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
