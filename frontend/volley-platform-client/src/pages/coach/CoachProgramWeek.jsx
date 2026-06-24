import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState } from "../../components/ui";

function formatShortBg(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

const EXEC_META = {
  done: { label: "проведена", color: "#16a34a" },
  missed: { label: "пропусната", color: "#dc2626" },
  upcoming: { label: "предстояща", color: "#2563eb" },
};

function ExecBadge({ status }) {
  const meta = EXEC_META[status];
  if (!meta) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color: meta.color,
        border: `1px solid ${meta.color}33`,
        background: `${meta.color}11`,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {meta.label}
    </span>
  );
}

function ProgressBand({ progress, weekDone, weekMapped }) {
  if (!progress || !progress.started) return null;
  const rate = progress.rate_pct || 0;
  return (
    <div
      style={{
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        borderRadius: 12,
        padding: "10px 12px",
        margin: "10px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>Сезонен прогрес</strong>
        <span className="coachMobileMuted">Мезо {progress.meso_index}/{progress.total_mesos}</span>
      </div>
      <div
        style={{
          height: 10,
          background: "#e0f2fe",
          borderRadius: 999,
          overflow: "hidden",
          margin: "8px 0 6px",
        }}
      >
        <div style={{ width: `${rate}%`, height: "100%", background: "#0284c7" }} />
      </div>
      <p className="coachMobileMuted" style={{ margin: 0, fontSize: 13 }}>
        Изпълнени {progress.executed} от {progress.planned} тренировки ({rate}%)
        {weekMapped > 0 ? ` · тази седмица: ${weekDone}/${weekMapped} теми` : ""}
      </p>
    </div>
  );
}

function IntensityBadge({ value }) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  let tone = "#2563eb";
  if (v.includes("висок")) tone = "#dc2626";
  else if (v.includes("ниск")) tone = "#16a34a";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color: tone,
        border: `1px solid ${tone}33`,
        background: `${tone}11`,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {value}
    </span>
  );
}

function DayCard({ day }) {
  return (
    <article
      className="coachMobileCard"
      style={{ opacity: day.is_cancelled ? 0.6 : 1 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ textTransform: "capitalize" }}>
          {day.weekday_label || "—"} · {formatShortBg(day.date)}
        </strong>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ExecBadge status={day.execution_status} />
          <IntensityBadge value={day.intensity} />
        </span>
      </div>
      <p className="coachMobileMuted" style={{ margin: "2px 0 6px" }}>
        {day.start_time} – {day.end_time}
        {day.location ? ` · ${day.location}` : ""}
        {day.is_cancelled ? " · отменена" : ""}
      </p>

      {day.has_program_day ? (
        <>
          {day.theme ? (
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{day.theme}</p>
          ) : null}
          {Array.isArray(day.focus) && day.focus.length ? (
            <p className="coachMobileMuted" style={{ margin: "0 0 4px" }}>
              Фокус: {day.focus.join(", ")}
            </p>
          ) : null}
          {day.session_goal ? (
            <p style={{ margin: "0 0 6px", fontSize: 13 }}>{day.session_goal}</p>
          ) : null}
          {day.textbook_slug ? (
            <Link to={`/textbook/${day.textbook_slug}`} className="coachMobileQuickBtn" style={{ display: "inline-block" }}>
              Виж конспекта
            </Link>
          ) : null}
        </>
      ) : (
        <p className="coachMobileMuted" style={{ margin: 0, fontStyle: "italic" }}>
          Свободна тренировка (извън програмните теми)
        </p>
      )}
    </article>
  );
}

export default function CoachProgramWeek() {
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get("team_id");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_PROGRAM_WEEK, {
          params: { week_offset: offset, ...(teamId ? { team_id: teamId } : {}) },
        });
        if (active) setData(res.data);
      } catch (err) {
        const detail = err?.response?.data?.detail;
        if (active) setError(typeof detail === "string" ? detail : "Грешка при зареждане.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [offset, teamId]);

  const w = data?.window;
  const windowLabel = w ? `${formatShortBg(w.from_date)} – ${formatShortBg(w.to_date)}` : "";

  return (
    <div className="coachMobilePage">
      <h2 className="coachMobileSectionTitle coachMobileSectionTitle--flush">
        Моята програмна седмица
      </h2>
      {data?.team_name ? (
        <p className="coachMobileMuted coachMobileGreetingSub">Отбор: {data.team_name}</p>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOffset((o) => o - 1)}>
          ‹ Предишна
        </Button>
        <Button type="button" variant={offset === 0 ? "primary" : "secondary"} size="sm" onClick={() => setOffset(0)}>
          Тази седмица
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOffset((o) => o + 1)}>
          Следваща ›
        </Button>
      </div>
      {windowLabel ? <p className="coachMobileMuted" style={{ marginTop: 0 }}>{windowLabel}</p> : null}

      {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
      {error ? <EmptyState title="Грешка" description={error} /> : null}

      {!loading && !error && data ? (
        !data.has_program ? (
          <EmptyState
            title="Няма активна годишна програма"
            description={data.message || "Стартирайте годишен цикъл за отбора, за да видите програмната седмица."}
          />
        ) : (
          <>
            <ProgressBand progress={data.progress} weekDone={data.week_done} weekMapped={data.week_mapped} />
            <Card padded>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                Мезо {data.meso_index} от {data.total_mesos}
                {data.meso_theme ? ` · ${data.meso_theme}` : ""}
              </p>
              <p className="coachMobileMuted" style={{ margin: "2px 0" }}>
                {data.months_bg ? `${data.months_bg} · ` : ""}
                Седмица {data.week_in_meso} от {data.weeks_per_meso}
                {data.week_theme ? ` · ${data.week_theme}` : ""}
              </p>
              {Array.isArray(data.week_focus) && data.week_focus.length ? (
                <p className="coachMobileMuted" style={{ margin: 0 }}>
                  Седмичен фокус: {data.week_focus.join(", ")}
                  {data.week_load ? ` · натоварване: ${data.week_load}` : ""}
                </p>
              ) : null}
              {data.cycle_title ? (
                <p className="coachMobileMuted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                  {data.cycle_title}
                </p>
              ) : null}
            </Card>

            {data.message ? (
              <p
                className="coachMobileMuted"
                style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "8px 10px" }}
              >
                {data.message}
              </p>
            ) : null}

            <h2 className="coachMobileSectionTitle">Тренировки тази седмица</h2>
            {data.days.length === 0 ? (
              <p className="coachMobileMuted">Няма насрочени тренировки за прозореца.</p>
            ) : (
              data.days.map((day, i) => <DayCard key={`${day.date}-${i}`} day={day} />)
            )}

            {data.extra_trainings > 0 ? (
              <p className="coachMobileMuted" style={{ fontSize: 12 }}>
                + {data.extra_trainings} допълнителни тренировки над програмните теми (бонус).
              </p>
            ) : null}

            {Array.isArray(data.unmapped_days) && data.unmapped_days.length ? (
              <>
                <h2 className="coachMobileSectionTitle">Теми без насрочена тренировка</h2>
                <p className="coachMobileMuted" style={{ marginTop: 0, fontSize: 12 }}>
                  Тези програмни теми не са покрити от тренировка тази седмица.
                </p>
                {data.unmapped_days.map((pd, i) => (
                  <article className="coachMobileCard" key={`um-${i}`}>
                    {pd.theme ? <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{pd.theme}</p> : null}
                    {Array.isArray(pd.focus) && pd.focus.length ? (
                      <p className="coachMobileMuted" style={{ margin: "0 0 4px" }}>Фокус: {pd.focus.join(", ")}</p>
                    ) : null}
                    {pd.session_goal ? <p style={{ margin: "0 0 6px", fontSize: 13 }}>{pd.session_goal}</p> : null}
                    {pd.textbook_slug ? (
                      <Link to={`/textbook/${pd.textbook_slug}`} className="coachMobileQuickBtn" style={{ display: "inline-block" }}>
                        Виж конспекта
                      </Link>
                    ) : null}
                  </article>
                ))}
              </>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
