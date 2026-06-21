// src/pages/admin/AdminAssessmentBattery.jsx
import { useEffect, useMemo, useState } from "react";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { AdminHero, AdminSection, Button, Card, EmptyState, Input } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const CATEGORY_LABELS = {
  technical: "Технически",
  speed: "Бързина",
  physical: "Физически",
  anthropometry: "Антропометрия",
};
const CATEGORY_ORDER = ["technical", "speed", "physical", "anthropometry"];
const DIRECTION_LABELS = {
  higher_better: "↑ повече = по-добре",
  lower_better: "↓ по-малко = по-добре",
  context: "контекст",
};
const ACTION_LABELS = {
  create: "създаден",
  update: "редактиран",
  activate: "активиран",
  deactivate: "деактивиран",
  delete: "изтрит",
};

function formatChanges(changes) {
  if (!changes || typeof changes !== "object") return "";
  return Object.entries(changes)
    .map(([field, val]) =>
      Array.isArray(val) ? `${field}: ${val[0] ?? "—"} → ${val[1] ?? "—"}` : `${field}: ${val ?? "—"}`
    )
    .join("; ");
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString("bg-BG");
}

const EMPTY_FORM = {
  code: "",
  name: "",
  category: "technical",
  unit: "",
  direction: "higher_better",
  protocol: "",
  video_url: "",
  age_min: "",
  age_max: "",
  battery_version: "",
  sort_order: 0,
};

const normalizeError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail?.[0]?.msg || fallback;
  return fallback;
};

export default function AdminAssessmentBattery() {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { mode: 'create'|'edit', code? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [audit, setAudit] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY_ADMIN);
      setTests(Array.isArray(res.data) ? res.data : []);
      if (showAudit) loadAudit();
    } catch (err) {
      const msg = normalizeError(err, "Грешка при зареждане на батерията.");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      setAuditLoading(true);
      const res = await axiosInstance.get(API_PATHS.ASSESSMENT_BATTERY_AUDIT);
      setAudit(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при зареждане на журнала."));
    } finally {
      setAuditLoading(false);
    }
  };

  const toggleAudit = () => {
    const next = !showAudit;
    setShowAudit(next);
    if (next && !audit.length) loadAudit();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const t of tests) {
      const cat = CATEGORY_ORDER.includes(t.category) ? t.category : "other";
      (map[cat] ||= []).push(t);
    }
    return map;
  }, [tests]);

  const orderedCats = useMemo(
    () => [...CATEGORY_ORDER, "other"].filter((c) => grouped[c]?.length),
    [grouped]
  );

  const isEditingLocked = editing?.mode === "edit" && editing?.locked;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing({ mode: "create" });
  };

  const openEdit = (t) => {
    setForm({
      code: t.code,
      name: t.name || "",
      category: t.category,
      unit: t.unit || "",
      direction: t.direction,
      protocol: t.protocol || "",
      video_url: t.video_url || "",
      age_min: t.age_min ?? "",
      age_max: t.age_max ?? "",
      battery_version: t.battery_version || "",
      sort_order: t.sort_order ?? 0,
    });
    setEditing({ mode: "edit", code: t.code, locked: t.is_locked });
  };

  const closeForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const buildPayload = (forCreate) => {
    const payload = {
      name: form.name.trim(),
      protocol: form.protocol.trim() || null,
      video_url: form.video_url.trim() || null,
      age_min: form.age_min === "" ? null : Number(form.age_min),
      age_max: form.age_max === "" ? null : Number(form.age_max),
      sort_order: Number(form.sort_order) || 0,
      battery_version: form.battery_version.trim() || null,
    };
    // Полета за сравнимост — изпращат се при създаване или ако тестът не е заключен.
    if (forCreate || !isEditingLocked) {
      payload.category = form.category;
      payload.unit = form.unit.trim();
      payload.direction = form.direction;
    }
    if (forCreate) payload.code = form.code.trim();
    return payload;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const forCreate = editing?.mode === "create";
    if (forCreate && form.code.trim().length < 2) {
      toast.error("Кодът трябва да е поне 2 символа.");
      return;
    }
    if (form.name.trim().length < 2) {
      toast.error("Името трябва да е поне 2 символа.");
      return;
    }
    try {
      setSaving(true);
      if (forCreate) {
        await axiosInstance.post(API_PATHS.ASSESSMENT_BATTERY_CREATE, buildPayload(true));
        toast.success("Тестът е създаден.");
      } else {
        await axiosInstance.patch(API_PATHS.ASSESSMENT_BATTERY_UPDATE(editing.code), buildPayload(false));
        toast.success("Промените са запазени.");
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при запис."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t) => {
    try {
      await axiosInstance.patch(API_PATHS.ASSESSMENT_BATTERY_UPDATE(t.code), { is_active: !t.is_active });
      toast.success(t.is_active ? "Тестът е деактивиран." : "Тестът е активиран.");
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при промяна на статуса."));
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Изтриване на „${t.name}“ (${t.code})? Това е необратимо.`)) return;
    try {
      await axiosInstance.delete(API_PATHS.ASSESSMENT_BATTERY_DELETE(t.code));
      toast.success("Тестът е изтрит.");
      await load();
    } catch (err) {
      toast.error(normalizeError(err, "Грешка при изтриване."));
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Тестова батерия — управление"
        subtitle="Каноничният национален стандарт. Полетата за сравнимост се заключват, след като тест е използван в резултати."
        actions={
          <>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Обнови
            </Button>
            <Button onClick={openCreate}>+ Нов тест</Button>
          </>
        }
      />

      {error && <div className="uiAlert uiAlert--danger">{error}</div>}

      {editing ? (
        <AdminSection title={editing.mode === "create" ? "Нов тест" : `Редакция — ${editing.code}`}>
          <Card>
            <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <Input
                  label="Код"
                  value={form.code}
                  onChange={setField("code")}
                  disabled={editing.mode === "edit"}
                  hint={editing.mode === "edit" ? "Кодът е immutable" : "Уникален, напр. TECH_PASS_TOP"}
                />
                <Input label="Име" value={form.name} onChange={setField("name")} />
                <Input
                  as="select"
                  label="Категория"
                  value={form.category}
                  onChange={setField("category")}
                  disabled={isEditingLocked}
                  hint={isEditingLocked ? "Заключено (използван тест)" : undefined}
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Input>
                <Input
                  label="Мерна единица"
                  value={form.unit}
                  onChange={setField("unit")}
                  disabled={isEditingLocked}
                  hint={isEditingLocked ? "Заключено (използван тест)" : "напр. points, cm, sec, kg"}
                />
                <Input
                  as="select"
                  label="Посока"
                  value={form.direction}
                  onChange={setField("direction")}
                  disabled={isEditingLocked}
                  hint={isEditingLocked ? "Заключено (използван тест)" : undefined}
                >
                  {Object.entries(DIRECTION_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Input>
                <Input label="Версия на батерията" value={form.battery_version} onChange={setField("battery_version")} hint="Празно = текущата" />
                <Input type="number" label="Възраст от" value={form.age_min} onChange={setField("age_min")} />
                <Input type="number" label="Възраст до" value={form.age_max} onChange={setField("age_max")} />
                <Input type="number" label="Подредба" value={form.sort_order} onChange={setField("sort_order")} />
                <Input label="Видео (URL)" value={form.video_url} onChange={setField("video_url")} />
              </div>
              <Input as="textarea" label="Протокол" value={form.protocol} onChange={setField("protocol")} rows={4} />
              {isEditingLocked ? (
                <div className="uiAlert">
                  Този тест вече е използван в резултати. За промяна на категория/мярка/посока създайте
                  нова версия с нов код, за да запазите сравнимостта на историческите данни.
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                <Button type="submit" disabled={saving}>
                  {saving ? "Запазване..." : "Запази"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                  Отказ
                </Button>
              </div>
            </form>
          </Card>
        </AdminSection>
      ) : null}

      {loading && !tests.length ? (
        <p className="uiMuted">Зареждане...</p>
      ) : !tests.length ? (
        <EmptyState title="Няма тестове" description="Добавете първия тест в батерията." />
      ) : (
        orderedCats.map((cat) => (
          <AdminSection key={cat} title={CATEGORY_LABELS[cat] || "Други"}>
            <Card>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#607693" }}>
                      <th style={{ padding: "6px 8px" }}>Код</th>
                      <th style={{ padding: "6px 8px" }}>Име</th>
                      <th style={{ padding: "6px 8px" }}>Мярка</th>
                      <th style={{ padding: "6px 8px" }}>Посока</th>
                      <th style={{ padding: "6px 8px" }}>Версия</th>
                      <th style={{ padding: "6px 8px" }}>Статус</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[cat].map((t) => (
                      <tr key={t.code} style={{ borderTop: "1px solid #eef3fa", opacity: t.is_active ? 1 : 0.55 }}>
                        <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{t.code}</td>
                        <td style={{ padding: "6px 8px" }}>{t.name}</td>
                        <td style={{ padding: "6px 8px" }}>{t.unit}</td>
                        <td style={{ padding: "6px 8px" }}>{DIRECTION_LABELS[t.direction] || t.direction}</td>
                        <td style={{ padding: "6px 8px" }}>{t.battery_version}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <span className={`uiBadge ${t.is_active ? "uiBadge--success" : ""}`}>
                              {t.is_active ? "активен" : "деактивиран"}
                            </span>
                            {t.is_locked ? (
                              <span className="uiBadge uiBadge--danger" title={`Използван в ${t.usage_count} резултата`}>
                                заключен · {t.usage_count}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                            Редактирай
                          </Button>{" "}
                          <Button size="sm" variant="secondary" onClick={() => toggleActive(t)}>
                            {t.is_active ? "Деактивирай" : "Активирай"}
                          </Button>{" "}
                          {!t.is_locked ? (
                            <Button size="sm" variant="danger" onClick={() => remove(t)}>
                              Изтрий
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </AdminSection>
        ))
      )}

      <AdminSection
        title="Журнал на промените"
        actions={
          <Button variant="secondary" size="sm" onClick={toggleAudit}>
            {showAudit ? "Скрий" : "Покажи журнал"}
          </Button>
        }
      >
        {showAudit ? (
          <Card>
            {auditLoading ? (
              <p className="uiMuted">Зареждане...</p>
            ) : !audit.length ? (
              <EmptyState title="Няма записи" description="Промените по батерията се журналират тук." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#607693" }}>
                      <th style={{ padding: "6px 8px" }}>Кога</th>
                      <th style={{ padding: "6px 8px" }}>Тест</th>
                      <th style={{ padding: "6px 8px" }}>Действие</th>
                      <th style={{ padding: "6px 8px" }}>Кой</th>
                      <th style={{ padding: "6px 8px" }}>Промени</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((row) => (
                      <tr key={row.id} style={{ borderTop: "1px solid #eef3fa" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatTimestamp(row.created_at)}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{row.test_code}</td>
                        <td style={{ padding: "6px 8px" }}>{ACTION_LABELS[row.action] || row.action}</td>
                        <td style={{ padding: "6px 8px" }}>{row.actor_name || "—"}</td>
                        <td style={{ padding: "6px 8px", color: "#475569" }}>{formatChanges(row.changes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : (
          <p className="uiMuted">Кой, кога и какво е променил по батерията (национален стандарт).</p>
        )}
      </AdminSection>
    </div>
  );
}
