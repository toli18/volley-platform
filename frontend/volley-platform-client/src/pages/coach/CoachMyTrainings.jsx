import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiJson } from "../../utils/apiClient";
import { useToast } from "../../components/ToastProvider";
import { Button, EmptyState } from "../../components/ui";

function fmtDate(v) {
  try {
    if (!v) return "";
    return new Date(v).toLocaleString("bg-BG");
  } catch {
    return "";
  }
}

export default function CoachMyTrainings() {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiJson("/trainings/my");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e?.message || "Грешка при зареждане");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createManual = async () => {
    try {
      setCreating(true);
      const created = await apiJson("/trainings/", {
        method: "POST",
        body: JSON.stringify({
          title: "Нова тренировка",
          source: "ръчна",
          status: "чернова",
          plan: {},
        }),
      });
      setNewOpen(false);
      toast.success("Създадена е ръчна тренировка.");
      navigate(`/trainings/${created.id}/edit`);
    } catch (e) {
      toast.error(e?.message || "Неуспешно създаване");
    } finally {
      setCreating(false);
    }
  };

  const openAi = () => {
    setNewOpen(false);
    navigate("/ai-generator");
  };

  return (
    <div className="coachMobilePage">
      <div className="coachMobileHubLinks" style={{ marginBottom: 8 }}>
        <Button type="button" onClick={() => setNewOpen(true)}>
          + Нова тренировка
        </Button>
        <Button type="button" variant="secondary" onClick={load}>
          Опресни
        </Button>
      </div>

      {loading ? <p className="coachMobileMuted">Зареждане...</p> : null}

      {!loading && items.length === 0 ? (
        <EmptyState title="Няма тренировки" description="Създайте първата си тренировка." />
      ) : null}

      {!loading && items.length > 0 ? (
        <ul className="coachMobileRosterList">
          {items.map((t) => (
            <li key={t.id}>
              <Link to={`/trainings/${t.id}`} className="coachMobileRosterRow">
                <span>
                  <span className="coachMobileMenuLabel">{t.title || `Тренировка #${t.id}`}</span>
                  <span className="coachMobileMuted coachMobileMenuHint">
                    {t.source || "—"} · {fmtDate(t.created_at)}
                  </span>
                </span>
                <span className="coachMobileTeamChevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {newOpen ? (
        <div className="uiModalOverlay" onClick={() => !creating && setNewOpen(false)} role="presentation">
          <section className="uiModal uiModal--compact coachMobileNewTrainingModal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3 className="uiModalTitle">Нова тренировка</h3>
            <p className="coachMobileMuted">Изберете как да създадете тренировката.</p>
            <div className="coachMobileNewTrainingChoices">
              <Button type="button" disabled={creating} onClick={createManual}>
                Ръчна тренировка
              </Button>
              <Button type="button" variant="secondary" disabled={creating} onClick={openAi}>
                AI генерирана
              </Button>
              <Button type="button" variant="secondary" disabled={creating} onClick={() => setNewOpen(false)}>
                Отказ
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
