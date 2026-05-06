import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, EmptyState, Input, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";

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
    const list = (Array.isArray(res.data) ? res.data : []).filter((a) => {
      if (isHeadCoach) return true;
      return Number(a?.coach_id) === currentUserId;
    });
    setAthletes(list);
  };

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
        await Promise.all([loadTeam(), loadAthletes(), loadMembers()]);
      } catch (err) {
        toast.error(normalizeError(err));
      } finally {
        setBusy(false);
      }
    };
    run();
  }, [teamIdNum, isHeadCoach, currentUserId]);

  const nonMembers = useMemo(() => athletes.filter((a) => !memberIds.includes(a.id)), [athletes, memberIds]);
  const visibleCandidates = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return nonMembers;
    return nonMembers.filter((a) => String(a.athlete_name || "").toLowerCase().includes(q));
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
        subtitle="Отделен екран за състезатели и такси."
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

      <Card title="Състезатели в отбора">
        {(memberAthletes || []).length === 0 ? (
          <EmptyState title="Няма добавени състезатели" description="Добави състезатели от търсачката по-долу." />
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
                    <TableHead>Премахни</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberAthletes.map((a) => (
                    <TableRow key={a.athlete_id}>
                      <TableCell>
                        <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`} style={{ fontWeight: 700 }}>
                          {a.athlete_name}
                        </Link>
                      </TableCell>
                      <TableCell>{a.parent_name || "-"}</TableCell>
                      <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                      <TableCell>
                        <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`}>
                          <Button size="sm" variant="ghost">Отвори</Button>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => setPayAthlete(a)}>Плати такса</Button>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => removeMember(a.athlete_id)}>Премахни</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="teamMembersMobile">
              {memberAthletes.map((a) => (
                <article key={`m-${a.athlete_id}`} className="teamMembersCard">
                  <div className="teamMembersCardTop">
                    <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`} style={{ fontWeight: 800 }}>
                      {a.athlete_name}
                    </Link>
                    <span className="uiBadge">{a.parent_phone || a.athlete_phone || "няма телефон"}</span>
                  </div>
                  <div className="teamMembersMeta">Родител: {a.parent_name || "няма данни"}</div>
                  <div className="teamMembersActions">
                    <Link to={`/teams/athletes/${a.athlete_id}?from=/teams/${teamIdNum}`}>
                      <Button size="sm" variant="ghost">Профил</Button>
                    </Link>
                    <Button size="sm" onClick={() => setPayAthlete(a)}>Плати такса</Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => removeMember(a.athlete_id)}>Премахни</Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Добави състезател по име">
        <Input
          placeholder="Търси по име на състезател"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
        <div style={{ marginTop: 10 }}>
          {visibleCandidates.length === 0 ? (
            <EmptyState
              title={memberSearch.trim() ? "Няма резултати" : "Няма свободни състезатели"}
              description={memberSearch.trim() ? "Няма свободни състезатели с това име." : "Всички налични състезатели вече са добавени в отбора."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Състезател</TableHead>
                  <TableHead>Родител</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Добави</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCandidates.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.athlete_name}</TableCell>
                    <TableCell>{a.parent_name || "-"}</TableCell>
                    <TableCell>{a.parent_phone || a.athlete_phone || "-"}</TableCell>
                    <TableCell>
                      <Button size="sm" disabled={busy} onClick={() => addMember(a.id)}>Добави</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

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
