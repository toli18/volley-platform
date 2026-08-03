import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useHorizontalSwipeTabs } from "../../hooks/useHorizontalSwipeTabs";
import AthleteIdentityFields from "../../components/athletes/AthleteIdentityFields";
import AthleteTestsPanel from "../../components/athletes/AthleteTestsPanel";
import BvfDocumentsPanel from "../../components/athletes/BvfDocumentsPanel";
import AthleteLocalDocumentsPanel from "../../components/athletes/AthleteLocalDocumentsPanel";
import useAthletePhoto from "../../hooks/useAthletePhoto";
import { parentLoginPath } from "../../utils/parentAuth";
import { formatMoney } from "../../utils/currency";
import { Button, EmptyState, Modal } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const TABS = [
  { id: "overview", label: "Преглед" },
  { id: "data", label: "Данни" },
  { id: "bvf", label: "БФВ" },
  { id: "physical", label: "Тестове" },
  { id: "attendance", label: "Присъствие" },
  { id: "fees", label: "Такси" },
  { id: "history", label: "История" },
];

const HISTORY_FILTERS = [
  { id: "all", label: "Всички" },
  { id: "attendance", label: "Присъствие" },
  { id: "payment", label: "Плащания" },
  { id: "system", label: "Система" },
];

const SYSTEM_KINDS = new Set(["created", "profile_update", "team_join"]);

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabelBg = (monthKey) => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "";
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("bg-BG", { month: "long", year: "numeric" });
};

const shortenTeamName = (name) => {
  const s = String(name || "").trim();
  if (!s) return "—";
  const m = s.match(/под\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  if (s.length > 12) return `${s.slice(0, 12)}…`;
  return s;
};

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "—";
};

const statusShort = (value) => {
  if (value === "present") return "✓";
  if (value === "late") return "З";
  if (value === "absent") return "—";
  if (value === "excused") return "И";
  return "·";
};

const genderShort = (g) => {
  if (g === "male") return "М";
  if (g === "female") return "Ж";
  return "—";
};

const formatDay = (iso) => {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  if (s.length >= 10) return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return s;
};

const paymentPaid = (row) => {
  if (row.paid === false) return false;
  if (row.paid === true) return true;
  return Boolean(row.paid_at);
};

const profileInitials = (profile) => {
  const a = String(profile.first_name || "").trim().charAt(0);
  const b = String(profile.last_name || "").trim().charAt(0);
  if (a && b) return `${a}${b}`.toUpperCase();
  const parts = String(profile.athlete_name || "?").trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  return String(profile.athlete_name || "?").slice(0, 2).toUpperCase();
};

function MoreMenu({ open, onClose, onHistory, onCopyParent, onBack }) {
  return (
    <Modal open={open} onClose={onClose} title="Още" size="compact" className="athleteProfileMoreSheet">
      <div className="athleteProfileMoreBtns">
        <Button type="button" variant="secondary" block onClick={() => { onHistory(); onClose(); }}>
          История
        </Button>
        <Button type="button" variant="secondary" block as={Link} to={parentLoginPath()} target="_blank" rel="noreferrer" onClick={onClose}>
          Родителски вход
        </Button>
        <Button type="button" variant="secondary" block onClick={() => { onCopyParent(); onClose(); }}>
          Копирай линк
        </Button>
        <Button type="button" variant="ghost" block onClick={() => { onBack(); onClose(); }}>
          Назад
        </Button>
      </div>
      <Button type="button" variant="ghost" block onClick={onClose}>
        Затвори
      </Button>
    </Modal>
  );
}

function TeamsPicker({ teams, selectedTeamIds, saving, onToggle, onSave, hasChanges }) {
  if (!teams.length) {
    return <p className="coachMobileMuted">Няма отбори за управление.</p>;
  }
  const selectedCount = teams.filter((t) => selectedTeamIds.has(t.id)).length;
  return (
    <>
      <p className="coachMobileMuted athleteProfileTeamsHint">
        Маркирай групите · избрани: {selectedCount}
      </p>
      <ul className="athleteProfileTeamChipList">
        {teams.map((team) => {
          const checked = selectedTeamIds.has(team.id);
          return (
            <li key={team.id}>
              <label className={`athleteProfileTeamChip${checked ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(team.id)}
                  disabled={saving}
                />
                <span className="athleteProfileTeamChipText">
                  <span className="athleteProfileTeamChipName">{team.name}</span>
                  {team.age_group ? (
                    <span className="athleteProfileTeamChipMeta">{team.age_group}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button type="button" size="sm" disabled={saving || !hasChanges} onClick={onSave} block style={{ marginTop: 8 }}>
        {saving ? "Запазване..." : "Запази групи"}
      </Button>
    </>
  );
}

function IdentityReadonly({ profile }) {
  const full =
    [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ") || profile.athlete_name;
  return (
    <dl className="athleteProfileIdDl">
      <div>
        <dt>Имена</dt>
        <dd>{full || "—"}</dd>
      </div>
      <div>
        <dt>Дата / град</dt>
        <dd>
          {profile.birth_date ? String(profile.birth_date).slice(0, 10) : "—"}
          {profile.place_of_birth ? ` · ${profile.place_of_birth}` : ""}
        </dd>
      </div>
      <div>
        <dt>Националност / пол</dt>
        <dd>
          {profile.nationality || "—"} · {genderShort(profile.gender)}
        </dd>
      </div>
      {profile.egn ? (
        <div>
          <dt>ЕГН</dt>
          <dd>{profile.egn}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export default function AthleteProfileCoachMobile({
  profile,
  tab,
  setTab,
  from,
  feesPayHref,
  feesAllHref,
  coachTeams,
  selectedTeamIds,
  savingTeams,
  hasTeamChanges,
  onToggleTeam,
  onSaveTeams,
  onCopyParentUrl,
  onBack,
  editing = false,
  editForm = null,
  setEditForm,
  savingProfile = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onOpenBvfCreate,
  onOpenBvfLink,
  onSyncPhoto,
  onUploadPhoto,
  syncingPhoto = false,
}) {
  const toast = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [localDocsOpen, setLocalDocsOpen] = useState(true);
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyLimit, setHistoryLimit] = useState(15);
  const [feesMonth, setFeesMonth] = useState(currentMonthKey);

  const canFetchPhoto = Boolean(profile.bvf_player_id || profile.bvf_photo_id);
  const photoUrl = useAthletePhoto(profile.athlete_id, Boolean(profile.has_photo), {
    canFetchFromBvf: canFetchPhoto,
  });

  const swipeHandlers = useHorizontalSwipeTabs(tab, setTab, TABS.map((t) => t.id));

  const summary = profile.attendance_summary || {};
  const teamsShort = (profile.teams || []).map(shortenTeamName).join(", ") || "—";
  const identityLocked = Boolean(profile.bvf_player_id || profile.bvf_identity_locked);

  const currentPayment = useMemo(() => {
    const rows = profile.monthly_payments || [];
    return rows.find((r) => r.month_key === feesMonth) || rows.find((r) => r.month_key === currentMonthKey());
  }, [profile.monthly_payments, feesMonth]);

  const currentMonthPaid = currentPayment ? paymentPaid(currentPayment) : false;

  const attendanceRows = profile.last_attendance || [];
  const visibleAttendance = showAllAttendance ? attendanceRows : attendanceRows.slice(0, 8);

  const filteredTimeline = useMemo(() => {
    const list = profile.timeline || [];
    if (historyFilter === "all") return list;
    if (historyFilter === "attendance") return list.filter((e) => e.kind === "attendance");
    if (historyFilter === "payment") return list.filter((e) => e.kind === "payment");
    return list.filter((e) => SYSTEM_KINDS.has(e.kind));
  }, [profile.timeline, historyFilter]);

  const visibleTimeline = filteredTimeline.slice(0, historyLimit);

  const sekLiveDetail = useMemo(() => {
    if (!profile?.sek_task_code || profile.bvf_player_id) return "";
    const missing = Array.isArray(profile.bvf_missing) ? profile.bvf_missing : [];
    if (!missing.length) {
      return profile.sek_task_detail || "Нужни са снимка/данни — виж таб БФВ.";
    }
    if (missing.length === 1 && missing[0] === "снимка") {
      return "Липсва портретна снимка за създаване в СЕК.";
    }
    if (missing.includes("снимка")) {
      const rest = missing.filter((m) => m !== "снимка");
      return `Липсва снимка и още: ${rest.join(", ")}. Качи снимка и попълни данните.`;
    }
    return `Липсват данни за СЕК: ${missing.join(", ")}.`;
  }, [profile?.sek_task_code, profile?.sek_task_detail, profile?.bvf_missing, profile?.bvf_player_id]);

  return (
    <div className={`coachMobilePage athleteProfileCoachPage${editing ? " is-editing" : ""}`}>
      <header className="athleteProfileHead">
        <div className="athleteProfileHeadTop">
          <Link to={from} className="athleteProfileBackLink" aria-label="Назад">
            ←
          </Link>
          <div className="athleteProfileAvatar" aria-hidden>
            {photoUrl ? <img src={photoUrl} alt="" className="athleteProfileAvatarImg" /> : profileInitials(profile)}
          </div>
          <div className="athleteProfileHeadText">
            <h2 className="athleteProfileHeadName">{profile.athlete_name}</h2>
            <p className="athleteProfileHeadMeta">
              {profile.birth_year || "—"} · {genderShort(profile.gender)} ·{" "}
              {profile.is_active ? "Активен" : "Неактивен"}
              {teamsShort !== "—" ? ` · ${teamsShort}` : ""}
              {profile.bvf_player_number ? ` · БФВ №${profile.bvf_player_number}` : ""}
            </p>
          </div>
        </div>
        {profile.sek_task_code && !profile.bvf_player_id ? (
          <p
            style={{
              margin: "10px 0 0",
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              fontSize: 13,
              color: "#92400e",
            }}
          >
            <strong>СЕК:</strong> {sekLiveDetail || "Нужни са снимка/данни — виж таб БФВ."}
          </p>
        ) : null}
        <div className="athleteProfileHeadActions">
          {!editing ? (
            <>
              <Button as={Link} to={feesPayHref} size="sm">
                Плати
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onStartEdit}>
                Редактирай
              </Button>
              <button type="button" className="athleteProfileMenuBtn" aria-label="Още" onClick={() => setMoreOpen(true)}>
                ⋯
              </button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" disabled={savingProfile} onClick={onSaveEdit}>
                {savingProfile ? "Запазване…" : "Запази"}
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={savingProfile} onClick={onCancelEdit}>
                Отказ
              </Button>
            </>
          )}
        </div>
      </header>

      <nav className="coachMobileSubNav" aria-label="Профил секции">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`coachMobileSubNavBtn${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
            disabled={editing && t.id !== "data"}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="athleteProfileSwipeArea" {...(editing ? {} : swipeHandlers)}>
        {tab === "overview" ? (
          <div className="athleteProfileTab">
            <section
              className={`athleteProfileCard athleteProfileFeeCard${
                currentMonthPaid ? " athleteProfileFeeCard--paid" : " athleteProfileFeeCard--due"
              }`}
            >
              <div className="athleteProfileFeeCardTop">
                <div>
                  <h3 className="athleteProfileCardTitle" style={{ marginBottom: 4 }}>
                    Такса · {monthLabelBg(feesMonth)}
                  </h3>
                  <p className="athleteProfileFeeStatus" style={{ margin: 0 }}>
                    {currentMonthPaid ? "Платена" : "Неплатена — дължи"}
                  </p>
                </div>
                <span className={`uiBadge ${currentMonthPaid ? "uiBadge--success" : "uiBadge--danger"}`}>
                  {currentMonthPaid ? "Платено" : "Дължи"}
                </span>
              </div>
              <div className="athleteProfileInlineActions" style={{ marginTop: 10 }}>
                {!currentMonthPaid ? (
                  <Button as={Link} to={`${feesPayHref}&month_key=${encodeURIComponent(feesMonth)}`} size="sm">
                    Плати сега
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="secondary" onClick={() => setTab("fees")}>
                  Всички такси
                </Button>
              </div>
            </section>

            <section className="athleteProfileCard athleteProfileCard--compact">
              <h3 className="athleteProfileCardTitle">БФВ</h3>
              {profile.bvf_player_id ? (
                <p className="athleteProfileSummaryLine" style={{ margin: 0 }}>
                  Свързан · № {profile.bvf_player_number || profile.bvf_player_id}
                  {identityLocked ? " · заключено" : ""}
                </p>
              ) : profile.bvf_ready ? (
                <p className="athleteProfileSummaryLine" style={{ margin: 0 }}>
                  Готов за създаване / свързване
                </p>
              ) : (
                <p className="athleteProfileSummaryLine" style={{ margin: 0 }}>
                  Липсва: {(profile.bvf_missing || []).slice(0, 3).join(", ") || "данни"}
                  {(profile.bvf_missing || []).length > 3 ? "…" : ""}
                </p>
              )}
              <div className="athleteProfileInlineActions" style={{ marginTop: 10 }}>
                <Button type="button" size="sm" variant="secondary" onClick={() => setTab("bvf")}>
                  Към БФВ
                </Button>
              </div>
            </section>

            <section className="athleteProfileCard athleteProfileCard--compact">
              <h3 className="athleteProfileCardTitle">Присъствие</h3>
              <p className="athleteProfileSummaryLine" style={{ margin: 0 }}>
                Присъства {summary.present ?? 0} · {summary.attendance_rate_percent ?? 0}% ·{" "}
                {(summary.absent ?? 0) === 0 ? "0 отсъствия" : `${summary.absent} отсъствия`}
              </p>
              <div className="athleteProfileInlineActions" style={{ marginTop: 10 }}>
                <Button type="button" size="sm" variant="secondary" onClick={() => setTab("attendance")}>
                  Детайли
                </Button>
              </div>
            </section>

            <section className="athleteProfileCard">
              <button type="button" className="athleteProfileCollapseHead" onClick={() => setContactOpen((v) => !v)}>
                <span>Контакт</span>
                <span aria-hidden>{contactOpen ? "▾" : "▸"}</span>
              </button>
              {contactOpen ? (
                <div className="athleteProfileCollapseBody">
                  {profile.parent_phone ? (
                    <a href={`tel:${profile.parent_phone}`} className="athleteProfileContactRow">
                      Родител: {profile.parent_name || "—"} · {profile.parent_phone}
                    </a>
                  ) : (
                    <p className="coachMobileMuted">Родител: {profile.parent_name || "—"}</p>
                  )}
                  {profile.athlete_phone ? (
                    <a href={`tel:${profile.athlete_phone}`} className="athleteProfileContactRow">
                      Състезател: {profile.athlete_phone}
                    </a>
                  ) : (
                    <p className="coachMobileMuted">Тел. състезател: —</p>
                  )}
                </div>
              ) : null}
            </section>

            <section className="athleteProfileCard athleteProfileCard--compact">
              <h3 className="athleteProfileCardTitle">Родителски портал</h3>
              <p className="coachMobileMuted athleteProfilePortalHint">
                Вход с телефон и година на раждане на детето.
              </p>
              <div className="athleteProfileInlineActions">
                <Button as={Link} to={parentLoginPath()} size="sm" target="_blank" rel="noreferrer">
                  Отвори
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onCopyParentUrl}>
                  Копирай
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "data" ? (
          <div className="athleteProfileTab">
            <section className="athleteProfileCard">
              <div className="athleteProfileCardTitleRow">
                <h3 className="athleteProfileCardTitle">Лични данни</h3>
                {editing ? (
                  <span className="uiBadge uiBadge--warning">редакция</span>
                ) : identityLocked ? (
                  <span className="uiBadge">БФВ заключено</span>
                ) : null}
              </div>
              {editing && editForm && setEditForm ? (
                <AthleteIdentityFields
                  form={editForm}
                  setForm={setEditForm}
                  identityLocked={identityLocked}
                  showLegacyNameHint
                  showEgn
                />
              ) : (
                <IdentityReadonly profile={profile} />
              )}
            </section>

            {!editing ? (
              <section className="athleteProfileCard athleteProfileCard--compact">
                <div className="athleteProfileCardTitleRow">
                  <h3 className="athleteProfileCardTitle" style={{ margin: 0 }}>Тренировъчни групи</h3>
                  <button
                    type="button"
                    className="athleteProfileCollapseHead"
                    style={{ padding: 0, border: 0, background: "transparent", width: "auto" }}
                    onClick={() => setTeamsOpen((v) => !v)}
                    aria-expanded={teamsOpen}
                  >
                    <span aria-hidden>{teamsOpen ? "▾" : "▸"}</span>
                  </button>
                </div>
                {teamsOpen ? (
                  <div style={{ marginTop: 8 }}>
                    <TeamsPicker
                      teams={coachTeams}
                      selectedTeamIds={selectedTeamIds}
                      saving={savingTeams}
                      onToggle={onToggleTeam}
                      onSave={onSaveTeams}
                      hasChanges={hasTeamChanges}
                    />
                  </div>
                ) : (
                  <p className="athleteProfileSummaryLine" style={{ margin: "6px 0 0" }}>
                    {teamsShort !== "—" ? teamsShort : "Няма избрани"}
                  </p>
                )}
              </section>
            ) : null}

            {editing ? (
              <div className="athleteProfileEditBar">
                <Button type="button" disabled={savingProfile} onClick={onSaveEdit} block>
                  {savingProfile ? "Запазване…" : "Запази промените"}
                </Button>
                <Button type="button" variant="secondary" disabled={savingProfile} onClick={onCancelEdit} block>
                  Отказ
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "bvf" ? (
          <div className="athleteProfileTab">
            {profile.sek_task_code && !profile.bvf_player_id ? (
              <section
                className="athleteProfileCard"
                style={{ borderColor: "#f59e0b", background: "#fffbeb" }}
              >
                <h3 className="athleteProfileCardTitle">Задача от главния треньор (СЕК)</h3>
                <p className="athleteProfileSummaryLine" style={{ marginBottom: 8 }}>
                  {sekLiveDetail ||
                    profile.sek_task_detail ||
                    (profile.sek_task_code === "need_photo"
                      ? "Липсва портретна снимка за създаване в СЕК."
                      : "Липсват данни за СЕК.")}
                </p>
                <p className="uiMuted" style={{ margin: "0 0 10px", fontSize: 12 }}>
                  Качи снимка тук — тя се пази локално, докато главният треньор свърже/създаде състезателя в СЕК.
                </p>
                <label style={{ margin: 0 }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/bmp,.jpg,.jpeg,.png"
                    style={{ display: "none" }}
                    disabled={syncingPhoto}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onUploadPhoto?.(f);
                    }}
                  />
                  <span
                    className="uiButton"
                    style={{
                      display: "inline-flex",
                      opacity: syncingPhoto ? 0.6 : 1,
                      pointerEvents: syncingPhoto ? "none" : "auto",
                    }}
                  >
                    {profile.has_photo || photoUrl ? "Смени снимката" : "Добави снимка"}
                  </span>
                </label>
              </section>
            ) : null}
            <section className="athleteProfileCard">
              <h3 className="athleteProfileCardTitle">БФВ / картотека</h3>
              {profile.bvf_player_id ? (
                <p className="athleteProfileSummaryLine">
                  Свързан · № {profile.bvf_player_number || profile.bvf_player_id}
                  {identityLocked ? " · идентичността е заключена" : ""}
                  {profile.has_photo || photoUrl ? " · има снимка" : " · без локална снимка"}
                </p>
              ) : (
                <>
                  <p className="athleteProfileSummaryLine">
                    {profile.bvf_ready
                      ? "Готов за създаване — нужни са ЕГН и снимка при изпращане."
                      : "Липсва за връзка с БФВ:"}
                  </p>
                  {!profile.bvf_ready && Array.isArray(profile.bvf_missing) && profile.bvf_missing.length ? (
                    <ul className="athleteProfileMissingList">
                      {profile.bvf_missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="athleteProfileInlineActions" style={{ marginTop: 10 }}>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onStartEdit?.();
                      }}
                    >
                      Попълни липсите
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={onOpenBvfCreate}
                      disabled={(profile.bvf_missing || []).some((m) => m !== "ЕГН" && m !== "снимка")}
                    >
                      Създай в БФВ
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={onOpenBvfLink}>
                      Свържи по ЕГН
                    </Button>
                  </div>
                </>
              )}
              {profile.bvf_player_id && !profile.has_photo && !photoUrl ? (
                <div className="athleteProfileInlineActions" style={{ marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <Button type="button" size="sm" variant="secondary" disabled={syncingPhoto} onClick={onSyncPhoto}>
                    {syncingPhoto ? "Зареждане…" : "Зареди снимка от БФВ"}
                  </Button>
                  <label style={{ margin: 0 }}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/bmp,.jpg,.jpeg,.png"
                      style={{ display: "none" }}
                      disabled={syncingPhoto}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onUploadPhoto?.(f);
                      }}
                    />
                    <span
                      className="uiButton"
                      style={{
                        display: "inline-flex",
                        opacity: syncingPhoto ? 0.6 : 1,
                        pointerEvents: syncingPhoto ? "none" : "auto",
                        cursor: "pointer",
                        fontSize: 13,
                        padding: "6px 12px",
                      }}
                    >
                      Качи снимка
                    </span>
                  </label>
                </div>
              ) : null}
            </section>

            <section className="athleteProfileCard">
              <button
                type="button"
                className="athleteProfileCollapseHead"
                onClick={() => setLocalDocsOpen((v) => !v)}
              >
                <span>Документи (клуб / заявление)</span>
                <span aria-hidden>{localDocsOpen ? "▾" : "▸"}</span>
              </button>
              {localDocsOpen ? (
                <div className="athleteProfileCollapseBody">
                  <AthleteLocalDocumentsPanel athleteId={profile.athlete_id} toast={toast} />
                </div>
              ) : null}
            </section>

            {profile.bvf_player_id ? (
              <section className="athleteProfileCard">
                <button type="button" className="athleteProfileCollapseHead" onClick={() => setDocsOpen((v) => !v)}>
                  <span>Документи (БФВ)</span>
                  <span aria-hidden>{docsOpen ? "▾" : "▸"}</span>
                </button>
                {docsOpen ? (
                  <div className="athleteProfileCollapseBody">
                    <BvfDocumentsPanel athleteId={profile.athlete_id} toast={toast} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "physical" || tab === "tests" ? (
          <div className="athleteProfileTab">
            <section className="athleteProfileCard">
              <h3 className="athleteProfileCardTitle">Тестове и физически показатели</h3>
              <AthleteTestsPanel
                athleteId={profile.athlete_id}
                bvfPlayerId={profile.bvf_player_id}
                toast={toast}
              />
            </section>
          </div>
        ) : null}

        {tab === "attendance" ? (
          <div className="athleteProfileTab">
            <div className="athleteProfileBadgeGrid">
              <span className="uiBadge uiBadge--success">Присъства: {summary.present ?? 0}</span>
              <span className="uiBadge uiBadge--warning">Закъсня: {summary.late ?? 0}</span>
              <span className="uiBadge uiBadge--danger">Отсъства: {summary.absent ?? 0}</span>
              <span className="uiBadge uiBadge--secondary">Извинен: {summary.excused ?? 0}</span>
              <span className="uiBadge uiBadge--info">Процент: {summary.attendance_rate_percent ?? 0}%</span>
            </div>
            {attendanceRows.length === 0 ? (
              <EmptyState title="Няма присъствия" description="Все още няма записани тренировки." />
            ) : (
              <ul className="athleteProfileAttList">
                {visibleAttendance.map((row, idx) => (
                  <li key={`${row.date}-${idx}`} className="athleteProfileAttRow">
                    <span className="athleteProfileAttDate">{formatDay(row.date)}</span>
                    <span className="athleteProfileAttTeam">{shortenTeamName(row.team_name)}</span>
                    <span className={`athleteProfileAttStatus ${statusLabel(row.status) === "Присъства" ? "is-ok" : ""}`}>
                      {statusShort(row.status)} {statusLabel(row.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {attendanceRows.length > 8 && !showAllAttendance ? (
              <Button type="button" variant="secondary" size="sm" block onClick={() => setShowAllAttendance(true)}>
                Виж всички ({attendanceRows.length})
              </Button>
            ) : null}
          </div>
        ) : null}

        {tab === "fees" ? (
          <div className="athleteProfileTab athleteProfileTab--fees">
            <div className="athleteProfileFeesSticky">
              <InputMonth value={feesMonth} onChange={setFeesMonth} />
              <Button as={Link} to={`${feesPayHref}&month_key=${encodeURIComponent(feesMonth)}`} size="sm">
                Добави плащане
              </Button>
            </div>
            <ul className="athleteProfileFeesList">
              {(profile.monthly_payments || []).map((row) => {
                const paid = paymentPaid(row);
                return (
                  <li key={row.month_key} className="athleteProfileFeesRow">
                    <span className="athleteProfileFeesMonth">{row.month_key}</span>
                    <span className={`uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                      {paid ? `Платено ${formatMoney(row.amount)}` : "Дължи"}
                    </span>
                    {!paid ? (
                      <Button
                        as={Link}
                        to={`${feesPayHref}&month_key=${encodeURIComponent(row.month_key)}`}
                        size="sm"
                        variant="secondary"
                      >
                        Плати
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {(profile.monthly_payments || []).length === 0 ? (
              <EmptyState title="Няма данни" description="Няма месечни записи." />
            ) : null}
            <Link to={feesAllHref} className="athleteProfileFeesAllLink">
              Всички такси
            </Link>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="athleteProfileTab">
            <div className="athleteProfileHistoryFilters">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`athleteProfileFilterChip${historyFilter === f.id ? " is-active" : ""}`}
                  onClick={() => {
                    setHistoryFilter(f.id);
                    setHistoryLimit(15);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {visibleTimeline.length === 0 ? (
              <EmptyState title="Няма събития" description="Няма записи за избрания филтър." />
            ) : (
              <ul className="athleteProfileTimeline">
                {visibleTimeline.map((ev, i) => (
                  <li key={`${ev.kind}-${ev.at}-${i}`} className="athleteProfileTimelineCard">
                    <div className="athleteProfileTimelineWhen">
                      {ev.at
                        ? new Date(ev.at).toLocaleString("bg-BG", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </div>
                    <div className="athleteProfileTimelineLabel">{ev.label || ev.kind}</div>
                    {(ev.detail || ev.actor_name) && (
                      <div className="athleteProfileTimelineMeta">
                        {[ev.detail, ev.actor_name].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {filteredTimeline.length > historyLimit ? (
              <Button type="button" variant="secondary" size="sm" block onClick={() => setHistoryLimit((n) => n + 15)}>
                Зареди още
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onHistory={goHistoryTab}
        onCopyParent={onCopyParentUrl}
        onBack={onBack}
      />
    </div>
  );
}

function InputMonth({ value, onChange }) {
  return (
    <input
      type="month"
      className="uiInput athleteProfileMonthInput"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Месец"
    />
  );
}
