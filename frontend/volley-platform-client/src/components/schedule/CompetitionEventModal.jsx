import { Button, Input, Modal } from "../ui";
import { COMPETITION_KIND_OPTIONS } from "../../utils/competitionKinds";
import { applyCardIndexSelection } from "../../utils/competitionFormHelpers";

export default function CompetitionEventModal({
  open,
  busy,
  isHeadCoach,
  teams,
  coaches,
  cardIndexes = [],
  form,
  setForm,
  editId,
  onClose,
  onSave,
  onDelete,
}) {
  const list = Array.isArray(cardIndexes) ? cardIndexes : [];
  const selectedCard = list.find((c) => String(c.id) === String(form.card_index_id || "")) || null;

  const onCardIndexChange = (value) => {
    setForm((p) => applyCardIndexSelection(p, value, list, teams));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!busy}
      title={editId ? "Редакция на състезание" : "Ново състезание"}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <Input as="select" value={form.card_index_id || ""} onChange={(e) => onCardIndexChange(e.target.value)}>
          <option value="">
            {list.length ? "Без картотека — само тренировъчна група" : "Няма заредени картотечни отбори"}
          </option>
          {list.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.label}
              {c.assigned_coach_name ? ` · ${c.assigned_coach_name}` : ""}
            </option>
          ))}
        </Input>
        <p className="uiHint" style={{ margin: 0 }}>
          {selectedCard
            ? "Попълнихме треньор и група според картотеката. Съставът за мача е от картотекираните състезатели."
            : list.length
              ? "Избери картотечен отбор (СЕК) — после попълваме треньор/група. Или само тренировъчна група по-долу."
              : "Картотечните отбори идват от сезона в „Картотеки“. Ако тук е празно, провери сезона или опресни страницата."}
        </p>

        <Input as="select" value={form.team_id} onChange={(e) => setForm((p) => ({ ...p, team_id: e.target.value }))}>
          <option value="">Избери тренировъчна група</option>
          {teams.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </Input>

        {isHeadCoach ? (
          <Input as="select" value={form.coach_id} onChange={(e) => setForm((p) => ({ ...p, coach_id: e.target.value }))}>
            <option value="">Избери треньор</option>
            {coaches.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Input>
        ) : null}

        <Input as="select" value={form.competition_kind} onChange={(e) => setForm((p) => ({ ...p, competition_kind: e.target.value }))}>
          {COMPETITION_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Input>
        <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
        <Input placeholder="Място / зала" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
        <Input
          placeholder="Противник"
          value={form.opponent_name || ""}
          onChange={(e) => setForm((p) => ({ ...p, opponent_name: e.target.value }))}
        />
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <Input type="time" value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} />
          <Input type="time" value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} />
        </div>
        <Input placeholder="Бележки (по избор)" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, justifyContent: "flex-end" }}>
        {editId ? (
          <Button variant="danger" disabled={busy} onClick={onDelete}>
            Изтрий
          </Button>
        ) : null}
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Отказ
        </Button>
        <Button disabled={busy} onClick={onSave}>
          {editId ? "Запази" : "Създай"}
        </Button>
      </div>
    </Modal>
  );
}
