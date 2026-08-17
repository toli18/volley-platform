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

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

function SlotCard({ title, slot, sex, candidates, busy, onPick, onRemove }) {
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

  return (
    <Card title={title}>
      {slot ? (
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{slot.athlete_name}</div>
          <p className="uiMuted" style={{ marginTop: 4, fontSize: 13 }}>
            {slot.birth_year || "—"}
            {slot.team_labels?.length ? ` · ${slot.team_labels.join(", ")}` : ""}
            {slot.synced ? " · в СЕК" : " · само при нас"}
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onRemove(slot)}>
            Премахни
          </Button>
        </div>
      ) : (
        <div>
          <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
            Няма избран. Търси и добави — по 1 за сезона.
          </p>
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
                    Няма съвпадение.
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
                        background: "transparent",
                        padding: "10px 12px",
                        cursor: busy ? "wait" : "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 650 }}>{a.athlete_name}</div>
                      <div className="uiMuted" style={{ fontSize: 12, marginTop: 2 }}>
                        {a.birth_year || "—"}
                        {a.team_labels?.length ? ` · ${a.team_labels.join(", ")}` : ""}
                        {Number(a.teams_count) >= 2 ? " · вече в 2 отбора" : ""}
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

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);

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
      toast.success(`Заредени от СЕК: ${res.data?.synced ?? 0}`);
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Няма връзка със СЕК или ключът няма права."));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
        {data?.rule ||
          "Обикновен състезател: най-много 2 картотеки. Универсален: 3 и повече. По 1 момиче и 1 момче за сезон."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Сезон</span>
          <Input value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }} />
        </label>
        <Button type="button" variant="secondary" disabled={busy} onClick={load}>
          Презареди
        </Button>
        <Button type="button" variant="secondary" disabled={busy || (!permanent && !token.trim())} onClick={syncFromSek}>
          Зареди от СЕК
        </Button>
      </div>
      {!permanent ? (
        <textarea
          className="uiInput"
          rows={2}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="БФВ token (временно) — за запис в СЕК трябва write ключ"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", marginBottom: 12 }}
        />
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
        }}
      >
        <SlotCard
          title="Момичета"
          slot={data?.girls}
          sex={1}
          candidates={data?.candidates || []}
          busy={busy}
          onPick={pick}
          onRemove={remove}
        />
        <SlotCard
          title="Момчета"
          slot={data?.boys}
          sex={0}
          candidates={data?.candidates || []}
          busy={busy}
          onPick={pick}
          onRemove={remove}
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
        subtitle="Само главният треньор. По 1 момиче и 1 момче за сезон — за 3 и повече картотеки."
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
