import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { Card, EmptyState } from "../components/ui";

const MONTHS_BG = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusBadgeClass = (value) => {
  if (value === "present") return "uiBadge--success";
  if (value === "late") return "uiBadge--warning";
  if (value === "absent") return "uiBadge--danger";
  if (value === "excused") return "uiBadge--secondary";
  return "uiBadge--secondary";
};

const formatMonthKey = (mk) => {
  if (!mk || !String(mk).includes("-")) return mk || "—";
  const [y, m] = String(mk).split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return mk;
  return `${MONTHS_BG[mi]} ${y}`;
};

const formatDateBg = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return iso;
  }
};

const formatShortDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
};

function ParentPortalShell({ children }) {
  return (
    <div className="parentPortalShell">
      <header className="parentPortalHeader">
        <div className="parentPortalHeaderInner">
          <img src="/bfvb-logo.png" alt="БФВ" className="parentPortalLogo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div>
            <div className="parentPortalBrand">Volley Coach Platform</div>
            <div className="parentPortalBrandSub">Родителски профил</div>
          </div>
        </div>
      </header>
      <main className="parentPortalMain">{children}</main>
      <footer className="parentPortalFooter">
        <span>Българска федерация по волейбол</span>
      </footer>
    </div>
  );
}

function ScheduleSessionCard({ row }) {
  return (
    <article className="parentPortalSessionCard">
      <div className="parentPortalSessionCardDate">{formatShortDate(row.date)}</div>
      <div className="parentPortalSessionCardBody">
        <div className="parentPortalSessionCardTime">
          {row.start_time} – {row.end_time}
        </div>
        {row.team_name ? <div className="parentPortalSessionCardMeta">Отбор: {row.team_name}</div> : null}
        {row.location ? <div className="parentPortalSessionCardMeta">Зала: {row.location}</div> : null}
      </div>
    </article>
  );
}

export default function ParentPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.PARENT_PORTAL_GET(token));
        if (!cancelled) setProfile(res.data || null);
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Линкът е невалиден или изтекъл.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const scheduleByTeam = useMemo(() => {
    const groups = new Map();
    for (const row of profile?.monthly_schedule || []) {
      const key = row.team_name || "Отбор";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()];
  }, [profile?.monthly_schedule]);

  const useGroupedSchedule = (profile?.teams?.length || 0) > 1 || scheduleByTeam.length > 1;

  const feeCoach = profile?.fee_coach || {};
  const currentFee = profile?.current_month_fee;
  const next = profile?.next_training;
  const summary = profile?.attendance_summary;

  return (
    <ParentPortalShell>
      <div className="parentPortalPage">
        <header className="parentPortalHero">
          <h1 className="parentPortalHeroTitle">
            {profile ? profile.athlete_name : "Родителски профил"}
          </h1>
          <p className="parentPortalHeroSub">
            Присъствие, график и месечни такси
          </p>
        </header>

        {loading ? (
          <Card title="Зареждане..."><p>Моля, изчакай...</p></Card>
        ) : null}

        {!loading && error ? (
          <EmptyState title="Достъпът е отказан" description={error} />
        ) : null}

        {!loading && !error && profile ? (
          <>
            <div className="parentPortalHighlightGrid">
              <section className="parentPortalHighlightCard parentPortalHighlightCard--schedule">
                <h2 className="parentPortalHighlightTitle">Следваща тренировка</h2>
                {next ? (
                  <>
                    <p className="parentPortalHighlightMain">{formatDateBg(next.date)}</p>
                    <p className="parentPortalHighlightDetail">
                      {next.start_time} – {next.end_time}
                      {next.team_name ? ` · ${next.team_name}` : ""}
                    </p>
                    {next.location ? (
                      <p className="parentPortalHighlightDetail">Зала: {next.location}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="parentPortalHighlightMuted">Няма предстояща тренировка в следващите седмици.</p>
                )}
              </section>

              <section className={`parentPortalHighlightCard ${currentFee?.paid ? "parentPortalHighlightCard--paid" : "parentPortalHighlightCard--unpaid"}`}>
                <h2 className="parentPortalHighlightTitle">Такса — {formatMonthKey(currentFee?.month_key)}</h2>
                {currentFee?.paid ? (
                  <>
                    <p className="parentPortalHighlightMain">Платена</p>
                    <p className="parentPortalHighlightDetail">
                      {Number(currentFee.amount || 0).toFixed(2)} лв.
                      {currentFee.paid_at
                        ? ` · ${new Date(currentFee.paid_at).toLocaleDateString("bg-BG")}`
                        : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="parentPortalHighlightMain">Неплатена</p>
                    <p className="parentPortalHighlightDetail">
                      Свържете се с треньора за уточняване на сумата и плащането.
                    </p>
                  </>
                )}
                {(feeCoach.name || feeCoach.email || feeCoach.club_phone) ? (
                  <div className="parentPortalContactBox">
                    <div className="parentPortalContactLabel">Контакт</div>
                    {feeCoach.name ? <div>{feeCoach.name}</div> : null}
                    {feeCoach.email ? (
                      <a href={`mailto:${feeCoach.email}`} className="parentPortalContactLink">{feeCoach.email}</a>
                    ) : null}
                    {feeCoach.club_name ? <div className="parentPortalHighlightMuted">{feeCoach.club_name}</div> : null}
                    {feeCoach.club_phone ? (
                      <a href={`tel:${feeCoach.club_phone}`} className="parentPortalContactLink">{feeCoach.club_phone}</a>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            <Card title="Обща информация">
              <div className="parentPortalInfoGrid">
                {profile.birth_year ? (
                  <span className="uiBadge">Година на раждане: {profile.birth_year}</span>
                ) : null}
                {(profile.teams || []).map((t) => (
                  <span key={t} className="uiBadge uiBadge--info">Отбор: {t}</span>
                ))}
                {!(profile.teams || []).length ? (
                  <span className="uiBadge">Няма активни отбори</span>
                ) : null}
                {profile.parent_name ? (
                  <span className="uiBadge">Родител: {profile.parent_name}</span>
                ) : null}
                {profile.parent_phone ? (
                  <span className="uiBadge">Телефон: {profile.parent_phone}</span>
                ) : null}
              </div>
              {(profile.teams || []).length > 1 ? (
                <p className="uiHint" style={{ marginTop: 10, marginBottom: 0 }}>
                  Състезателят тренира в няколко групи — вижте графика по отбор по-долу.
                </p>
              ) : null}
            </Card>

            <Card title="Присъствие">
              <div className="parentPortalBadgeRow">
                <span className="uiBadge uiBadge--success">Присъства: {summary?.present || 0}</span>
                <span className="uiBadge uiBadge--warning">Закъсня: {summary?.late || 0}</span>
                <span className="uiBadge uiBadge--danger">Отсъства: {summary?.absent || 0}</span>
                <span className="uiBadge uiBadge--secondary">Извинен: {summary?.excused || 0}</span>
                <span className="uiBadge uiBadge--info">Процент: {summary?.attendance_rate_percent || 0}%</span>
              </div>
              {!summary?.total ? (
                <p className="parentPortalHighlightMuted" style={{ marginTop: 12 }}>
                  Още няма маркирани тренировки — процентът ще се появи след първото присъствие.
                </p>
              ) : null}
              {(profile.last_attendance || []).length === 0 ? (
                <EmptyState title="Няма записани присъствия" description="Ще се показват след маркиране от треньора." />
              ) : (
                <div className="parentPortalCardList">
                  {(profile.last_attendance || []).map((row, idx) => (
                    <article key={`${row.date}-${idx}`} className="parentPortalSessionCard">
                      <div className="parentPortalSessionCardDate">{formatShortDate(row.date)}</div>
                      <div className="parentPortalSessionCardBody">
                        {row.team_name ? <div className="parentPortalSessionCardMeta">{row.team_name}</div> : null}
                        <span className={`uiBadge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`График — ${formatMonthKey(new Date().toISOString().slice(0, 7))}`}>
              {(profile.monthly_schedule || []).length === 0 ? (
                <EmptyState title="Няма тренировки за този месец" description="Когато треньорът добави график, ще го виждате тук." />
              ) : useGroupedSchedule ? (
                scheduleByTeam.map(([teamName, rows]) => (
                  <section key={teamName} className="parentPortalTeamSection">
                    <h3 className="parentPortalTeamSectionTitle">{teamName}</h3>
                    <div className="parentPortalCardList">
                      {rows.map((row, idx) => (
                        <ScheduleSessionCard key={`${row.date}-${row.start_time}-${idx}`} row={row} />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="parentPortalCardList">
                  {(profile.monthly_schedule || []).map((row, idx) => (
                    <ScheduleSessionCard key={`${row.date}-${row.start_time}-${idx}`} row={row} />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Такси (последни 12 месеца)">
              <div className="parentPortalDesktopTable parentPortalTableWrap">
                <table className="parentPortalTable">
                  <thead>
                    <tr>
                      <th>Месец</th>
                      <th>Сума</th>
                      <th>Платено</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profile.monthly_payments || []).map((row) => (
                      <tr key={row.month_key}>
                        <td>{formatMonthKey(row.month_key)}</td>
                        <td>{row.paid ? `${Number(row.amount || 0).toFixed(2)} лв.` : "—"}</td>
                        <td>
                          <span className={`uiBadge ${row.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                            {row.paid ? "Да" : "Не"}
                          </span>
                        </td>
                        <td>{row.paid_at ? new Date(row.paid_at).toLocaleString("bg-BG") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="parentPortalCardList parentPortalMobileOnly">
                {(profile.monthly_payments || []).map((row) => (
                  <article key={row.month_key} className="parentPortalSessionCard">
                    <div className="parentPortalSessionCardDate">{formatMonthKey(row.month_key)}</div>
                    <div className="parentPortalSessionCardBody">
                      <span className={`uiBadge ${row.paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                        {row.paid ? `Платено · ${Number(row.amount || 0).toFixed(2)} лв.` : "Неплатено"}
                      </span>
                      {row.paid_at ? (
                        <div className="parentPortalSessionCardMeta">
                          {new Date(row.paid_at).toLocaleDateString("bg-BG")}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </ParentPortalShell>
  );
}
