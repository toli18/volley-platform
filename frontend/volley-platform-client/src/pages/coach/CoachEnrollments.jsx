import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { normalizeError } from "../../utils/normalizeError";
import useNavRoles from "../../navigation/useNavRoles";
import { useToast } from "../../components/ToastProvider";
import { Button } from "../../components/ui";

const STATUS_LABEL = {
  new: "Нова",
  trial_scheduled: "Пробна записана",
  accepted: "Приета",
  declined: "Отказана",
  cancelled: "Отменена",
};

function formatTrial(row) {
  if (!row.trial_date) return null;
  return `${row.trial_date}${row.trial_time ? ` · ${row.trial_time}` : ""}`;
}

export default function CoachEnrollments() {
  const toast = useToast();
  const { isHeadCoachUser } = useNavRoles();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [teams, setTeams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("trial_scheduled");
  const [acceptTeam, setAcceptTeam] = useState({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = filter ? { status: filter } : {};
      const [enr, tRes] = await Promise.all([
        axiosInstance.get(API_PATHS.CLUB_ENROLLMENTS, { params }),
        axiosInstance.get(API_PATHS.TEAMS_LIST),
      ]);
      setItems(Array.isArray(enr.data?.items) ? enr.data.items : []);
      setCounts(enr.data?.counts || {});
      setTeams(Array.isArray(tRes.data) ? tRes.data : []);
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно зареждане."));
    } finally {
      setBusy(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (row) => {
    const teamId = Number(acceptTeam[row.id] || row.preferred_team_id || 0);
    if (!teamId) {
      toast.error("Избери тренировъчна група.");
      return;
    }
    try {
      const res = await axiosInstance.post(API_PATHS.CLUB_ENROLLMENT_ACCEPT(row.id), {
        team_id: teamId,
        child_gender: row.child_gender || null,
      });
      toast.success(res.data?.message || "Прието.");
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно приемане."));
    }
  };

  const decline = async (id) => {
    try {
      await axiosInstance.post(API_PATHS.CLUB_ENROLLMENT_DECLINE(id));
      toast.success("Заявката е отказана.");
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешен отказ."));
    }
  };

  return (
    <div className="coachMobilePage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Записвания</h2>
        <span className="feesCoachHeadBadge">{(counts.new || 0) + (counts.trial_scheduled || 0)}</span>
      </header>

      <p className="coachMobileMuted" style={{ marginTop: 0 }}>
        Родителят сам избира група и дата за пробна. След пробната приеми детето — после сподели вход от
        профила на състезателя.
        {isHeadCoachUser ? (
          <>
            {" "}
            Публичната страница: <Link to="/coach/club-profile">Профил на клуба</Link>.
          </>
        ) : null}
      </p>

      <div className="coachMobileSubNav" style={{ marginBottom: 12 }}>
        {[
          { id: "trial_scheduled", label: `Пробни (${counts.trial_scheduled || 0})` },
          { id: "new", label: `Нови (${counts.new || 0})` },
          { id: "accepted", label: "Приети" },
          { id: "", label: "Всички" },
        ].map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            className={`coachMobileSubNavBtn${filter === f.id ? " is-active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {busy ? <p className="coachMobileMuted">Зареждане…</p> : null}
      {!busy && items.length === 0 ? <p className="coachMobileMuted">Няма заявки.</p> : null}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {items.map((row) => (
          <li
            key={row.id}
            style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>
                {row.child_first_name} {row.child_last_name || ""} · {row.child_birth_year}
              </strong>
              <span className="coachMobileMuted">{STATUS_LABEL[row.status] || row.status}</span>
            </div>
            {formatTrial(row) ? (
              <p style={{ margin: "8px 0 0", fontWeight: 700, color: "#0f766e" }}>
                Пробна: {formatTrial(row)}
                {row.preferred_team_name ? ` · ${row.preferred_team_name}` : ""}
              </p>
            ) : null}
            <div className="coachMobileMuted" style={{ marginTop: 4 }}>
              Родител: {row.parent_name} · {row.parent_phone}
            </div>
            {row.note ? <p style={{ margin: "6px 0 0", fontSize: 13 }}>{row.note}</p> : null}

            {row.status === "accepted" && row.athlete_id ? (
              <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                Състезател #{row.athlete_id}
                {row.accepted_team_name ? ` · ${row.accepted_team_name}` : ""}.{" "}
                <Link to={row.athlete_profile_path || `/coach/athletes/${row.athlete_id}`}>
                  Профил — сподели родителски вход
                </Link>
              </p>
            ) : null}

            {row.status === "new" || row.status === "trial_scheduled" ? (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <select
                  value={acceptTeam[row.id] || row.preferred_team_id || ""}
                  onChange={(e) => setAcceptTeam((p) => ({ ...p, [row.id]: e.target.value }))}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                >
                  <option value="">Група за прием</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={() => accept(row)}>
                  Приеми след пробна
                </Button>
                <Button size="sm" variant="secondary" onClick={() => decline(row.id)}>
                  Откажи
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
