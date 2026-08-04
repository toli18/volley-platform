import { useState } from "react";

import { useHorizontalSwipeTabs } from "../../hooks/useHorizontalSwipeTabs";
import AthleteIdentityFields from "../../components/athletes/AthleteIdentityFields";
import { Button, EmptyState, Input, Modal } from "../../components/ui";

const TABS = [
  { id: "list", label: "Списък" },
  { id: "add", label: "Добави" },
];

function formatGenderShort(v) {
  if (v === "male") return "М";
  if (v === "female") return "Ж";
  return "—";
}

function monthPaid(athlete, monthKey) {
  return Boolean((athlete.recent_payments || []).find((p) => p.month_key === monthKey));
}

function NewAthleteForm({ athleteForm, setAthleteForm, busy, onSave, onReset }) {
  return (
    <div className="feesCoachForm">
      <AthleteIdentityFields form={athleteForm} setForm={setAthleteForm} showEgn={false} />
      <Button disabled={busy} onClick={onSave} block>
        Създай състезател
      </Button>
      <Button variant="secondary" onClick={onReset} block disabled={busy}>
        Изчисти
      </Button>
    </div>
  );
}

function AthleteActionsSheet({ athlete, isHeadCoach, busy, onClose, onEdit, onDelete, onReport, onTransfer }) {
  return (
    <Modal
      open={Boolean(athlete)}
      onClose={onClose}
      title={athlete?.athlete_name || ""}
      size="compact"
      className="feesCoachActionSheet"
    >
      <div className="feesCoachActionSheetBtns">
        <Button variant="secondary" block onClick={() => { onEdit(athlete); onClose(); }}>
          Редактирай
        </Button>
        <Button variant="secondary" block onClick={() => { onReport(athlete); onClose(); }}>
          Отчет
        </Button>
        {isHeadCoach ? (
          <Button variant="secondary" block onClick={() => { onTransfer(athlete); onClose(); }}>
            Прехвърли
          </Button>
        ) : null}
        <Button variant="danger" block disabled={busy} onClick={() => { onDelete(athlete); onClose(); }}>
          Изтрий
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
  busy,
  isHeadCoach,
  coachFilter,
  setCoachFilter,
  clubCoaches,
  remindMonth,
  setRemindMonth,
  onRemind,
  onImportClick,
  onTemplate,
  onClose,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Още действия" size="compact" className="feesCoachMoreSheet">
      {isHeadCoach ? (
        <Input
          as="select"
          value={coachFilter}
          onChange={(e) => setCoachFilter(e.target.value)}
        >
          <option value="">Всички треньори</option>
          {clubCoaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Input>
      ) : null}
      <Input
        type="month"
        value={remindMonth}
        onChange={(e) => setRemindMonth(e.target.value)}
        aria-label="Месец за напомняне"
      />
      <Button type="button" variant="secondary" block disabled={busy} onClick={() => { onRemind(); onClose(); }}>
        Напомни неплатили
      </Button>
      <Button type="button" block disabled={busy} onClick={() => { onImportClick(); onClose(); }}>
        Импорт (CSV/XLSX)
      </Button>
      <Button type="button" variant="secondary" block onClick={onTemplate}>
        Шаблон за импорт
      </Button>
      <Button variant="ghost" block onClick={onClose}>
        Затвори
      </Button>
    </Modal>
  );
}

export default function MonthlyFeesCoachView({
  tab,
  setTab,
  athletesCount,
  filteredCount,
  query,
  setQuery,
  remindMonth,
  loading,
  filteredAthletes,
  highlightAthleteId,
  athleteForm,
  setAthleteForm,
  busy,
  isHeadCoach,
  coachFilter,
  setCoachFilter,
  clubCoaches,
  setRemindMonth,
  importInputRef,
  onImportFile,
  onSaveAthlete,
  onResetForm,
  onRemind,
  onTemplate,
  onAthleteOpen,
  onPay,
  onEdit,
  onDelete,
  onReport,
  onTransfer,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionAthlete, setActionAthlete] = useState(null);
  const swipeHandlers = useHorizontalSwipeTabs(tab, setTab, TABS.map((t) => t.id));

  const countLabel = query.trim()
    ? `${filteredCount} от ${athletesCount}`
    : `Общо ${athletesCount}`;

  return (
    <div className="coachMobilePage feesCoachPage">
      <header className="feesCoachHead">
        <h2 className="feesCoachHeadTitle">Месечни такси</h2>
        <span className="feesCoachHeadBadge">{countLabel}</span>
      </header>

      <nav className="coachMobileSubNav" aria-label="Такси секции">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`coachMobileSubNavBtn${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="feesCoachSwipeArea" {...swipeHandlers}>
        {tab === "list" ? (
          <>
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
              {query.trim() ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setQuery("")}>
                  Изчисти търсенето
                </Button>
              ) : null}
            </div>

            {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}
            {!loading && athletesCount === 0 ? (
              <EmptyState
                title="Няма състезатели"
                description="Добави първия от таб „Добави“ или импортирай списък от „Още“."
              />
            ) : null}
            {!loading && athletesCount > 0 && filteredAthletes.length === 0 ? (
              <EmptyState title="Няма съвпадения" description="Промени търсенето." />
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
                          <span className={`feesAthleteCardCompactPay uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
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
          </>
        ) : (
          <section className="feesCoachAddSection">
            <p className="coachMobileMuted">Нов състезател за месечни такси.</p>
            <NewAthleteForm
              athleteForm={athleteForm}
              setAthleteForm={setAthleteForm}
              busy={busy}
              onSave={onSaveAthlete}
              onReset={onResetForm}
            />
          </section>
        )}
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        hidden
        onChange={onImportFile}
      />

      <MoreSheet
        open={moreOpen}
        busy={busy}
        isHeadCoach={isHeadCoach}
        coachFilter={coachFilter}
        setCoachFilter={setCoachFilter}
        clubCoaches={clubCoaches}
        remindMonth={remindMonth}
        setRemindMonth={setRemindMonth}
        onRemind={onRemind}
        onImportClick={() => importInputRef.current?.click()}
        onTemplate={onTemplate}
        onClose={() => setMoreOpen(false)}
      />

      <AthleteActionsSheet
        athlete={actionAthlete}
        isHeadCoach={isHeadCoach}
        busy={busy}
        onClose={() => setActionAthlete(null)}
        onEdit={onEdit}
        onDelete={onDelete}
        onReport={onReport}
        onTransfer={onTransfer}
      />
    </div>
  );
}
