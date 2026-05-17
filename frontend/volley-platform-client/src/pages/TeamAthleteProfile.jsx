import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import axiosInstance from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import { useToast } from "../components/ToastProvider";
import { Button, Card, EmptyState, PageHero, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui";
import { formatMoney } from "../utils/currency";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка при зареждане на профила.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || "Невалидни данни (422).";
  return "Грешка при зареждане на профила.";
};

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
  const [parentAccess, setParentAccess] = useState({ has_active_token: false, parent_url: null, token_preview: null });
  const [parentQrUrl, setParentQrUrl] = useState("");
  const [parentBusy, setParentBusy] = useState(false);
  const fromPath = new URLSearchParams(location.search).get("from") || "/teams";

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

  useEffect(() => {
    let cancelled = false;
    const loadParentAccess = async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.ATHLETE_PARENT_ACCESS_GET(athleteId));
        if (!cancelled) setParentAccess(res.data || { has_active_token: false });
      } catch {
        if (!cancelled) setParentAccess({ has_active_token: false, parent_url: null, token_preview: null });
      }
    };
    loadParentAccess();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const createParentLink = async () => {
    try {
      setParentBusy(true);
      const res = await axiosInstance.post(API_PATHS.ATHLETE_PARENT_ACCESS_CREATE(athleteId), {});
      const data = res.data || {};
      setParentQrUrl(data.parent_url || "");
      setParentAccess({ has_active_token: true, parent_url: data.parent_url || null, token_preview: data.token_preview || null });
      toast.success("Родителският линк е създаден.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setParentBusy(false);
    }
  };

  const rotateParentLink = async () => {
    try {
      setParentBusy(true);
      const res = await axiosInstance.post(API_PATHS.ATHLETE_PARENT_ACCESS_ROTATE(athleteId), {});
      const data = res.data || {};
      setParentQrUrl(data.parent_url || "");
      setParentAccess({ has_active_token: true, parent_url: data.parent_url || null, token_preview: data.token_preview || null });
      toast.success("Родителският линк е обновен.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setParentBusy(false);
    }
  };

  const revokeParentLink = async () => {
    if (!window.confirm("Сигурни ли сте, че искате да спрете родителския достъп?")) return;
    try {
      setParentBusy(true);
      await axiosInstance.delete(API_PATHS.ATHLETE_PARENT_ACCESS_REVOKE(athleteId));
      setParentAccess({ has_active_token: false, parent_url: null, token_preview: null });
      setParentQrUrl("");
      toast.success("Родителският достъп е спрян.");
    } catch (err) {
      toast.error(normalizeError(err));
    } finally {
      setParentBusy(false);
    }
  };

  const copyParentLink = async () => {
    const link = parentQrUrl || parentAccess.parent_url;
    if (!link) {
      toast.error("Няма активен линк за копиране.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Линкът е копиран.");
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

      <Card title="Родителски достъп (QR)">
        <div className="athleteParentAccessBox" style={{ display: "grid", gap: 10 }}>
          <div className="athleteParentAccessActions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" disabled={parentBusy} onClick={createParentLink}>Генерирай QR</Button>
            <Button size="sm" variant="secondary" disabled={parentBusy} onClick={copyParentLink}>Копирай линк</Button>
            <Button size="sm" variant="secondary" disabled={parentBusy} onClick={rotateParentLink}>Регенерирай</Button>
            <Button size="sm" variant="danger" disabled={parentBusy} onClick={revokeParentLink}>Спри достъпа</Button>
          </div>
          <div style={{ color: "#607693", fontSize: 13 }}>
            Профилът за родител показва: присъствие, месечен график и такси.
          </div>
          {(parentQrUrl || parentAccess.parent_url) ? (
            <div className="athleteParentAccessQr" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
              <QRCodeSVG value={parentQrUrl || parentAccess.parent_url} size={168} />
              <div style={{ wordBreak: "break-all", fontSize: 12, color: "#475569" }}>{parentQrUrl || parentAccess.parent_url}</div>
            </div>
          ) : (
            <div className="uiMuted">Няма генериран активен QR линк.</div>
          )}
        </div>
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
