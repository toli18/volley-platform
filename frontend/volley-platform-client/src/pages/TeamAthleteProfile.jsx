import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { parentLoginPath, parentLoginUrl } from "../utils/parentAuth";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { formatMoney } from "../utils/currency";
import { normalizeError } from "../utils/normalizeError";

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
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const fromPath = new URLSearchParams(location.search).get("from") || "/coach/teams";

  const feesHref = useMemo(() => {
    const id = profile?.athlete_id;
    if (!id) return "/monthly-fees";
    return `/monthly-fees?athlete_id=${encodeURIComponent(id)}`;
  }, [profile?.athlete_id]);

  const feesEditHref = useMemo(() => {
    const id = profile?.athlete_id;
    if (!id) return "/monthly-fees";
    return `/monthly-fees?athlete_id=${encodeURIComponent(id)}&focus=edit`;
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
        subtitle="Присъствие, отбори, такси и история на едно място."
        actions={
          <div className="athleteProfileHeroActions">
            <Button as={Link} to={feesEditHref} variant="primary">
              Редактирай профил
            </Button>
            <Button type="button" variant="secondary" onClick={scrollToHistory}>
              История
            </Button>
            <Button as={Link} to={fromPath} variant="secondary">
              Назад към Отбори
            </Button>
          </div>
        }
      />

      <Card title="Основни данни">
        <div className="athleteProfileBasicGrid">
          <div className="athleteProfileBlock">
            <h4 className="athleteProfileBlockTitle">Лични данни</h4>
            <dl className="athleteProfileDl">
              <div>
                <dt>Състезател</dt>
                <dd>{fmtMissing(profile.athlete_name)}</dd>
              </div>
              <div>
                <dt>Година на раждане</dt>
                <dd>{fmtMissing(birthYearVal)}</dd>
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
      </Card>

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
