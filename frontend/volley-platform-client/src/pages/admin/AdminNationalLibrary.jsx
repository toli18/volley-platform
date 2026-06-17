import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import {
  AdminHero,
  AdminSection,
  Button,
  Card,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

const normalizeError = (err) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Грешка";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail[0]?.msg || "Грешка (422)";
  return "Грешка";
};

const TABS = [
  { id: "sources", label: "Източници" },
  { id: "articles", label: "Методика" },
  { id: "cycles", label: "Цикли" },
  { id: "drills", label: "Упражнения БФВ" },
  { id: "inventory", label: "Инвентар" },
];

export default function AdminNationalLibrary() {
  const toast = useToast();
  const [tab, setTab] = useState("articles");
  const [meta, setMeta] = useState(null);
  const [sources, setSources] = useState([]);
  const [articles, setArticles] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceForm, setSourceForm] = useState({
    filename: "",
    content_type: "methodology",
    age_band: "all",
    extracted_text: "",
    wave: 1,
  });
  const [articleForm, setArticleForm] = useState({
    title_bg: "",
    body_bg: "",
    category: "methodology",
    age_band: "all",
    status: "draft",
  });
  const [cycleForm, setCycleForm] = useState({
    title_bg: "",
    summary_bg: "",
    cycle_type: "meso",
    weeks: 4,
    age_band: "U14",
    structure_json: "{}",
    status: "draft",
  });
  const [drillForm, setDrillForm] = useState({ title: "", instructions: "", coaching_points: "", age_min: 14, age_max: 16 });
  const [importing, setImporting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [seedingAnnual, setSeedingAnnual] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [m, s, a, c, d] = await Promise.all([
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_META),
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_ADMIN_SOURCES),
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_ADMIN_ARTICLES),
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_ADMIN_CYCLES),
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_ADMIN_DRILLS),
      ]);
      setMeta(m.data);
      setSources(Array.isArray(s.data) ? s.data : []);
      setArticles(Array.isArray(a.data) ? a.data : []);
      setCycles(Array.isArray(c.data) ? c.data : []);
      setDrills(Array.isArray(d.data) ? d.data : []);
    } catch (e) {
      toast.error(normalizeError(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const runPurgeLegacy = async (dryRun = false) => {
    const msg = dryRun
      ? "Пробен преглед: колко стари записа ще се изтрият?"
      : "Изтрива стари EN/GTP/PDF/Volley Comment записи. Запазва учебника БФВ и курираните BG упражнения. Продължаваш?";
    if (!window.confirm(msg)) return;
    try {
      setPurging(true);
      const res = await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_PURGE_LEGACY, null, {
        params: { dry_run: dryRun },
      });
      const s = res.data || {};
      toast.success(
        dryRun
          ? `Проба: ${s.articles_deleted ?? 0} статии, ${s.drills_deleted ?? 0} упражнения за изтриване`
          : `Готово: изтрити ${s.articles_deleted ?? 0} статии, ${s.drills_deleted ?? 0} упражнения. Национални: ${s.national_drills_restored ?? "—"}`
      );
      if (!dryRun) loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    } finally {
      setPurging(false);
    }
  };

  const runLibraryImport = async () => {
    try {
      setImporting(true);
      const res = await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_IMPORT_LIBRARY, null, {
        params: {},
      });
      const t = res.data?.totals;
      const arch = res.data?.archive;
      toast.success(
        t
          ? `Публикувани: ${t.articles_published} статии, ${t.cycles_published} цикла, ${t.federation_drills} упражнения. Чернови PDF: ${t.articles_draft ?? 0}${arch?.pdf_draft_articles_added ? ` (+${arch.pdf_draft_articles_added} нови)` : ""}`
          : "Импортът завърши"
      );
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    } finally {
      setImporting(false);
    }
  };

  const runSeedAnnualProgram = async () => {
    if (
      !window.confirm(
        "Обновява мезо/макро циклите на годишната програма (mini, U13, U14, U16, U18) в базата. Продължаваш?"
      )
    ) {
      return;
    }
    try {
      setSeedingAnnual(true);
      const res = await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_SEED_ANNUAL, null, {
        params: { replace: true },
      });
      const stats = res.data?.stats || {};
      toast.success(
        `Годишна програма: +${stats.created ?? 0} нови, ${stats.updated ?? 0} обновени. Публикувани цикли: ${res.data?.published_cycles ?? "—"}`
      );
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    } finally {
      setSeedingAnnual(false);
    }
  };

  const createSource = async () => {
    try {
      await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_SOURCES, sourceForm);
      toast.success("Източникът е добавен");
      setSourceForm({ filename: "", content_type: "methodology", age_band: "all", extracted_text: "", wave: 1 });
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const extractSource = async (id) => {
    try {
      await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_SOURCE_EXTRACT(id));
      toast.success("Маркиран като извлечен");
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const publishSource = async (id, status) => {
    try {
      await axiosInstance.patch(API_PATHS.NATIONAL_METHOD_ADMIN_SOURCE(id), { ingest_status: status });
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const createArticle = async () => {
    try {
      await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_ARTICLES, articleForm);
      toast.success("Статията е създадена");
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const toggleArticlePublish = async (row) => {
    const next = row.status === "published" ? "draft" : "published";
    try {
      await axiosInstance.patch(API_PATHS.NATIONAL_METHOD_ADMIN_ARTICLE(row.id), { status: next });
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const createCycle = async () => {
    let structure = {};
    try {
      structure = JSON.parse(cycleForm.structure_json || "{}");
    } catch {
      toast.error("structure_json трябва да е валиден JSON");
      return;
    }
    try {
      await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_CYCLES, { ...cycleForm, structure_json: structure });
      toast.success("Цикълът е създаден");
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const toggleCyclePublish = async (row) => {
    const next = row.status === "published" ? "draft" : "published";
    try {
      await axiosInstance.patch(API_PATHS.NATIONAL_METHOD_ADMIN_CYCLE(row.id), { status: next });
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  const createDrill = async () => {
    try {
      await axiosInstance.post(API_PATHS.NATIONAL_METHOD_ADMIN_DRILLS, drillForm);
      toast.success("Упражнението е добавено");
      loadAll();
    } catch (e) {
      toast.error(normalizeError(e));
    }
  };

  return (
    <div className="uiPage adminTheme">
      <AdminHero
        title="Национална методична библиотека"
        subtitle="БФВ: източници, методика, периодизация и официални упражнения (само текст на български)."
        actions={
          <Link to="/admin">
            <Button variant="secondary">← Админ</Button>
          </Link>
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
        <Button variant="secondary" onClick={loadAll}>
          Обнови
        </Button>
        <Button variant="primary" onClick={runLibraryImport} disabled={importing || purging || seedingAnnual}>
          {importing ? "Импорт..." : "Импорт учебник БФВ"}
        </Button>
        <Button variant="secondary" onClick={runSeedAnnualProgram} disabled={importing || purging || seedingAnnual}>
          {seedingAnnual ? "Обновяване..." : "Обнови годишна програма"}
        </Button>
        <Button variant="secondary" onClick={() => runPurgeLegacy(true)} disabled={importing || purging || seedingAnnual}>
          Проба: почисти старо
        </Button>
        <Button variant="secondary" onClick={() => runPurgeLegacy(false)} disabled={importing || purging || seedingAnnual}>
          {purging ? "Почистване..." : "Почисти стара библиотека (1×)"}
        </Button>
      </div>

      <Card style={{ padding: 12, marginBottom: 16, background: "#fff8e6", border: "1px solid #f0d78c" }}>
        <strong>След deploy (от админа)</strong>
        <p className="uiMuted" style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}>
          1) <strong>Импорт учебник БФВ</strong> — конспекти и методика в базата. 2){" "}
          <strong>Обнови годишна програма</strong> — мезоцикли за mini/U13/U14/U16/U18. Почистването на
          стара библиотека е еднократно.
        </p>
      </Card>

      {loading && <p className="uiMuted">Зареждане...</p>}

      {tab === "inventory" && (
        <AdminSection title="Референтен инвентар на материали">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Файл</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Възраст</TableHead>
                <TableHead>Вълна</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(meta?.material_inventory || []).map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.filename_hint}</TableCell>
                  <TableCell>{row.content_type}</TableCell>
                  <TableCell>{row.age_band}</TableCell>
                  <TableCell>{row.wave}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminSection>
      )}

      {tab === "sources" && (
        <AdminSection title="Източници (админ архив)">
          <Card style={{ marginBottom: 16, padding: 16, display: "grid", gap: 8 }}>
            <Input
              placeholder="Име на файл"
              value={sourceForm.filename}
              onChange={(e) => setSourceForm((f) => ({ ...f, filename: e.target.value }))}
            />
            <textarea
              className="uiInput"
              rows={4}
              placeholder="Извлечен текст (IT или BG чернова)"
              value={sourceForm.extracted_text}
              onChange={(e) => setSourceForm((f) => ({ ...f, extracted_text: e.target.value }))}
            />
            <Button onClick={createSource}>Регистрирай източник</Button>
          </Card>
          {sources.length === 0 ? (
            <EmptyState title="Няма източници" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.filename}</TableCell>
                    <TableCell>{s.ingest_status}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="secondary" onClick={() => extractSource(s.id)}>
                        Extract
                      </Button>{" "}
                      <Button size="sm" onClick={() => publishSource(s.id, "published")}>
                        Публикуван архив
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </AdminSection>
      )}

      {tab === "articles" && (
        <AdminSection title="Методични статии">
          <Card style={{ marginBottom: 16, padding: 16, display: "grid", gap: 8 }}>
            <Input
              placeholder="Заглавие (BG)"
              value={articleForm.title_bg}
              onChange={(e) => setArticleForm((f) => ({ ...f, title_bg: e.target.value }))}
            />
            <textarea
              className="uiInput"
              rows={6}
              placeholder="Текст (Markdown)"
              value={articleForm.body_bg}
              onChange={(e) => setArticleForm((f) => ({ ...f, body_bg: e.target.value }))}
            />
            <Button onClick={createArticle}>Създай статия</Button>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заглавие</TableHead>
                <TableHead>Възраст</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.title_bg}</TableCell>
                  <TableCell>{a.age_band}</TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => toggleArticlePublish(a)}>
                      {a.status === "published" ? "Свали" : "Публикувай"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminSection>
      )}

      {tab === "cycles" && (
        <AdminSection title="Микро / мезо / макро цикли">
          <Card style={{ marginBottom: 16, padding: 16, display: "grid", gap: 8 }}>
            <Input
              placeholder="Заглавие"
              value={cycleForm.title_bg}
              onChange={(e) => setCycleForm((f) => ({ ...f, title_bg: e.target.value }))}
            />
            <Input
              placeholder="Резюме"
              value={cycleForm.summary_bg}
              onChange={(e) => setCycleForm((f) => ({ ...f, summary_bg: e.target.value }))}
            />
            <textarea
              className="uiInput"
              rows={8}
              placeholder='structure_json (седмици)'
              value={cycleForm.structure_json}
              onChange={(e) => setCycleForm((f) => ({ ...f, structure_json: e.target.value }))}
            />
            <Button onClick={createCycle}>Създай цикъл</Button>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заглавие</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Възраст</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.title_bg}</TableCell>
                  <TableCell>{c.cycle_type}</TableCell>
                  <TableCell>{c.age_band}</TableCell>
                  <TableCell>{c.status}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => toggleCyclePublish(c)}>
                      {c.status === "published" ? "Свали" : "Публикувай"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminSection>
      )}

      {tab === "drills" && (
        <AdminSection title="Национални упражнения">
          <Card style={{ marginBottom: 16, padding: 16, display: "grid", gap: 8 }}>
            <Input
              placeholder="Заглавие"
              value={drillForm.title}
              onChange={(e) => setDrillForm((f) => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className="uiInput"
              rows={3}
              placeholder="Инструкции"
              value={drillForm.instructions}
              onChange={(e) => setDrillForm((f) => ({ ...f, instructions: e.target.value }))}
            />
            <Button onClick={createDrill}>Добави упражнение</Button>
          </Card>
          <p className="uiMuted">{drills.length} национални упражнения</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Заглавие</TableHead>
                <TableHead>Възраст</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drills.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.id}</TableCell>
                  <TableCell>{d.title}</TableCell>
                  <TableCell>
                    {d.age_min}–{d.age_max}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminSection>
      )}
    </div>
  );
}
