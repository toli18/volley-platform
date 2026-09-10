import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import useIsCoachMobileShell from "../../hooks/useIsCoachMobileShell";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { filterFeesAthletes } from "../../utils/feesAthleteSearch";
import { normalizeError } from "../../utils/normalizeError";
import { defaultSekSeasonYear, sekSeasonLabel } from "../../utils/sekSeason";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

function SlotCard({ title, slot, sex, candidates, busy, canPushSek, onPick, onRemove, onPush }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const available = useMemo(
    () =>
      filterFeesAthletes(
        candidates.filter((a) => Number(a.sex) === sex && !a.taken),
        search,
      ),
    [candidates, search, sex],
  );
  const needsFirst = useMemo(
    () => available.filter((a) => a.needs_universal).slice(0, 8),
    [available],
  );

  return (
    <Card title={title}>
      {slot ? (
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{slot.athlete_name}</div>
          <p className="uiMuted" style={{ marginTop: 4, fontSize: 13 }}>
            {slot.bvf_player_number ? `СЕК № ${slot.bvf_player_number} · ` : ""}
            {slot.birth_year || "—"}
            {slot.team_labels?.length ? ` · ${slot.team_labels.join(", ")}` : ""}
          </p>
          <p
            style={{
              margin: "8px 0 12px",
              fontSize: 12,
              fontWeight: 700,
              color: slot.synced ? "#047857" : "#b45309",
            }}
          >
            {slot.synced ? "В СЕК" : "Само при нас — още не е изпратен към СЕК"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {!slot.synced ? (
              <Button type="button" disabled={busy || !canPushSek} onClick={() => onPush(slot)}>
                Изпрати към СЕК
              </Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onRemove(slot)}>
              Премахни
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Няма избран. По 1 за сезона — търси или избери от нуждаещите се.
          </p>
          {needsFirst.length > 0 && !search.trim() ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Нуждаят се (вече в 2+ отбора)</div>
              <div style={{ display: "grid", gap: 6 }}>
                {needsFirst.map((a) => (
                  <button
                    key={`need-${a.id}`}
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(a.id)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #fde68a",
                      background: "#fffbeb",
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 650 }}>{a.athlete_name}</div>
                    <div className="uiMuted" style={{ fontSize: 12, marginTop: 2 }}>
                      {a.team_labels?.join(", ") || "2+ картотеки"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ position: "relative" }}>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Търси състезател…"
              autoComplete="off"
            />
            {open ? (
              <div
                role="listbox"
                style={{
                  marginTop: 8,
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: "#fff",
                  maxHeight: 280,
                  overflow: "auto",
                }}
              >
                {available.length === 0 ? (
                  <p className="uiMuted" style={{ margin: 0, padding: 12, fontSize: 13 }}>
                    Няма съвпадение. Трябва връзка със СЕК (БФВ id) и попълнен пол.
                  </p>
                ) : (
                  available.slice(0, 40).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onPick(a.id);
                        setSearch("");
                        setOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid #f1f5f9",
                        background: a.needs_universal ? "#fffbeb" : "transparent",
                        padding: "10px 12px",
                        cursor: busy ? "wait" : "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 650 }}>{a.athlete_name}</div>
                      <div className="uiMuted" style={{ fontSize: 12, marginTop: 2 }}>
                        {a.bvf_player_number ? `СЕК № ${a.bvf_player_number} · ` : ""}
                        {a.birth_year || "—"}
                        {a.team_labels?.length ? ` · ${a.team_labels.join(", ")}` : ""}
                        {a.needs_universal ? " · нужен универсален" : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function CoachBvfUniversalPlayers() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isMobile = useIsCoachMobileShell();
  const { permanent, tokenBody } = useClubBvfLink();
  const role = normalizeRole(user);
  const isHead =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [year, setYear] = useState(String(defaultSekSeasonYear()));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [lastSyncMsg, setLastSyncMsg] = useState("");

  const canPushSek = permanent || Boolean(token.trim());

  const load = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_UNIVERSAL_PLAYERS, {
        params: { season_year: Number(year) },
      });
      setData(res.data);
    } catch (err) {
      setData(null);
      toast.error(normalizeError(err, "Неуспешно зареждане."));
    }
  }, [toast, year]);

  useEffect(() => {
    if (!isHead) {
      navigate("/coach/bvf-card-indexes", { replace: true });
      return;
    }
    load();
  }, [isHead, load, navigate]);

  const pick = async (athleteId) => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_UNIVERSAL_PLAYERS, {
        athlete_id: athleteId,
        season_year: Number(year),
        push_to_sek: true,
        ...tokenBody(token),
      });
      toast.success(res.data?.message || "Записан.");
      if (res.data?.sek_error) toast.error(res.data.sek_error);
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен запис."));
    } finally {
      setBusy(false);
    }
  };

  const push = async (slot) => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_UNIVERSAL_PLAYER_PUSH(slot.id), {
        ...tokenBody(token),
      });
      toast.success(res.data?.message || "Изпратен към СЕК.");
      if (res.data?.sek_error) toast.error(res.data.sek_error);
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно изпращане към СЕК."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slot) => {
    if (!window.confirm(`Премахни ${slot.athlete_name} като универсален?`)) return;
    try {
      setBusy(true);
      await axiosInstance.delete(API_PATHS.BVF_ADMIN_UNIVERSAL_PLAYER(slot.id), {
        params: tokenBody(token),
      });
      toast.success("Премахнат.");
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно премахване."));
    } finally {
      setBusy(false);
    }
  };

  const syncFromSek = async () => {
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_UNIVERSAL_PLAYERS_SYNC, {
        season_year: Number(year),
        ...tokenBody(token),
      });
      const payload = res.data || {};
      if (payload.season_year && String(payload.season_year) !== String(year)) {
        setYear(String(payload.season_year));
      }
      setUnmatched(Array.isArray(payload.unmatched) ? payload.unmatched : []);
      const msg = payload.message || `Заредени от СЕК: ${payload.synced ?? 0}`;
      setLastSyncMsg(msg);
      if (payload.ok === false) {
        toast.error(msg);
      } else if ((payload.synced ?? 0) === 0 && (payload.unmatched || []).length === 0) {
        toast.error(
          msg ||
            "СЕК върна 0 за този сезон. Провери сезона или дали записите са в db.bvf.bg.",
        );
      } else {
        toast.success(msg);
      }
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Няма връзка със СЕК или ключът няма права."));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid #a7f3d0",
        background: "#ecfdf5",
        color: "#065f46",
      }}
    >
      В СЕК: {data?.synced_count ?? 0}
      {(data?.pending_push_count ?? 0) > 0 ? ` · чакат изпращане: ${data.pending_push_count}` : ""}
    </span>
  );

  const body = (
    <>
      <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
        {data?.rule ||
          "Правило: обикновен — до 2 картотеки; универсален — 3+. По 1 момиче и 1 момче. Зареди от СЕК или избери и изпрати."}
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "end",
          marginBottom: 12,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Сезон Year · {sekSeasonLabel(year)}</span>
            <Input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} />
          </label>
          <Button type="button" variant="secondary" disabled={busy} onClick={load}>
            Презареди
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !canPushSek}
            onClick={syncFromSek}
          >
            Зареди от СЕК
          </Button>
        </div>
        {statusBadge}
      </div>
      {lastSyncMsg ? (
        <p className="uiMuted" style={{ marginTop: 0, fontSize: 12 }}>
          Последен sync: {lastSyncMsg}
        </p>
      ) : null}
      {!permanent ? (
        <textarea
          className="uiInput"
          rows={2}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="БФВ token (временно) — за запис/зареждане от СЕК трябва write ключ"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", marginBottom: 12 }}
        />
      ) : null}
      {unmatched.length > 0 ? (
        <Card title="В СЕК, но липсват при нас">
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Свържи ги в платформата (СЕК таб / link по ЕГН), после пак „Зареди от СЕК“.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {unmatched.map((u, i) => (
              <li key={`${u.bvf_player_id || u.cup_id || i}-${i}`} style={{ marginBottom: 6 }}>
                <strong>{u.name || "—"}</strong>
                {u.bvf_player_number ? ` · СЕК № ${u.bvf_player_number}` : ""}
                {u.hint ? ` — ${u.hint}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
          marginTop: unmatched.length ? 12 : 0,
        }}
      >
        <SlotCard
          title="Момичета"
          slot={data?.girls}
          sex={1}
          candidates={data?.candidates || []}
          busy={busy}
          canPushSek={canPushSek}
          onPick={pick}
          onRemove={remove}
          onPush={push}
        />
        <SlotCard
          title="Момчета"
          slot={data?.boys}
          sex={0}
          candidates={data?.candidates || []}
          busy={busy}
          canPushSek={canPushSek}
          onPick={pick}
          onRemove={remove}
          onPush={push}
        />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="coachMobilePage cardIndexesMobilePage">
        <header className="feesCoachHead">
          <h2 className="feesCoachHeadTitle">Универсални състезатели</h2>
        </header>
        {data ? body : <EmptyState title="Зареждане…" />}
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title="Универсални състезатели"
        subtitle="Само главният треньор. По 1 момиче и 1 момче — зареди от СЕК или изпрати към СЕК."
        actions={
          <Link to="/coach/bvf-card-indexes">
            <Button variant="secondary">← Картотечни отбори</Button>
          </Link>
        }
      />
      {data ? body : <EmptyState title="Зареждане…" />}
    </div>
  );
}
