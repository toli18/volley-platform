import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../../utils/apiClient";
import { API_PATHS } from "../../utils/apiPaths";
import { Button, Card, EmptyState } from "../ui";

function aiGeneratorUrl(assignment) {
  const params = new URLSearchParams();
  const band = assignment.cycle_age_band || "U14";
  params.set("ageBand", band);
  if (assignment.cycle_id) params.set("cycleId", String(assignment.cycle_id));
  if (assignment.week_ref) params.set("cycleWeek", String(assignment.week_ref));
  if (assignment.id) params.set("assignmentId", String(assignment.id));
  return `/ai-generator?${params.toString()}`;
}

export default function CoachMethodAssignments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API_PATHS.MY_METHOD_ASSIGNMENTS);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markDone = async (id) => {
    await axiosInstance.patch(API_PATHS.METHOD_ASSIGNMENT_UPDATE(id), { status: "done" });
    load();
  };

  const open = items.filter((a) => a.status !== "done" && a.status !== "cancelled");

  if (loading) return null;
  if (!open.length) return null;

  return (
    <Card title="Задачи от главния треньор (методика БФВ)" style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gap: 10 }}>
        {open.map((a) => (
          <div
            key={a.id}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #c5d4ef",
              background: "#f8fbff",
            }}
          >
            <strong>{a.title_bg}</strong>
            <div className="uiMuted" style={{ fontSize: 13, marginTop: 4 }}>
              {a.cycle_title ? `${a.cycle_title}` : "Национален цикъл"}
              {a.week_ref ? ` · седмица ${a.week_ref}` : ""}
              {a.week_theme ? ` — ${a.week_theme}` : ""}
              {a.due_date ? ` · срок ${a.due_date}` : ""}
            </div>
            {a.guidance_bg ? <p style={{ margin: "8px 0 0", fontSize: 14 }}>{a.guidance_bg}</p> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button as={Link} to={aiGeneratorUrl(a)} variant="primary" size="sm">
                Генерирай тренировка с AI
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => markDone(a.id)}>
                Маркирай изпълнена
              </Button>
            </div>
          </div>
        ))}
      </div>
      {items.length > open.length ? (
        <p className="uiMuted" style={{ marginTop: 10, fontSize: 13 }}>
          {items.length - open.length} завършени задачи
        </p>
      ) : null}
    </Card>
  );
}
