import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui";
import { useToast } from "../ToastProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function ClubHeadMethodSection({ teams = [], coaches = [] }) {
  const toast = useToast();
  const [cycles, setCycles] = useState([]);
  const [instances, setInstances] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [instanceForm, setInstanceForm] = useState({ team_id: "", cycle_id: "", start_date: today() });
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
      const [lib, inst, asg] = await Promise.all([
        axiosInstance.get(API_PATHS.NATIONAL_METHOD_LIBRARY),
        axiosInstance.get(API_PATHS.CLUB_CYCLE_INSTANCES),
        axiosInstance.get(API_PATHS.CLUB_METHOD_ASSIGNMENTS),
      ]);
      setCycles(lib.data?.cycles || []);
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
      });
      toast.success("Цикълът е пуснат към отбора");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Грешка");
    }
  };

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

  const selectedCycle = cycles.find((c) => String(c.id) === String(instanceForm.cycle_id));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Седмица с посока — мезо шаблон</h3>
        <p className="uiMuted">
          Изберете национален цикъл и отбор.{" "}
          <Link to="/national-library">Национална библиотека</Link>
        </p>
        <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <select
            className="uiInput"
            value={instanceForm.team_id}
            onChange={(e) => setInstanceForm((f) => ({ ...f, team_id: e.target.value }))}
          >
            <option value="">Отбор</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="uiInput"
            value={instanceForm.cycle_id}
            onChange={(e) => setInstanceForm((f) => ({ ...f, cycle_id: e.target.value }))}
          >
            <option value="">Мезо шаблон (БФВ)</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title_bg} ({c.age_band})
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={instanceForm.start_date}
            onChange={(e) => setInstanceForm((f) => ({ ...f, start_date: e.target.value }))}
          />
          {selectedCycle?.summary_bg && <p className="uiMuted">{selectedCycle.summary_bg}</p>}
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
                <TableHead>Цикъл</TableHead>
                <TableHead>Старт</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.team_name}</TableCell>
                  <TableCell>{i.cycle_title}</TableCell>
                  <TableCell>{i.start_date}</TableCell>
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
            onChange={(e) => setAssignForm((f) => ({ ...f, cycle_id: e.target.value }))}
          >
            <option value="">Свързан цикъл (по избор)</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title_bg}
              </option>
            ))}
          </select>
          <Input
            placeholder="Седмица № (1–4)"
            value={assignForm.week_ref}
            onChange={(e) => setAssignForm((f) => ({ ...f, week_ref: e.target.value }))}
          />
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
