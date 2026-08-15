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
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const [requestNote, setRequestNote] = useState("");

  const year = detail?.year || new Date().getFullYear();

  const memberIds = useMemo(
    () => new Set((detail?.members || []).map((m) => m.athlete_id)),
    [detail],
  );

  const availableAthletes = useMemo(
    () => eligible.filter((a) => !memberIds.has(a.id)),
    [eligible, memberIds],
  );

  const filteredAthletes = useMemo(
    () => filterFeesAthletes(availableAthletes, search),
    [availableAthletes, search],
  );

  const showSearchDropdown = searchOpen && detail?.can_edit && availableAthletes.length > 0;

  const loadAll = useCallback(async () => {
    if (!localId) return;
    setLoading(true);
    try {
      const res = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_DETAIL(localId));
      setDetail(res.data);
      const elig = await axiosInstance.get(API_PATHS.BVF_ADMIN_CARD_INDEXES_ELIGIBLE, {
        params: {
          season_year: Number(res.data?.year || new Date().getFullYear()),
          require_form_03: true,
          local_id: Number(localId),
        },
      });
      setEligible(elig.data?.athletes || []);
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
      setLoading(false);
    }
  }, [localId, navigate, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPickedId(null);
  }, [search]);

  const addPicked = async () => {
    if (!pickedId) {
      toast.error("Избери състезател от резултатите.");
      return;
    }
    try {
      setBusy(true);
      const res = await axiosInstance.post(API_PATHS.BVF_ADMIN_CARD_INDEX_LOCAL_ADD(localId), {
        athlete_ids: [pickedId],
      });
      toast.success(`Добавени: ${res.data?.added || 0}`);
      if (res.data?.errors?.length) toast.error(res.data.errors.slice(0, 3).join("; "));
      setSearch("");
      setPickedId(null);
      await loadAll();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно добавяне."));
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
      await loadAll();
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
      await loadAll();
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
      await loadAll();
    } catch (err) {
      toast.error(normalizeError(err, "Записът в СЕК чака write token или връзка с БФВ."));
      await loadAll();
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
              <div style={{ overflowX: "auto" }}>
                <table className="uiTable">
                  <thead>
                    <tr>
                      <th>Име</th>
                      <th>БФВ №</th>
                      <th>Форма 03</th>
                      <th>Готов</th>
                      <th>Липси</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((m) => (
                      <tr key={m.athlete_id}>
                        <td style={{ fontWeight: 600 }}>{m.athlete_name}</td>
                        <td>{m.bvf_player_number || m.bvf_player_id}</td>
                        <td>{m.has_form_03 ? "✓" : "○"}</td>
                        <td>{m.ready ? "✓" : "○"}</td>
                        <td style={{ fontSize: 12, color: "#92400e" }}>
                          {(m.checklist || [])
                            .filter((c) => !c.ok && c.key !== "any_doc")
                            .map((c) => c.label)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Няма намерени резултати"
                description="Добави състезатели през търсачката по-долу — само с пол/възраст и Форма 03."
              />
            )}
          </Card>

          {detail.can_edit ? (
            <Card title="Нов състав">
              <p className="uiMuted" style={{ marginTop: 0, fontSize: 13 }}>
                Търси състезатели, които отговарят на критериите по наредба (пол/възраст на отбора +
                подписана Форма 03 / 03-А за {year}).
              </p>

              <div style={{ position: "relative", maxWidth: 520 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Търси състезател</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      onBlur={() => {
                        // Delay so option click registers before list closes.
                        window.setTimeout(() => setSearchOpen(false), 150);
                      }}
                      placeholder="Търси състезател…"
                      style={{ flex: "1 1 240px" }}
                      autoComplete="off"
                    />
                    <Button type="button" disabled={busy || !pickedId} onClick={addPicked}>
                      Добави
                    </Button>
                  </div>
                </label>

                {showSearchDropdown ? (
                  <div
                    role="listbox"
                    style={{
                      marginTop: 8,
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      background: "#fff",
                      maxHeight: 280,
                      overflow: "auto",
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                    }}
                  >
                    {filteredAthletes.length === 0 ? (
                      <p className="uiMuted" style={{ margin: 0, padding: 12, fontSize: 13 }}>
                        Няма съвпадение при текущото търсене.
                      </p>
                    ) : (
                      filteredAthletes.map((a) => {
                        const active = pickedId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPickedId(a.id);
                              setSearch(a.athlete_name || "");
                              setSearchOpen(false);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              border: "none",
                              borderBottom: "1px solid #f1f5f9",
                              background: active ? "#ecfdf5" : "transparent",
                              padding: "10px 12px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ fontWeight: 650, fontSize: 14 }}>{a.athlete_name}</div>
                            <div className="uiMuted" style={{ fontSize: 12, marginTop: 2 }}>
                              СЕК: {a.bvf_player_number || a.bvf_player_id}
                              {a.birth_year != null ? ` · ${a.birth_year}` : ""}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>

              {availableAthletes.length === 0 ? (
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
