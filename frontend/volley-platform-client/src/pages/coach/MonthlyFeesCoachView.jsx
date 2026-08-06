import { useState } from "react";
import { Link } from "react-router-dom";

import AthleteMembershipChips from "../../components/athletes/AthleteMembershipChips";
import { Button, EmptyState, Input, Modal } from "../../components/ui";
import { formatMoney } from "../../utils/currency";

const PAY_FILTERS = [
  { id: "all", label: "Всички" },
  { id: "unpaid", label: "Неплатили" },
  { id: "paid", label: "Платили" },
];

function formatGenderShort(v) {
  if (v === "male") return "М";
  if (v === "female") return "Ж";
  return "—";
}

function monthPaid(athlete, monthKey) {
  return Boolean((athlete.recent_payments || []).find((p) => p.month_key === monthKey));
}

function MonthSummaryBar({ summary, isHeadCoach }) {
  if (!summary) return null;
  return (
    <section className="feesMonthSummaryBar" aria-label="Събрани такси за месеца">
      <p className="feesMonthSummaryTotal">Събрани: {formatMoney(summary.total_collected)}</p>
      <p className="feesMonthSummaryMeta">
        Платили {summary.paid_count} · неплатили {summary.unpaid_count} · общо {summary.athlete_count}
      </p>
      {isHeadCoach && Array.isArray(summary.by_coach) && summary.by_coach.length ? (
        <ul className="feesMonthSummaryCoaches">
          {summary.by_coach.map((row) => (
            <li key={row.coach_id}>
              <strong>{row.coach_name}</strong>: {formatMoney(row.total_collected)} · платени {row.paid_count} /
              неплатени {row.unpaid_count}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AthleteActionsSheet({ athlete, onClose, onReport }) {
  return (
    <Modal
      open={Boolean(athlete)}
      onClose={onClose}
      title={athlete?.athlete_name || ""}
      size="compact"
      className="feesCoachActionSheet"
    >
      <div className="feesCoachActionSheetBtns">
        <Button
          variant="secondary"
          block
          onClick={() => {
            onReport(athlete);
            onClose();
          }}
        >
          Отчет по месеци
        </Button>
        <Button as={Link} to={`/coach/athletes/${athlete?.id}`} variant="secondary" block onClick={onClose}>
          Към профил
        </Button>
      </div>
      <Button variant="ghost" block onClick={onClose}>
        Затвори
      </Button>
    </Modal>
  );
}

function MoreSheet({
  open,
  isHeadCoach,
  coachFilter,
  setCoachFilter,
  clubCoaches,
  remindMonth,
  setRemindMonth,
  payFilter,
  setPayFilter,
  onClose,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Такси · още" size="compact">
      {isHeadCoach ? (
        <label style={{ display: "grid", gap: 4, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Треньор</span>
          <select className="uiInput" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
            <option value="">Всички треньори</option>
            {(clubCoaches || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Статус за месеца</span>
        <div className="athletesHubFilters" role="group" aria-label="Филтър плащане">
          {PAY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`athletesHubFilterBtn${payFilter === f.id ? " is-active" : ""}`}
              onClick={() => setPayFilter?.(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <Input
        type="month"
        value={remindMonth}
        onChange={(e) => setRemindMonth(e.target.value)}
        aria-label="Месец за напомняне"
      />
      <Button as={Link} to="/coach/athletes" variant="secondary" block onClick={onClose}>
        Към състезатели
      </Button>
      <Button variant="ghost" block onClick={onClose}>
        Затвори
      </Button>
    </Modal>
  );
}

export default function MonthlyFeesCoachView({
  athletesCount,
  filteredCount,
  query,
  setQuery,
  remindMonth,
  loading,
  filteredAthletes,
  highlightAthleteId,
  busy,
  isHeadCoach,
  coachFilter,
  setCoachFilter,
  clubCoaches,
  setRemindMonth,
  payFilter = "all",
  setPayFilter,
  monthSummary = null,
  onRemind,
  onAthleteOpen,
  onPay,
  onReport,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionAthlete, setActionAthlete] = useState(null);

  const countLabel =
    query.trim() || payFilter !== "all" ? `${filteredCount} от ${athletesCount}` : `Общо ${athletesCount}`;

  return (
    <div className="coachMobilePage feesCoachPage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Месечни такси</h2>
        <span className="feesCoachHeadBadge">{countLabel}</span>
      </header>

      <div className="feesCoachSwipeArea">
        <div className="feesCoachStickyBar">
          <Input
            placeholder="Търсене: име, отбор, година..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Търсене"
          />
          <div className="feesCoachStickyRow">
            <Input
              type="month"
              className="feesCoachMonthInput"
              value={remindMonth}
              onChange={(e) => setRemindMonth(e.target.value)}
              aria-label="Месец за статус"
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => setMoreOpen(true)}>
              Още
            </Button>
          </div>
          <MonthSummaryBar summary={monthSummary} isHeadCoach={isHeadCoach} />
          <Button type="button" className="feesRemindVisibleBtn" disabled={busy} onClick={onRemind}>
            Напомни неплатилите за {remindMonth}
          </Button>
          <div className="athletesHubFilters" role="group" aria-label="Филтър плащане">
            {PAY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`athletesHubFilterBtn${payFilter === f.id ? " is-active" : ""}`}
                onClick={() => setPayFilter?.(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {query.trim() ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setQuery("")}>
              Изчисти търсенето
            </Button>
          ) : null}
        </div>

        {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
        {!loading && athletesCount === 0 ? (
          <EmptyState title="Няма състезатели" description="Добави състезател от модул „Състезатели“." />
        ) : null}
        {!loading && athletesCount > 0 && filteredAthletes.length === 0 ? (
          <EmptyState title="Няма съвпадения" description="Промени търсенето или филтъра за плащане." />
        ) : null}
        {!loading && filteredAthletes.length > 0 ? (
          <ul className="feesCoachAthleteList">
            {filteredAthletes.map((a) => {
              const paid = monthPaid(a, remindMonth);
              return (
                <li key={a.id}>
                  <article
                    data-athlete-scroll={a.id}
                    className={`feesAthleteCardCompact${a.gender === "male" ? " feesAthleteCardCompact--male" : ""}${
                      a.gender === "female" ? " feesAthleteCardCompact--female" : ""
                    }${highlightAthleteId === a.id ? " feesAthleteCardCompact--highlight" : ""}`}
                    onClick={(e) => onAthleteOpen(e, a.id)}
                  >
                    <div className="feesAthleteCardCompactBody">
                      <h3 className="feesAthleteCardCompactName">{a.athlete_name}</h3>
                      <p className="feesAthleteCardCompactMeta">
                        {a.birth_year || "—"} · {formatGenderShort(a.gender)}
                        {!a.is_active ? " · неактивен" : ""}
                        {" · "}
                        <span className={a.bvf_player_id ? "feesSekMark feesSekMark--on" : "feesSekMark feesSekMark--off"}>
                          {a.bvf_player_id
                            ? `СЕК${a.bvf_player_number ? ` №${a.bvf_player_number}` : ""}`
                            : "без СЕК"}
                        </span>
                      </p>
                      <AthleteMembershipChips dense teamNames={a.team_names} cardedTeams={a.carded_teams} />
                      <span
                        className={`feesAthleteCardCompactPay uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}
                      >
                        {remindMonth}: {paid ? "платено" : "липсва"}
                      </span>
                    </div>
                    <div className="feesAthleteCardCompactActions">
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPay(a);
                        }}
                      >
                        Плати
                      </Button>
                      <button
                        type="button"
                        className="feesAthleteMenuBtn"
                        aria-label="Действия"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionAthlete(a);
                        }}
                      >
                        ⋯
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <MoreSheet
        open={moreOpen}
        isHeadCoach={isHeadCoach}
        coachFilter={coachFilter}
        setCoachFilter={setCoachFilter}
        clubCoaches={clubCoaches}
        remindMonth={remindMonth}
        setRemindMonth={setRemindMonth}
        payFilter={payFilter}
        setPayFilter={setPayFilter}
        onClose={() => setMoreOpen(false)}
      />
      <AthleteActionsSheet athlete={actionAthlete} onClose={() => setActionAthlete(null)} onReport={onReport} />
    </div>
  );
}
