import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { parentLoginPath, parentLoginUrl } from "../utils/parentAuth";
import { useToast } from "../components/ToastProvider";
import AthleteIdentityFields from "../components/athletes/AthleteIdentityFields";
import BvfCreateAthleteModal from "../components/athletes/BvfCreateAthleteModal";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { formatMoney } from "../utils/currency";
import { normalizeError } from "../utils/normalizeError";
import { useAuth } from "../auth/AuthContext";
import {
  athleteToIdentityForm,
  buildAthletePayload,
  validateAthleteIdentityForm,
} from "../utils/athleteIdentity";

const fmtMissing = (value) => {
  if (value == null || value === "") return "няма данни";
  const s = String(value).trim();
  return s.length ? s : "няма данни";
};

const statusLabel = (value) => {
  if (value === "present") return "Присъства";
  if (value === "late") return "Закъсня";
  if (value === "absent") return "Отсъства";
  if (value === "excused") return "Извинен";
  return value || "няма данни";
};

const statusBadgeClass = (value) => {
  if (value === "present") return "uiBadge--success";
  if (value === "late") return "uiBadge--warning";
  if (value === "absent") return "uiBadge--danger";
  if (value === "excused") return "uiBadge--secondary";
  return "uiBadge--secondary";
};

const ageFromBirthYear = (year) => {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return new Date().getFullYear() - y;
};

const genderLabelBg = (g) => {
  if (g === "male") return "Мъж";
  if (g === "female") return "Жена";
  return "";
};

export default function TeamAthleteProfile() {
  const { athleteId } = useParams();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const role = String(user?.role?.value ?? user?.role ?? "").toLowerCase();
  const canManageSek =
    role === "club_head_coach" || role === "platform_admin" || role === "federation_admin";
  const monthlyFeesEnabled = user?.monthly_fees_enabled !== false;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const showFees = monthlyFeesEnabled && !profile?.fee_exempt;
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [bvfOpen, setBvfOpen] = useState(false);
  const fromPath = new URLSearchParams(location.search).get("from") || "/coach/teams";

  const feesHref = useMemo(() => {
    const id = profile?.athlete_id;
    if (!id) return "/monthly-fees";
    return `/monthly-fees?athlete_id=${encodeURIComponent(id)}`;
  }, [profile?.athlete_id]);

  const feesPayHref = useMemo(() => {
    const id = profile?.athlete_id;
    if (!id) return "/monthly-fees";
    return `/monthly-fees?athlete_id=${encodeURIComponent(id)}&focus=pay`;
  }, [profile?.athlete_id]);

  const scrollToHistory = () => {
    document.getElementById("athlete-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteId));
        if (!cancelled) setProfile(res.data || null);
      } catch (err) {
        if (!cancelled) toast.error(normalizeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const copyParentLoginUrl = async () => {
    const url = parentLoginUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Адресът за родителски вход е копиран.");
    } catch {
      toast.error("Неуспешно копиране.");
    }
  };

  const startEdit = () => {
    if (!profile) return;
    setEditForm(athleteToIdentityForm(profile));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditForm(null);
  };

  const saveProfile = async () => {
    if (!profile || !editForm) return;
    const locked = Boolean(profile.bvf_player_id || profile.bvf_identity_locked);
    if (!locked) {
      const err = validateAthleteIdentityForm(editForm, {
        requireSplitNames:
          Boolean(editForm.first_name || editForm.middle_name || editForm.last_name) || !editForm.athlete_name,
      });
      if (err) {
        toast.error(err);
        return;
      }
    }
    const payload = locked
      ? {
          athlete_phone: (editForm.athlete_phone || "").trim() || null,
          parent_name: (editForm.parent_name || "").trim() || null,
          parent_phone: (editForm.parent_phone || "").trim() || null,
          notes: (editForm.notes || "").trim() || null,
          is_active: Boolean(editForm.is_active),
          jersey_number: String(editForm.jersey_number ?? "").trim() === ""
            ? null
            : Number(editForm.jersey_number),
        }
      : buildAthletePayload(editForm);
    try {
      setSavingProfile(true);
      await axiosInstance.put(API_PATHS.FEES_ATHLETE_UPDATE(profile.athlete_id), payload);
      const res = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteId));
      setProfile(res.data || null);
      setEditing(false);
      setEditForm(null);
      toast.success("Профилът е запазен.");
    } catch (err) {
      toast.error(normalizeError(err, "Неуспешно запазване."));
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="uiPage">
        <PageHero title="Профил състезател" subtitle="Зареждане..." />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="uiPage">
        <PageHero title="Профил състезател" subtitle="Данните не са налични." />
        <EmptyState title="Няма данни" description="Състезателят не е намерен или нямате достъп." />
      </div>
    );
  }

  const birthYearVal = profile.birth_year ?? null;
  const ageYears = ageFromBirthYear(birthYearVal);

  const paymentPaid = (row) => {
    if (row.paid === false) return false;
    if (row.paid === true) return true;
    return Boolean(row.paid_at);
  };

  return (
    <div className="uiPage">
      <PageHero
        title={`Профил: ${profile.athlete_name}`}
        subtitle={
          showFees
            ? "Лични данни, БФВ, присъствие и такси на едно място."
            : "Лични данни, БФВ и присъствие на едно място."
        }
        actions={
          <div className="athleteProfileHeroActions">
            {!editing ? (
              <>
                <Button type="button" variant="primary" onClick={startEdit}>
                  Редактирай
                </Button>
                {!profile.bvf_player_id && canManageSek ? (
                  <Button type="button" variant="secondary" onClick={() => setBvfOpen(true)}>
                    Създай в СЕК
                  </Button>
                ) : null}
                {showFees ? (
                  <Button as={Link} to={feesPayHref} variant="secondary">
                    Плащане
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button type="button" disabled={savingProfile} onClick={saveProfile}>
                  {savingProfile ? "Запазване…" : "Запази"}
                </Button>
                <Button type="button" variant="secondary" disabled={savingProfile} onClick={cancelEdit}>
                  Отказ
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={scrollToHistory}>
              История
            </Button>
            <Button as={Link} to={fromPath} variant="secondary">
              Назад към Отбори
            </Button>
          </div>
        }
      />

      <Card title={editing ? "Редакция на профил" : "Основни данни"}>
        {editing && editForm ? (
          <AthleteIdentityFields
            form={editForm}
            setForm={setEditForm}
            identityLocked={Boolean(profile.bvf_player_id || profile.bvf_identity_locked)}
            showLegacyNameHint
            showEgn
          />
        ) : (
        <div className="athleteProfileBasicGrid">
          <div className="athleteProfileBlock">
            <h4 className="athleteProfileBlockTitle">Лични данни</h4>
            <dl className="athleteProfileDl">
              <div>
                <dt>Състезател</dt>
                <dd>{fmtMissing(profile.athlete_name)}</dd>
              </div>
              <div>
                <dt>Три имена</dt>
                <dd>
                  {fmtMissing(
                    [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ") || null
                  )}
                </dd>
              </div>
              <div>
                <dt>Дата на раждане</dt>
                <dd>{fmtMissing(profile.birth_date ? String(profile.birth_date).slice(0, 10) : null)}</dd>
              </div>
              <div>
                <dt>Година на раждане</dt>
                <dd>{fmtMissing(birthYearVal)}</dd>
              </div>
              <div>
                <dt>Град</dt>
                <dd>{fmtMissing(profile.place_of_birth)}</dd>
              </div>
              <div>
                <dt>Националност</dt>
                <dd>{fmtMissing(profile.nationality)}</dd>
              </div>
              <div>
                <dt>Пол</dt>
                <dd>{fmtMissing(genderLabelBg(profile.gender))}</dd>
              </div>
              <div>
                <dt>Възраст (на база година)</dt>
                <dd>{ageYears != null ? `${ageYears} г.` : "няма данни"}</dd>
              </div>
              <div>
                <dt>БФВ</dt>
                <dd>
                  {profile.bvf_player_id
                    ? `№ ${profile.bvf_player_number || profile.bvf_player_id}`
                    : profile.bvf_ready
                      ? "Готов за връзка (без снимка)"
                      : profile.bvf_missing?.length
                        ? `Липсва: ${profile.bvf_missing.filter((m) => m !== "снимка").join(", ")}`
                        : "Не е свързан"}
                </dd>
              </div>
              <div>
                <dt>Телефон на състезател</dt>
                <dd>{fmtMissing(profile.athlete_phone)}</dd>
              </div>
            </dl>
          </div>

          <div className="athleteProfileBlock">
            <h4 className="athleteProfileBlockTitle">Родител / контакт</h4>
            <dl className="athleteProfileDl">
              <div>
                <dt>Родител</dt>
                <dd>{fmtMissing(profile.parent_name)}</dd>
              </div>
              <div>
                <dt>Телефон на родител</dt>
                <dd>{fmtMissing(profile.parent_phone)}</dd>
              </div>
            </dl>
          </div>

          <div className="athleteProfileBlock athleteProfileBlock--full">
            <h4 className="athleteProfileBlockTitle">Отбор и статус</h4>
            <dl className="athleteProfileDl athleteProfileDl--inline">
              <div>
                <dt>Отбори</dt>
                <dd>{(profile.teams || []).filter(Boolean).length ? (profile.teams || []).join(", ") : "няма данни"}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>
                  <span className={`uiBadge ${profile.is_active ? "uiBadge--success" : "uiBadge--danger"}`}>
                    {profile.is_active ? "Активен" : "Неактивен"}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
        )}
      </Card>

      {canManageSek ? (
        <BvfCreateAthleteModal
          open={bvfOpen}
          onClose={() => setBvfOpen(false)}
          athleteId={profile.athlete_id}
          athleteName={profile.athlete_name}
          initialEgn={profile.egn || ""}
          missing={profile.bvf_missing || []}
          hasPhoto={Boolean(profile.has_photo)}
          toast={toast}
          onCreated={async () => {
            const res = await axiosInstance.get(API_PATHS.TEAM_ATHLETE_PROFILE(athleteId));
            setProfile(res.data || null);
          }}
        />
      ) : null}

      <Card title="Обобщение на присъствие">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="uiBadge uiBadge--success">Присъства: {profile.attendance_summary?.present || 0}</span>
          <span className="uiBadge uiBadge--warning">Закъсня: {profile.attendance_summary?.late || 0}</span>
          <span className="uiBadge uiBadge--danger">Отсъства: {profile.attendance_summary?.absent || 0}</span>
          <span className="uiBadge uiBadge--secondary">Извинен: {profile.attendance_summary?.excused || 0}</span>
          <span className="uiBadge uiBadge--info">Процент: {profile.attendance_summary?.attendance_rate_percent || 0}%</span>
        </div>
      </Card>

      <Card title="Родителски достъп">
        <p className="athleteParentAccessIntro">
          Родителите влизат с телефон на родителя и година на раждане на детето (като ПИН).
          Профилът показва присъствие, график и месечни такси.
        </p>
        <div className="athleteParentAccessActions">
          <Button as={Link} to={parentLoginPath()} size="sm" target="_blank" rel="noopener noreferrer">
            Отвори родителски вход
          </Button>
          <Button size="sm" variant="secondary" onClick={copyParentLoginUrl}>
            Копирай адрес
          </Button>
        </div>
        <p className="uiHint athleteParentAccessHint">
          Адрес: <span className="athleteParentAccessUrl">{parentLoginUrl()}</span>
        </p>
        {!profile.parent_phone || !birthYearVal ? (
          <p className="uiErrorText athleteParentAccessWarn">
            {!profile.parent_phone ? "Липсва телефон на родител — попълнете го в профила. " : ""}
            {!birthYearVal ? "Липсва година на раждане — родителят няма да може да влезе." : ""}
          </p>
        ) : null}
      </Card>

      <Card title="Последни присъствия">
        {(profile.last_attendance || []).length === 0 ? (
          <EmptyState title="Няма присъствия" description="Все още няма записани тренировки за този състезател." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Отбор</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profile.last_attendance || []).map((row, idx) => (
                <TableRow key={`${row.date}-${row.team_name}-${idx}`}>
                  <TableCell>{row.date ? fmtMissing(row.date) : "няма данни"}</TableCell>
                  <TableCell>{fmtMissing(row.team_name)}</TableCell>
                  <TableCell>
                    <span className={`uiBadge ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {showFees ? (
      <Card
        title="Месечни такси (последни 12 месеца)"
        subtitle="Зелено: платено. Червено: липсва записано плащане за месеца."
        actions={
          <div className="athleteProfileCardActions">
            <Button as={Link} to={feesPayHref} size="sm">
              Добави плащане
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={scrollToHistory}>
              История
            </Button>
            <Button as={Link} to={feesHref} variant="secondary" size="sm">
              Всички такси
            </Button>
          </div>
        }
      >
        {(profile.monthly_payments || []).length === 0 ? (
          <EmptyState title="Няма данни за месеци" description="Няма изчислен прозорец от месеци." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месец</TableHead>
                <TableHead>Сума</TableHead>
                <TableHead>Дата на плащане</TableHead>
                <TableHead>Записал</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profile.monthly_payments || []).map((row) => {
                const paid = paymentPaid(row);
                return (
                  <TableRow key={`${row.month_key}-${paid ? row.paid_at || "" : "unpaid"}`}>
                    <TableCell>{row.month_key}</TableCell>
                    <TableCell>{paid ? formatMoney(row.amount) : "—"}</TableCell>
                    <TableCell>{row.paid_at ? new Date(row.paid_at).toLocaleString("bg-BG") : "—"}</TableCell>
                    <TableCell>{paid ? (String(row.recorded_by_name || "").trim() || "—") : "—"}</TableCell>
                    <TableCell>
                      <span className={`uiBadge ${paid ? "uiBadge--success" : "uiBadge--danger"}`}>
                        {paid ? "Платено" : "Дължи"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      ) : null}

      <Card id="athlete-history" title="История на състезателя" subtitle="Подредено по дата (най-нови отгоре). За редакции без отделен журнал авторът не е наличен.">
        {!(profile.timeline || []).length ? (
          <EmptyState title="Няма събития" description="Все още няма събития за тази версия на историята." />
        ) : (
          <ul className="athleteTimeline">
            {(profile.timeline || []).map((ev, i) => {
              const when = ev.at ? new Date(ev.at).toLocaleString("bg-BG") : "няма данни";
              const who = ev.actor_name ? ` · ${ev.actor_name}` : "";
              const detail = ev.detail ? ` · ${ev.detail}` : "";
              return (
                <li key={`${ev.kind}-${i}-${when}`}>
                  <div className="athleteTimelineLine">
                    <span className="athleteTimelineWhen">{when}</span>
                    <span className="athleteTimelineLabel">{ev.label || ev.kind}</span>
                    <span className="athleteTimelineMeta">
                      {who}
                      {detail}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
