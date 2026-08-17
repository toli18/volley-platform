import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { Button, Card, EmptyState, Input, PageHero } from "../../components/ui";
import useClubBvfLink from "../../hooks/useClubBvfLink";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { filterFeesAthletes } from "../../utils/feesAthleteSearch";
import { normalizeError } from "../../utils/normalizeError";
import { AGE_LADDER, ageGroupLabel, ageRuleHint, athleteFitsAgeGroup, resolveAgeCode } from "../../utils/sekAgeRules";

function normalizeRole(user) {
  const r = user?.role;
  if (r && typeof r === "object" && "value" in r) return String(r.value).toLowerCase();
  return String(r || "").toLowerCase();
}

function statusLabel(it) {
  if (!it) return "—";
  if (it.is_signed || it.status === "signed") return "Изпратен към БФВ";
  if (it.status === "pending_bvf_sign") return "Готов (чака подпис в БФВ)";
  if (it.status === "ready_for_head") return "Заявка към главния";
  if (it.status === "building") return "Пълни се";
  if (it.local_only) return "Локална чернова";
  return "Чернова";
}

function sexLabel(sex) {
  return Number(sex) === 1 ? "Женски" : "Мъжки";
}

function memberAgeNote(m, year, detail) {
  if (m.fits_age === false && m.age_reason) return m.age_reason;
  const fit = athleteFitsAgeGroup(m.birth_year, year, detail?.age, detail?.age_group);
  return fit.ok ? null : fit.reason;
}

function memberMissing(m, year, detail) {
  return (
    [
      ...(memberAgeNote(m, year, detail) ? [memberAgeNote(m, year, detail)] : []),
      ...(m.checklist || [])
        .filter((c) => !c.ok && c.key !== "any_doc")
        .map((c) => c.label),
    ].join(", ") || "—"
  );
}

function teamLabelsForMember(m, detail) {
  const seen = new Set();
  const labels = [];
  const add = (value) => {
    const s = String(value || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    labels.push(s);
  };
  for (const x of m?.team_labels || []) add(x);
  add(ageGroupLabel(resolveAgeCode(detail?.age, detail?.age_group)));
  const order = AGE_LADDER.map((code) => ageGroupLabel(code));
  labels.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  if (m?.is_universal) labels.push("универсален");
  return labels;
}

function teamsCell(m, detail) {
  const labels = teamLabelsForMember(m, detail);
  if (!labels.length) return "—";
  return labels.join(", ");
}

export default function CoachBvfCardIndexDetail() {
  const { localId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { permanent, tokenBody } = useClubBvfLink();
  const role = normalizeRole(user);
  const isHead =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");

  const year = detail?.year || new Date().getFullYear();

  const memberIds = useMemo(
    () => new Set((detail?.members || []).map((m) => m.athlete_id)),
    [detail],
  );

  const availableAthletes = useMemo(
    () =>
      eligible.filter((a) => {
        if (memberIds.has(a.id)) return false;
        const fit = athleteFitsAgeGroup(a.birth_year, year, detail?.age, detail?.age_group);
        return fit.ok;
      }),
    [eligible, memberIds, year, detail],
  );

  const filteredAthletes = useMemo(
    () => filterFeesAthletes(availableAthletes, search),
    [availableAthletes, search],
  );

  const showSearchDropdown = searchOpen && detail?.can_edit && availableAthletes.length > 0;

  const loadDetail = useCallback(async () => {
    if (!localId) return null;
    const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_DETAIL(localId));
    setDetail(res.data);
    return res.data;
  }, [localId]);

  const loadEligible = useCallback(async () => {
    if (!localId) return;
    setEligibleLoading(true);
    try {
      const elig = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_ELIGIBLE, {
        params: {
          require_form_03: true,
          local_id: Number(localId),
        },
      });
      setEligible(elig.data?.athletes || []);
    } catch {
      setEligible([]);
    } finally {
      setEligibleLoading(false);
    }
  }, [localId]);

  const loadAll = useCallback(
    async ({ blockPage } = { blockPage: true }) => {
      if (!localId) return;
      if (blockPage) setLoading(true);
      const eligP = loadEligible();
      try {
        await loadDetail();
      } catch (err) {
        setDetail(null);
        setEligible([]);
        const status = err?.response?.status;
        toast.error(
          normalizeError(
            err,
            status === 403
              ? "Нямаш достъп до този картотечен отбор."
              : "Неуспешно зареждане на отбора.",
          ),
        );
        if (status === 403 || status === 404) {
          navigate("/coach/bvf-card-indexes", { replace: true });
        }
      } finally {
        if (blockPage) setLoading(false);
      }
      await eligP;
    },
    [localId, loadDetail, loadEligible, navigate, toast],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addAthlete = async (athleteId) => {
    if (!athleteId) return;
    const row = eligible.find((a) => a.id === athleteId);
    const fit = athleteFitsAgeGroup(row?.birth_year, year, detail?.age, detail?.age_group);
    if (!fit.ok) {
      toast.error(fit.reason || "Не отговаря на възрастта на отбора.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_ADD(localId), {
        athlete_ids: [athleteId],
      });
      const added = Number(res.data?.added || 0);
      if (added) {
        toast.success("Добавен в локалния състав.");
        setEligible((prev) => prev.filter((a) => a.id !== athleteId));
        if (row) {
          setDetail((d) =>
            d
              ? {
                  ...d,
                  members: [
                    ...(d.members || []).filter((m) => m.athlete_id !== athleteId),
                    {
                      athlete_id: row.id,
                      athlete_name: row.athlete_name,
                      bvf_player_id: row.bvf_player_id,
                      bvf_player_number: row.bvf_player_number,
                      synced: false,
                      ready: true,
                      has_form_03: true,
                      fits_age: true,
                      birth_year: row.birth_year,
                      teams_count: Number(row.teams_count || 0) + 1,
                      team_labels: row.team_labels || [],
                      checklist: [],
                    },
                  ],
                }
              : d,
          );
        }
        setSearch("");
        setSearchOpen(false);
        loadDetail().catch(() => {});
      } else if (res.data?.errors?.length) {
        toast.error(res.data.errors.slice(0, 3).join("; "));
      } else {
        toast.error("Състезателят не беше добавен.");
      }
      setSearch("");
      setSearchOpen(false);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне."));
    } finally {
      setBusy(false);
    }
  };

  const removeAthlete = async (athleteId, name) => {
    if (!window.confirm(`Премахни ${name || "състезателя"} от локалния състав?`)) return;
    const row = (detail?.members || []).find((m) => m.athlete_id === athleteId);
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_REMOVE(localId), {
        athlete_ids: [athleteId],
      });
      toast.success("Премахнат от локалния състав.");
      setDetail((d) =>
        d ? { ...d, members: (d.members || []).filter((m) => m.athlete_id !== athleteId) } : d,
      );
      setEligible((prev) => {
        if (prev.some((a) => a.id === athleteId) || !row) return prev;
        return [
          {
            id: row.athlete_id,
            athlete_name: row.athlete_name,
            bvf_player_id: row.bvf_player_id,
            bvf_player_number: row.bvf_player_number,
            birth_year: row.birth_year,
            has_form_03: row.has_form_03,
            teams_count: Math.max(0, Number(row.teams_count || 1) - 1),
            team_labels: row.team_labels || [],
          },
          ...prev,
        ];
      });
      loadDetail().catch(() => {});
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно премахване."));
    } finally {
      setBusy(false);
    }
  };

  const requestHead = async () => {
    if (!window.confirm("Изпращаш заявка към главния треньор за запис в СЕК?")) return;
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_REQUEST(localId), {
        note: requestNote || null,
      });
      toast.success(res.data?.message || "Заявката е изпратена.");
      setRequestNote("");
      await loadAll({ blockPage: false });
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешна заявка."));
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_REOPEN(localId), {
        note: "Върнат за корекции",
      });
      toast.success("Отборът е върнат на треньора.");
      await loadAll({ blockPage: false });
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно връщане."));
    } finally {
      setBusy(false);
    }
  };

  const submitToBvf = async () => {
    if (
      !window.confirm(
        "Запис в СЕК: качва Форма 03/А/B в профилите, създава/синхронизира отбора и изпраща към БФВ. Продължаваш?",
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_SUBMIT(localId), {
        ...tokenBody(token),
      });
      const up = Number(res.data?.forms_uploaded || 0);
      const already = Number(res.data?.forms_already_in_sek || 0);
      toast.success(
        `Статус: ${res.data?.status || "ok"}. Форми в СЕК: ${up} качени, ${already} вече имаше.`,
      );
      await loadAll({ blockPage: false });
    } catch (err) {
      toast.error(normalizeError(err, "Записът в СЕК чака write token или връзка с БФВ."));
      await loadAll({ blockPage: false });
    } finally {
      setBusy(false);
    }
  };

  const titleAge = detail?.age_group || detail?.age || "Отбор";
  const titleSex = detail ? sexLabel(detail.sex) : "";

  return (
    <div className="uiPage">
      <PageHero
        title={detail ? `${titleAge} · ${titleSex}` : "Картотечен отбор"}
        subtitle={
          detail
            ? `${statusLabel(detail)} · сезон ${year}${detail.assigned_coach_name ? ` · ${detail.assigned_coach_name}` : ""}`
            : "Зареждане…"
        }
        actions={
          <Link to="/coach/bvf-card-indexes">
            <Button variant="secondary">← Към списъка</Button>
          </Link>
        }
      />

      {loading && !detail ? (
        <Card>
          <p className="uiMuted">Зареждане на състава…</p>
        </Card>
      ) : null}

      {!loading && !detail ? (
        <EmptyState title="Отборът не е намерен" description="Върни се към списъка с картотечни отбори." />
      ) : null}

      {detail ? (
        <>
          <Card title="Състезатели в отбора">
            {(detail.members || []).length ? (
              <div className="cardIndexRoster">
                <table className="uiTable">
                  <thead>
                    <tr>
                      <th>Име</th>
                      <th>Година</th>
                      <th>Отбори</th>
                      <th>БФВ №</th>
                      <th>Форма 03</th>
                      <th>Готов</th>
                      <th>Липси</th>
                      {detail.can_edit ? <th></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((m) => (
                      <tr key={m.athlete_id}>
                        <td data-label="Име" style={{ fontWeight: 600 }}>
                          {m.athlete_name}
                        </td>
                        <td data-label="Година">{m.birth_year || "—"}</td>
                        <td data-label="Отбори">{teamsCell(m, detail)}</td>
                        <td data-label="БФВ №">{m.bvf_player_number || m.bvf_player_id}</td>
                        <td data-label="Форма 03">{m.has_form_03 ? "✓" : "○"}</td>
                        <td data-label="Готов">{m.ready ? "✓" : "○"}</td>
                        <td data-label="Липси" style={{ fontSize: 12, color: "#92400e" }}>
                          {memberMissing(m, year, detail)}
                        </td>
                        {detail.can_edit ? (
                          <td data-label=" ">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => removeAthlete(m.athlete_id, m.athlete_name)}
                            >
                              Премахни
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Съставът е празен"
                description="Добави състезатели през търсачката по-долу. Записът към СЕК е следваща стъпка за главния треньор."
              />
            )}
          </Card>

          {detail.can_edit ? (
            <Card title="Нов състав">
              <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
                {detail.age_rule_hint ||
                  ageRuleHint(year, detail.age, detail.age_group)}
              </p>
              <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
                Към СЕК се праща по-късно от главния треньор. Нужна е и подписана Форма 03 / 03-А / 03-B за {year}.
              </p>

              <div style={{ position: "relative", maxWidth: 560 }}>
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Търси състезател…"
                  autoComplete="off"
                />

                {showSearchDropdown ? (
                  <div
                    role="listbox"
                    style={{
                      marginTop: 8,
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      background: "#fff",
                      maxHeight: 320,
                      overflow: "auto",
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                    }}
                  >
                    {filteredAthletes.length === 0 ? (
                      <p className="uiMuted" style={{ margin: 0, padding: 12, fontSize: 13 }}>
                        Няма съвпадение при текущото търсене.
                      </p>
                    ) : (
                      filteredAthletes.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          role="option"
                          disabled={busy}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addAthlete(a.id)}
                          style={{
                            display: "flex",
                            width: "100%",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            textAlign: "left",
                            border: "none",
                            borderBottom: "1px solid #f1f5f9",
                            background: "transparent",
                            padding: "10px 12px",
                            cursor: busy ? "wait" : "pointer",
                          }}
                        >
                          <span>
                            <div style={{ fontWeight: 650, fontSize: 14 }}>{a.athlete_name}</div>
                            <div className="uiMuted" style={{ fontSize: 12, marginTop: 2 }}>
                              СЕК: {a.bvf_player_number || a.bvf_player_id}
                              {a.birth_year != null ? ` · ${a.birth_year}` : ""}
                              {a.natural_age_label ? ` · ${a.natural_age_label}` : ""}
                              {(a.team_labels || []).length
                                ? ` · ${(a.team_labels || []).join(", ")}`
                                : Number(a.teams_count) > 0
                                  ? ` · ${a.teams_count} отб.`
                                  : ""}
                            </div>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#166534", flexShrink: 0 }}>
                            Добави
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              {eligibleLoading ? (
                <p className="uiMuted" style={{ fontSize: 13, marginBottom: 0, marginTop: 12 }}>
                  Зареждане на допустими състезатели…
                </p>
              ) : availableAthletes.length === 0 ? (
                <p className="uiMuted" style={{ fontSize: 13, marginBottom: 0, marginTop: 12 }}>
                  Няма свободни състезатели за този отбор (пол/възраст + подписана Форма 03).
                </p>
              ) : !searchOpen ? (
                <p className="uiMuted" style={{ fontSize: 13, marginBottom: 0, marginTop: 12 }}>
                  {availableAthletes.length} допустими — кликни в полето, за да ги видиш.
                </p>
              ) : null}
            </Card>
          ) : (
            <Card>
              <p style={{ color: "#166534", fontSize: 13, margin: 0 }}>Съставът е заключен за редакция.</p>
            </Card>
          )}

          {!isHead && detail.can_request_head ? (
            <Card title="Заявка към главния треньор">
              <Input
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="Бележка (по желание)"
                style={{ marginBottom: 8 }}
              />
              <Button type="button" disabled={busy} onClick={requestHead}>
                Изпрати заявка за картотекиране
              </Button>
            </Card>
          ) : null}

          {isHead && !detail.is_signed && detail.status !== "signed" && detail.status !== "pending_bvf_sign" ? (
            <Card title="Запис в СЕК (главен треньор)">
              <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
                {detail.status === "ready_for_head"
                  ? "Има заявка от треньора. Без write ApiKey записът остава готов при нас."
                  : "Можеш да запишеш директно, ако съставът е готов (или да изчакаш заявка)."}
              </p>
              {!permanent ? (
                <textarea
                  className="uiInput"
                  rows={2}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="БФВ token (временно)"
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", marginBottom: 8 }}
                />
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button type="button" disabled={busy || !detail.all_ready} onClick={submitToBvf}>
                  Запиши в СЕК / изпрати към БФВ
                </Button>
                {detail.status === "ready_for_head" ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={reopen}>
                    Върни на треньора
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
