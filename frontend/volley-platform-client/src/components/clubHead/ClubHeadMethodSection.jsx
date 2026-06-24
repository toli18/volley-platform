import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { useToast } from "../ToastProvider";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABELS = {
  active: "Активен",
  paused: "На пауза",
  completed: "Приключен",
};

function aiPreviewUrl(cycleId, ageBand, week) {
  const params = new URLSearchParams({ ageBand: ageBand || "U14" });
  if (cycleId) params.set("cycleId", String(cycleId));
  if (week) params.set("cycleWeek", String(week));
  return `/ai-generator?${params.toString()}`;
}

export default function ClubHeadMethodSection({ teams = [], coaches = [] }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [cycles, setCycles] = useState([]);
  const [annualCycles, setAnnualCycles] = useState([]);
  const [instances, setInstances] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [instanceForm, setInstanceForm] = useState({
    team_id: "",
    age_band: "",
    macro_id: "",
    cycle_id: "",
    start_date: today(),
    start_meso: "",
  });
  const [instancePreview, setInstancePreview] = useState(null);
  const [assignForm, setAssignForm] = useState({
    assignee_ids: [],
    title_bg: "",
    guidance_bg: "",
    cycle_id: "",
    week_ref: "",
    due_date: "",
    drill_ids: "",
  });

  const load = useCallback(async () => {
    try {
      const [lib, annual, inst, asg] = await Promise.all([
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY),
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_ANNUAL_CYCLES),
        axiosInstance.get(API_PATHS.CLUB_CYCLE_INSTANCES),
        axiosInstance.get(API_PATHS.CLUB_METHOD_ASSIGNMENTS),
      ]);
      setCycles(lib.data?.cycles || []);
      setAnnualCycles(Array.isArray(annual.data) ? annual.data : []);
      setInstances(Array.isArray(inst.data) ? inst.data : []);
      setAssignments(Array.isArray(asg.data) ? asg.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const publishInstance = async () => {
    if (!instanceForm.team_id || !instanceForm.cycle_id) {
      toast.error("Изберете отбор и мезо шаблон");
      return;
    }
    try {
      await axiosInstance.post(API_PATHS.CLUB_CYCLE_INSTANCES, {
        team_id: Number(instanceForm.team_id),
        cycle_id: Number(instanceForm.cycle_id),
        start_date: instanceForm.start_date,
        customizations_json: instanceForm.start_meso
          ? { start_meso: Number(instanceForm.start_meso) }
          : null,
      });
      toast.success("Цикълът е пуснат към отбора");
      setInstanceForm((f) => ({ ...f, start_meso: "" }));
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
    }
  };

  const updateInstance = async (id, body) => {
    try {
      await axiosInstance.patch(API_PATHS.CLUB_CYCLE_INSTANCE(id), body);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
    }
  };

  useEffect(() => {
    if (!instanceForm.cycle_id || !instanceForm.start_date) {
      setInstancePreview(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.CLUB_CYCLE_INSTANCE_PREVIEW, {
          params: {
            cycle_id: Number(instanceForm.cycle_id),
            start_date: instanceForm.start_date,
            ...(instanceForm.start_meso ? { start_meso: Number(instanceForm.start_meso) } : {}),
          },
        });
        if (alive) setInstancePreview(res.data || null);
      } catch {
        if (alive) setInstancePreview(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [instanceForm.cycle_id, instanceForm.start_date, instanceForm.start_meso]);

  const createAssignments = async () => {
    if (!assignForm.assignee_ids.length || !assignForm.title_bg.trim()) {
      toast.error("Изберете треньори и заглавие");
      return;
    }
    const drillIds = (assignForm.drill_ids || "")
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n));
    try {
      await axiosInstance.post(API_PATHS.CLUB_METHOD_ASSIGNMENTS, {
        assignee_ids: assignForm.assignee_ids.map(Number),
        title_bg: assignForm.title_bg,
        guidance_bg: assignForm.guidance_bg || null,
        cycle_id: assignForm.cycle_id ? Number(assignForm.cycle_id) : null,
        week_ref: assignForm.week_ref ? Number(assignForm.week_ref) : null,
        due_date: assignForm.due_date || null,
        drill_ids: drillIds.length ? drillIds : null,
      });
      toast.success("Задачите са изпратени");
      setAssignForm({
        assignee_ids: [],
        title_bg: "",
        guidance_bg: "",
        cycle_id: "",
        week_ref: "",
        due_date: "",
        drill_ids: "",
      });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
    }
  };

  const toggleCoach = (id) => {
    setAssignForm((f) => {
      const set = new Set(f.assignee_ids);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, assignee_ids: [...set] };
    });
  };

  const macroOptions = useMemo(() => {
    return annualCycles
      .filter((c) => c.cycle_type === "macro")
      .sort(
        (a, b) =>
          String(a.age_band).localeCompare(String(b.age_band)) || (a.macro_id || 0) - (b.macro_id || 0)
      );
  }, [annualCycles]);

  const mesoOptions = useMemo(() => {
    return annualCycles
      .filter(
        (c) =>
          c.cycle_type === "meso" &&
          c.age_band === instanceForm.age_band &&
          (!instanceForm.macro_id || String(c.macro_id) === String(instanceForm.macro_id))
      )
      .sort((a, b) => (a.meso_number || 0) - (b.meso_number || 0));
  }, [annualCycles, instanceForm.age_band, instanceForm.macro_id]);

  const bandMesoCount = useMemo(() => {
    return annualCycles.filter((c) => c.cycle_type === "meso" && c.age_band === instanceForm.age_band).length;
  }, [annualCycles, instanceForm.age_band]);

  const selectedCycle = annualCycles.find((c) => String(c.id) === String(instanceForm.cycle_id));
  const assignCycle = cycles.find((c) => String(c.id) === String(assignForm.cycle_id));
  const [assignCycleDetail, setAssignCycleDetail] = useState(null);

  useEffect(() => {
    if (!assignForm.cycle_id) {
      setAssignCycleDetail(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await axiosInstance.get(API_PATHS.NATIONAL_METHOD_CYCLE(assignForm.cycle_id));
        if (alive) setAssignCycleDetail(res.data);
      } catch {
        if (alive) setAssignCycleDetail(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [assignForm.cycle_id]);

  const assignWeeks = useMemo(() => {
    return assignCycleDetail?.weeks_detail || assignCycleDetail?.structure_json?.weeks || [];
  }, [assignCycleDetail]);

  const fillTitleFromWeek = (weekNum) => {
    const w = assignWeeks.find((x) => Number(x.week) === Number(weekNum));
    if (w?.theme) {
      setAssignForm((f) => ({
        ...f,
        week_ref: String(weekNum),
        title_bg: f.title_bg?.trim() ? f.title_bg : `Седмица ${weekNum}: ${w.theme}`,
      }));
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Седмица с посока — мезо шаблон</h3>
        <p className="uiMuted">
          Изберете национален цикъл и отбор.{" "}
          <Link to="/textbook">Учебник БФВ</Link>
          {" · "}
          <Link to="/national-library">Цикли БФВ</Link>
        </p>
        <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <select
            className="uiInput"
            value={instanceForm.team_id}
            onChange={(e) => setInstanceForm((f) => ({ ...f, team_id: e.target.value }))}
          >
            <option value="">1. Отбор</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="uiInput"
            value={instanceForm.macro_id ? `${instanceForm.age_band}|${instanceForm.macro_id}` : ""}
            onChange={(e) => {
              const [band, macro] = e.target.value.split("|");
              setInstanceForm((f) => ({
                ...f,
                age_band: band || "",
                macro_id: macro || "",
                cycle_id: "",
                start_meso: "",
              }));
            }}
          >
            <option value="">2. Макроцикъл (възраст)</option>
            {macroOptions.map((c) => (
              <option key={c.id} value={`${c.age_band}|${c.macro_id}`}>
                {c.age_band} · {c.macro_label || c.title_bg}
              </option>
            ))}
          </select>
          <select
            className="uiInput"
            value={instanceForm.cycle_id}
            onChange={(e) => setInstanceForm((f) => ({ ...f, cycle_id: e.target.value, start_meso: "" }))}
            disabled={!instanceForm.macro_id}
          >
            <option value="">3. Мезо шаблон</option>
            {mesoOptions.map((c) => (
              <option key={c.id} value={c.id}>
                Мезо {c.meso_number} — {c.title_bg}
              </option>
            ))}
          </select>
          <label className="uiMuted" style={{ fontSize: 13 }}>
            4. Начална дата
            <Input
              type="date"
              value={instanceForm.start_date}
              onChange={(e) => setInstanceForm((f) => ({ ...f, start_date: e.target.value }))}
            />
          </label>
          <select
            className="uiInput"
            value={instanceForm.start_meso}
            onChange={(e) => setInstanceForm((f) => ({ ...f, start_meso: e.target.value }))}
          >
            <option value="">5. Стартов мезо: авто (по месеца на старта)</option>
            {Array.from(
              { length: bandMesoCount || instancePreview?.total_mesos || 11 },
              (_, i) => i + 1
            ).map((n) => (
              <option key={n} value={n}>
                Мезо {n}
              </option>
            ))}
          </select>
          {selectedCycle?.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
          {instancePreview ? (
            <p
              className="uiMuted"
              style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 10px" }}
            >
              {instancePreview.started === false && instancePreview.meso_index
                ? `Ще започне от Мезо ${instancePreview.meso_index}/${instancePreview.total_mesos}`
                : instancePreview.completed
                ? `Програмата е към края си (Мезо ${instancePreview.meso_index}/${instancePreview.total_mesos})`
                : `Към днес: Мезо ${instancePreview.meso_index}/${instancePreview.total_mesos}` +
                  (instancePreview.meso_theme ? ` · ${instancePreview.meso_theme}` : "") +
                  ` · седмица ${instancePreview.week_in_meso}`}
            </p>
          ) : null}
          <Button onClick={publishInstance}>Публикувай към отбора</Button>
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Активни цикли в клуба</h3>
        {instances.length === 0 ? (
          <EmptyState title="Няма пуснати цикли" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Отбор</TableHead>
                <TableHead>Старт</TableHead>
                <TableHead>Позиция</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.team_name}</TableCell>
                  <TableCell>{i.start_date}</TableCell>
                  <TableCell>
                    {i.position && i.position.meso_index
                      ? `Мезо ${i.position.meso_index}/${i.position.total_mesos}` +
                        (i.position.started && !i.position.completed
                          ? ` · седм. ${i.position.week_in_meso}`
                          : "")
                      : "—"}
                  </TableCell>
                  <TableCell>{STATUS_LABELS[i.status] || i.status}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {i.status === "active" ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => updateInstance(i.id, { status: "paused" })}>
                            Пауза
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => updateInstance(i.id, { status: "completed" })}>
                            Приключи
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => updateInstance(i.id, { status: "active" })}>
                          Възобнови
                        </Button>
                      )}
                      <Button as={Link} to={`/coach/program-week?team_id=${i.team_id}`} size="sm" variant="secondary">
                        Програмна седмица
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Задачи към треньори (методика)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {coaches.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={assignForm.assignee_ids.includes(c.id)}
                onChange={() => toggleCoach(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
        <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <Input
            placeholder="Заглавие на задачата"
            value={assignForm.title_bg}
            onChange={(e) => setAssignForm((f) => ({ ...f, title_bg: e.target.value }))}
          />
          <textarea
            className="uiInput"
            rows={3}
            placeholder="Насоки на български"
            value={assignForm.guidance_bg}
            onChange={(e) => setAssignForm((f) => ({ ...f, guidance_bg: e.target.value }))}
          />
          <select
            className="uiInput"
            value={assignForm.cycle_id}
            onChange={(e) =>
              setAssignForm((f) => ({
                ...f,
                cycle_id: e.target.value,
                week_ref: "",
              }))
            }
          >
            <option value="">Свързан цикъл (по избор)</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title_bg} ({c.age_band})
              </option>
            ))}
          </select>
          {assignWeeks.length > 0 ? (
            <select
              className="uiInput"
              value={assignForm.week_ref}
              onChange={(e) => fillTitleFromWeek(e.target.value)}
            >
              <option value="">Седмица от цикъла</option>
              {assignWeeks.map((w) => (
                <option key={w.week} value={w.week}>
                  Седмица {w.week}: {w.theme}
                </option>
              ))}
            </select>
          ) : (
            <Input
              placeholder="Седмица № (1–4)"
              value={assignForm.week_ref}
              onChange={(e) => setAssignForm((f) => ({ ...f, week_ref: e.target.value }))}
            />
          )}
          {assignCycle?.age_band && assignForm.cycle_id && assignForm.week_ref ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate(
                  aiPreviewUrl(assignForm.cycle_id, assignCycle.age_band, assignForm.week_ref)
                )
              }
            >
              Преглед в AI генератор
            </Button>
          ) : null}
          <Input
            type="date"
            value={assignForm.due_date}
            onChange={(e) => setAssignForm((f) => ({ ...f, due_date: e.target.value }))}
          />
          <Input
            placeholder="ID на упражнения (разделени със запетая)"
            value={assignForm.drill_ids}
            onChange={(e) => setAssignForm((f) => ({ ...f, drill_ids: e.target.value }))}
          />
          <Button onClick={createAssignments}>Изпрати задачи</Button>
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Огледало — методични задачи</h3>
        {assignments.length === 0 ? (
          <EmptyState title="Няма задачи" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Треньор</TableHead>
                <TableHead>Задача</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Срок</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.assignee_name}</TableCell>
                  <TableCell>
                    {a.title_bg}
                    {a.week_ref ? ` (седм. ${a.week_ref})` : ""}
                  </TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>{a.due_date || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
