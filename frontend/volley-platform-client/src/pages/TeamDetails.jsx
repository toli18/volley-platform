import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

const genderSuffix = (g) => {
  if (g === "male") return " · М";
  if (g === "female") return " · Ж";
  return "";
};

const teamGenderLabel = (g) => {
  if (g === "male") return "Мъжки";
  if (g === "female") return "Женски";
  return "—";
};

const normalizeError = (err, fallback = "Грешка при работа с отбора.") => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default function TeamDetails() {
  const { teamId } = useParams();
  const toast = useToast();
  const { user } = useAuth();

  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [memberAthletes, setMemberAthletes] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [coaches, setCoaches] = useState([]);

  const [payAthlete, setPayAthlete] = useState(null);
  const [payForm, setPayForm] = useState({ month_key: new Date().toISOString().slice(0, 7), amount: "", note: "" });

  const teamIdNum = Number(teamId);
  const isHeadCoach = user?.role === "club_head_coach";
  const currentUserId = Number(user?.id || 0);

  const loadTeam = async () => {
    const res = await axiosInstance.get(API_PATHS.TEAMS_LIST);
    const list = (Array.isArray(res.data) ? res.data : []).filter((t) => {
      if (isHeadCoach) return true;
      return Number(t?.coach_id) === currentUserId;
    });
    const found = list.find((x) => x.id === teamIdNum) || null;
    setTeam(found);
  };

  const loadAthletes = async () => {
    const res = await axiosInstance.get(API_PATHS.FEES_ATHLETES_LIST);
    const list = Array.isArray(res.data) ? res.data : [];
    setAthletes(isHeadCoach ? list : list.filter((a) => Number(a?.coach_id) === currentUserId));
  };

  const loadCoaches = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.FEES_COACHES_LIST);
      setCoaches(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCoaches([]);
    }
  };

  const coachNameById = useMemo(() => {
    const map = new Map();
    for (const c of coaches) {
      if (c?.id != null) map.set(Number(c.id), c.name || `#${c.id}`);
    }
    return map;
  }, [coaches]);

  const feeCoachLabel = (coachId) => coachNameById.get(Number(coachId)) || `треньор #${coachId}`;

  const canRecordFee = (athleteCoachId) => isHeadCoach || Number(athleteCoachId) === currentUserId;

  const isTeamCoach = Number(team?.coach_id) === currentUserId;

  const canManageRoster = useMemo(() => {
    if (isHeadCoach) return true;
    if (!isTeamCoach) return false;
    return athletes.length > 0;
  }, [isHeadCoach, isTeamCoach, athletes.length]);

  const canRemoveMember = (feeCoachId) =>
    isHeadCoach || (isTeamCoach && Number(feeCoachId) === currentUserId);

  const loadMembers = async () => {
    if (!teamIdNum) return;
    const res = await axiosInstance.get(API_PATHS.TEAM_MEMBERS_GET(teamIdNum));
    const members = Array.isArray(res.data?.members) ? res.data.members : [];
    setMemberAthletes(members);
    setMemberIds(members.map((m) => m.athlete_id));
  };

  useEffect(() => {
    const run = async () => {
      try {
        setBusy(true);
        await Promise.all([loadTeam(), loadAthletes(), loadMembers(), loadCoaches()]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [teamIdNum, isHeadCoach, currentUserId]);

  const nonMembers = useMemo(() => {
    const teamGender = team?.gender;
    return athletes.filter((a) => {
      if (memberIds.includes(a.id)) return false;
      if (teamGender === "male" || teamGender === "female") {
        return a?.gender === teamGender;
      }
      return true;
    });
  }, [athletes, memberIds, team?.gender]);
  const visibleCandidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return nonMembers;
    return nonMembers.filter((a) => {
      const haystack = [
        a?.athlete_name,
        a?.parent_name,
        a?.athlete_phone,
        a?.parent_phone,
        a?.birth_year,
        a?.gender,
        a?.gender === "male" ? "мъж m" : "",
        a?.gender === "female" ? "жена f" : "",
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [nonMembers, memberSearch]);

  const saveMembers = async (ids) => {
    try {
      setBusy(true);
      await axiosInstance.put(API_PATHS.TEAM_MEMBERS_SET(teamIdNum), { athlete_ids: ids });
      await loadMembers();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване на състава."));
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (athleteId) => {
    const next = [...new Set([...memberIds, athleteId])];
    await saveMembers(next);
    setMemberSearch("");
    toast.success("Състезателят е добавен в отбора.");
  };

  const removeMember = async (athleteId) => {
    const next = memberIds.filter((id) => id !== athleteId);
    await saveMembers(next);
    toast.success("Състезателят е премахнат от отбора.");
  };

  const saveMemberFee = async () => {
    if (!payAthlete) return;
    const amount = Number(payForm.amount);
    if (!payForm.month_key || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Въведи валиден месец и сума.");
      return;
    }
    try {
      setBusy(true);
      await axiosInstance.post(API_PATHS.FEES_PAYMENT_SAVE(payAthlete.athlete_id), {
        month_key: payForm.month_key,
        amount,
        note: payForm.note?.trim() || null,
      });
      toast.success("Таксата е записана.");
      setPayAthlete(null);
      setPayForm((p) => ({ ...p, amount: "", note: "" }));
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при запис на такса."));
    } finally {
      setBusy(false);
    }
  };

  if (!team) {
    return (
      <div className="uiPage">
        <PageHero title="Отбор" subtitle="Отборът не е намерен или нямаш достъп." actions={<Link to="/teams"><Button variant="secondary">Назад</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="uiPage">
      <PageHero
        title={`Отбор: ${team.name}`}
        subtitle={`Отделен екран за състезатели и такси · Тип: ${teamGenderLabel(team.gender)}`}
        actions={
          <div className="heroActionsWrap">
            <Link to={`/teams/${teamIdNum}/attendance`}>
              <Button>Присъствие</Button>
            </Link>
            <Link to={`/teams/${teamIdNum}/report`}>
              <Button variant="secondary">Отчет</Button>
            </Link>
            <Link to="/teams">
              <Button variant="secondary">Назад към Отбори</Button>
            </Link>
          </div>
        }
      />

      {(isHeadCoach || isTeamCoach) && (
        <p className="uiHint" style={{ margin: 0 }}>
          Един състезател може да е в няколко отбора. Таксите се водят при един треньор (Месечни такси → Прехвърли).
          {isHeadCoach && " Главният треньор управлява състава на всеки отбор."}
          {canManageRoster && !isHeadCoach && " Можеш да добавяш и махаш само състезатели, които плащат при теб."}
          {isTeamCoach && !canManageRoster &&
            " Състезатели, добавени от главния треньор при друг треньор по такси — можеш само да водиш присъствие."}
        </p>
      )}

      <Card title="Състезатели в отбора">
        {(memberAthletes || []).length === 0 ? (
          <EmptyState
            title="Няма добавени състезатели"
            description={
              canManageRoster
                ? "Добави състезатели от търсачката по-долу."
                : "Съставът се попълва от главния треньор или от треньора по месечните такси."
            }
          />
        ) : (
          <>
            <div className="teamMembersDesktop">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Състезател</TableHead>
                    <TableHead>Родител</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Профил</TableHead>
                    <TableHead>Такса</TableHead>
                    {canManageRoster && <TableHead>Премахни</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberAthletes.map((a) => {
                    const feeCoachId = a.fee_coach_id ?? athletes.find((x) => x.id === a.athlete_id)?.coach_id;
                    return (
                    <TableRow key={a.athlete_id}>
                      <TableCell>
                        <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`} style={{ fontWeight: 700 }}>
                          {a.athlete_name}
                          {genderSuffix(a.gender)}
                        </Link>
                        {feeCoachId != null && Number(feeCoachId) !== currentUserId && (
                          <span className="uiMuted" style={{ fontSize: 12, display: "block", marginTop: 2 }}>
                            Такси: {feeCoachLabel(feeCoachId)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{a.parent_name || "-"}</TableCell>
                      <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                      <TableCell>
                        <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`}>
                          <Button size="sm" variant="ghost">Отвори</Button>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {canRecordFee(feeCoachId) ? (
                          <Button size="sm" onClick={() => setPayAthlete({ ...a, coach_id: feeCoachId })}>Плати такса</Button>
                        ) : (
                          <span className="uiMuted" style={{ fontSize: 12 }}>Такси при {feeCoachLabel(feeCoachId)}</span>
                        )}
                      </TableCell>
                      {canManageRoster && canRemoveMember(feeCoachId) && (
                        <TableCell>
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => removeMember(a.athlete_id)}>Премахни</Button>
                        </TableCell>
                      )}
                      {canManageRoster && !canRemoveMember(feeCoachId) && (
                        <TableCell>
                          <span className="uiMuted" style={{ fontSize: 12 }}>Само присъствие</span>
                        </TableCell>
                      )}
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="teamMembersMobile">
              {memberAthletes.map((a) => (
                <article key={`m-${a.athlete_id}`} className="teamMembersCard">
                  <div className="teamMembersCardTop">
                    <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`} style={{ fontWeight: 800 }}>
                      {a.athlete_name}
                      {genderSuffix(a.gender)}
                    </Link>
                    <span className="uiBadge">{a.parent_phone || a.athlete_phone || "няма телефон"}</span>
                  </div>
                  <div className="teamMembersMeta">Родител: {a.parent_name || "няма данни"}</div>
                  <div className="teamMembersActions">
                    <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`}>
                      <Button size="sm" variant="ghost">Профил</Button>
                    </Link>
                    {canRecordFee(a.fee_coach_id ?? athletes.find((x) => x.id === a.athlete_id)?.coach_id) ? (
                      <Button size="sm" onClick={() => setPayAthlete(a)}>Плати такса</Button>
                    ) : null}
                    {canManageRoster && canRemoveMember(a.fee_coach_id ?? athletes.find((x) => x.id === a.athlete_id)?.coach_id) && (
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => removeMember(a.athlete_id)}>Премахни</Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>

      {isTeamCoach && !canManageRoster && (memberAthletes || []).length > 0 && (
        <p className="uiHint">
          В този отбор има състезатели, добавени от главния треньор. Можеш да водиш присъствие; премахване — само от главния или от треньора по таксите.
        </p>
      )}

      {canManageRoster && (
      <Card title="Добави състезател (име или година)">
        {!isHeadCoach && (
          <p className="uiMuted" style={{ margin: "0 0 10px", fontSize: 13 }}>
            Показани са състезателите, които плащат месечната си такса при теб. Можеш да ги разпределяш в своите отбори.
          </p>
        )}
        <Input
          placeholder="Търси по име или година на раждане (напр. 2012)"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
        <div style={{ marginTop: 10 }}>
          {visibleCandidates.length === 0 ? (
            <EmptyState
              title={memberSearch.trim() ? "Няма резултати" : "Няма свободни състезатели"}
              description={
                memberSearch.trim()
                  ? "Няма свободни състезатели с това име/година и съответен пол."
                  : "Всички налични състезатели със съответния пол вече са добавени в отбора."
              }
            />
          ) : (
            <>
              <div className="teamCandidatesDesktop">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Състезател</TableHead>
                      <TableHead>Родител</TableHead>
                      <TableHead>Телефон</TableHead>
                      {isHeadCoach && <TableHead>Такси при</TableHead>}
                      <TableHead>Добави</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCandidates.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          {a.athlete_name}
                          {genderSuffix(a.gender)}
                        </TableCell>
                        <TableCell>{a.parent_name || "-"}</TableCell>
                        <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                        {isHeadCoach && <TableCell>{feeCoachLabel(a.coach_id)}</TableCell>}
                        <TableCell>
                          <Button size="sm" disabled={busy} onClick={() => addMember(a.id)}>Добави</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="teamCandidatesMobile">
                {visibleCandidates.map((a) => (
                  <article key={`c-${a.id}`} className="teamCandidatesCard">
                    <div style={{ fontWeight: 800 }}>
                      {a.athlete_name}
                      {genderSuffix(a.gender)}
                    </div>
                    <div className="teamMembersMeta">Родител: {a.parent_name || "няма данни"}</div>
                    <div className="teamMembersMeta">Телефон: {a.parent_phone || a.athlete_phone || "няма данни"}</div>
                    <div className="teamMembersMeta">Такси: {feeCoachLabel(a.coach_id)}</div>
                    <Button size="sm" disabled={busy} onClick={() => addMember(a.id)}>Добави</Button>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>
      )}

      {payAthlete && (
        <div onClick={() => !busy && setPayAthlete(null)} className="uiModalOverlay">
          <section onClick={(e) => e.stopPropagation()} className="uiModal uiModal--compact">
            <h3 className="uiModalTitle">Такса: {payAthlete.athlete_name}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Input type="month" value={payForm.month_key} onChange={(e) => setPayForm((p) => ({ ...p, month_key: e.target.value }))} />
              <Input type="number" step="0.01" placeholder="Сума" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />
              <Input placeholder="Бележка" value={payForm.note} onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))} />
              <div className="uiModalActions">
                <Button disabled={busy} onClick={saveMemberFee}>Запиши такса</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setPayAthlete(null)}>Отказ</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
