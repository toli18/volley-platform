// src/pages/TrainingDetails.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../utils/apiClient";
import { API_PATHS } from "../utils/apiPaths";
import DrillMediaPreviewModal, { getDrillPrimaryMedia } from "../components/DrillMediaPreviewModal";
import { SessionReviewCard } from "../components/ai/SessionReviewCard";
import { SectionBvfContext } from "../components/ai/SectionBvfContext";
import { Button, EmptyState, PageHero } from "../components/ui";
import { PLAN_SECTION_DEFS, sectionGuide, bvfBlockForPlanKey } from "../utils/trainingPlanSections";
import { useToast } from "../components/ToastProvider";

function clipText(s, n = 180) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/* =========================
   Page
========================= */
export default function TrainingDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalDrill, setModalDrill] = useState(null);
  const [fieldMode, setFieldMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [durationMin, setDurationMin] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [members, setMembers] = useState([]);
  const [attStatus, setAttStatus] = useState({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [quickNotes, setQuickNotes] = useState({});
  const [savedNotes, setSavedNotes] = useState([]);
  const touchStartX = useRef(null);
  const speechRef = useRef(null);
  const [speechListening, setSpeechListening] = useState(false);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [storyMapOpen, setStoryMapOpen] = useState(false);
  const [paymentAthlete, setPaymentAthlete] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    month_key: new Date().toISOString().slice(0, 7),
    amount: "",
    note: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);

  const SECTIONS = useMemo(() => PLAN_SECTION_DEFS, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const assignmentId = new URLSearchParams(location.search).get("assignment");
      try {
        const res = await apiJson(`/trainings/${id}/details`);
        setData(res);
      } catch (e) {
        // Fallback: if the page is opened from an assignment card, load details via assignment context.
        if (assignmentId) {
          try {
            const fallback = await apiJson(`/api/trainings/assignments/${assignmentId}/details`, {
              params: { training_id: Number(id) || undefined },
            });
            setData(fallback);
          } catch (fallbackErr) {
            toast.error(fallbackErr?.message || e?.message || "Грешка при зареждане");
            setData(null);
          }
        } else {
          toast.error(e?.message || "Грешка при зареждане");
          setData(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, location.search]);

  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    setFieldMode(mode === "field");
  }, [location.search]);

  useEffect(() => {
    setSecondsLeft(Math.max(1, Number(durationMin) || 1) * 60);
    setRunning(false);
  }, [durationMin, currentStep]);

  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(t);
          setRunning(false);
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([120, 70, 120]);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    return () => {
      try {
        if (speechRef.current && typeof speechRef.current.stop === "function") {
          speechRef.current.stop();
        }
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!fieldMode) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apiJson(API_PATHS.TEAMS_LIST);
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setTeams(arr);
        if (!selectedTeamId && arr.length) setSelectedTeamId(String(arr[0].id));
      } catch {
        if (!cancelled) setTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fieldMode]);

  useEffect(() => {
    if (!data?.id) return;
    try {
      const raw = localStorage.getItem(`vp-field-notes-${data.id}`);
      const arr = JSON.parse(raw || "[]");
      if (Array.isArray(arr)) setSavedNotes(arr);
    } catch {
      setSavedNotes([]);
    }
  }, [data?.id]);

  useEffect(() => {
    if (!data?.id) return;
    try {
      localStorage.setItem(`vp-field-notes-${data.id}`, JSON.stringify(savedNotes.slice(0, 300)));
    } catch {
      // ignore
    }
  }, [savedNotes, data?.id]);

  useEffect(() => {
    if (!selectedTeamId) {
      setMembers([]);
      setAttStatus({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiJson(API_PATHS.TEAM_MEMBERS_GET(Number(selectedTeamId)));
        if (cancelled) return;
        const rows = Array.isArray(res?.members) ? res.members : [];
        setMembers(rows);
        setAttStatus((prev) => {
          const next = {};
          rows.forEach((m) => {
            const v = prev[m.athlete_id];
            next[m.athlete_id] = v === "present" || v === "absent" ? v : "absent";
          });
          return next;
        });
      } catch {
        if (!cancelled) {
          setMembers([]);
          setAttStatus({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  const plan = data?.plan || {};
  const drillsMap = data?.drills || {};
  const fieldSteps = useMemo(() => {
    const out = [];
    SECTIONS.forEach((s) => {
      const ids = Array.isArray(plan[s.key]) ? plan[s.key] : [];
      ids.forEach((drillId, idx) => {
        const d = drillsMap[String(drillId)] || drillsMap[drillId] || null;
        out.push({
          sectionKey: s.key,
          sectionLabel: s.label,
          orderInSection: idx + 1,
          drillId,
          drill: d,
        });
      });
    });
    return out;
  }, [SECTIONS, plan, drillsMap]);

  useEffect(() => {
    if (!fieldSteps.length) {
      setCurrentStep(0);
      return;
    }
    if (currentStep >= fieldSteps.length) setCurrentStep(fieldSteps.length - 1);
  }, [fieldSteps, currentStep]);

  const step = fieldSteps[currentStep] || null;
  const canPrev = currentStep > 0;
  const canNext = currentStep < fieldSteps.length - 1;
  const phaseMeta = useMemo(() => {
    const meta = [];
    let offset = 0;
    SECTIONS.forEach((s) => {
      const count = (Array.isArray(plan[s.key]) ? plan[s.key] : []).length;
      if (!count) return;
      meta.push({
        key: s.key,
        label: s.label,
        count,
        start: offset,
        end: offset + count - 1,
      });
      offset += count;
    });
    return meta;
  }, [SECTIONS, plan]);
  const activePhase = useMemo(
    () => phaseMeta.find((p) => currentStep >= p.start && currentStep <= p.end) || null,
    [phaseMeta, currentStep]
  );
  const speechSupported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );
  const activePhaseGuide = useMemo(() => {
    if (!step?.sectionKey || !data?.sessionReview) return null;
    return sectionGuide(data.sessionReview, step.sectionKey);
  }, [step?.sectionKey, data?.sessionReview]);

  const onPrint = () => window.print();
  const fmtTime = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };
    const s = Math.max(0, Number(sec) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const saveAttendanceNow = async () => {
    if (!selectedTeamId || !members.length) {
      toast.error("Избери отбор с участници.");
      return;
    }
    try {
      setSavingAttendance(true);
      const items = members.map((m) => ({
        athlete_id: m.athlete_id,
        status: attStatus[m.athlete_id] === "present" ? "present" : "absent",
      }));
      const today = new Date().toISOString().slice(0, 10);
      await apiJson(API_PATHS.TEAM_ATTENDANCE_SAVE(Number(selectedTeamId)), {
        method: "POST",
        data: {
          date: today,
          title: data?.title || "Тренировка",
          notes: "Бързо маркиране от Active Field Mode",
          items,
        },
      });
      toast.success("Присъствието е запазено.");
    } catch (e) {
      toast.error(e?.message || "Грешка при запис на присъствие.");
    } finally {
      setSavingAttendance(false);
    }
  };

  const saveQuickPayment = async () => {
    if (!paymentAthlete) return;
    const amount = Number(paymentForm.amount);
    if (!paymentForm.month_key || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Въведи валиден месец и сума.");
      return;
    }
    try {
      setSavingPayment(true);
      await apiJson(API_PATHS.FEES_PAYMENT_SAVE(paymentAthlete.athlete_id), {
        method: "POST",
        data: {
          month_key: paymentForm.month_key,
          amount,
          note: String(paymentForm.note || "").trim() || null,
        },
      });
      toast.success(`Таксата е записана за ${paymentAthlete.athlete_name}.`);
      setPaymentAthlete(null);
      setPaymentForm((prev) => ({ ...prev, amount: "", note: "" }));
    } catch (e) {
      toast.error(e?.message || "Неуспешно записване на такса.");
    } finally {
      setSavingPayment(false);
    }
  };

  const saveQuickNote = () => {
    if (!step) return;
    const key = `${step.sectionKey}:${step.drillId}:${currentStep}`;
    const text = String(quickNotes[key] || "").trim();
    if (!text) return;
    setSavedNotes((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        stepTitle: step.drill?.title || `Упражнение #${step.drillId}`,
        sectionLabel: step.sectionLabel,
        text,
      },
      ...prev,
    ]);
    setQuickNotes((prev) => ({ ...prev, [key]: "" }));
    toast.success("Наблюдението е записано локално.");
  };

  const appendQuickNote = (text) => {
    if (!step) return;
    const key = `${step.sectionKey}:${step.drillId}:${currentStep}`;
    const line = String(text || "").trim();
    if (!line) return;
    setQuickNotes((prev) => ({
      ...prev,
      [key]: prev[key] ? `${prev[key]}\n${line}` : line,
    }));
  };

  const startVoiceNote = () => {
    if (!speechSupported) {
      toast.info("Гласовият запис не се поддържа на това устройство/браузър.");
      return;
    }
    if (speechListening) {
      try {
        if (speechRef.current?.stop) speechRef.current.stop();
      } catch {
        // ignore
      }
      setSpeechListening(false);
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      toast.info("Гласовият запис не е наличен.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "bg-BG";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || "";
      if (String(transcript).trim()) {
        appendQuickNote(transcript);
        toast.success("Гласовата бележка е добавена.");
      }
    };
    recognition.onerror = () => {
      toast.error("Неуспешен гласов запис.");
      setSpeechListening(false);
    };
    recognition.onend = () => {
      setSpeechListening(false);
    };
    speechRef.current = recognition;
    setSpeechListening(true);
    try {
      recognition.start();
    } catch {
      setSpeechListening(false);
      toast.error("Не може да се стартира микрофон.");
    }
  };

  const openFieldMode = () => {
    const sp = new URLSearchParams(location.search);
    sp.set("mode", "field");
    navigate(`/trainings/${id}?${sp.toString()}`);
  };

  const exitFieldMode = () => {
    const sp = new URLSearchParams(location.search);
    sp.delete("mode");
    const q = sp.toString();
    navigate(`/trainings/${id}${q ? `?${q}` : ""}`);
  };

  if (loading) return <div className="uiPage">Зареждане…</div>;
  if (!data) return <EmptyState title="Няма данни" description="Не успяхме да заредим детайлите за тренировката." />;

  if (fieldMode) {
    return (
      <div className="wrap">
        <style>{`
          .wrap{padding:10px; max-width:980px; margin:0 auto;}
          .fieldHeader{display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;}
          .fieldTitle{margin:0; font-size:18px; font-weight:900;}
          .fieldMeta{font-size:12px; color:#64748b;}
          .fieldCard{border:1px solid #dbe7f5; border-radius:16px; background:linear-gradient(180deg,#fff,#f8fbff); padding:14px; min-height:52vh; display:grid; gap:10px;}
          .storyStrip{display:flex; gap:6px; overflow:auto; padding-bottom:4px; margin-bottom:6px;}
          .storyChip{border:1px solid #d7e2ef; border-radius:999px; padding:6px 10px; background:#fff; font-weight:800; font-size:12px; cursor:pointer; white-space:nowrap;}
          .storyChip.active{background:#0b5cff; color:#fff; border-color:#0b5cff;}
          .storyProgress{display:flex; gap:4px; margin-bottom:4px;}
          .storyProgress div{height:4px; flex:1; border-radius:999px; background:#dbe7f5;}
          .storyProgress div.on{background:#0b5cff;}
          .fieldStep{font-size:12px; font-weight:800; color:#475569; letter-spacing:.03em;}
          .fieldDrillTitle{font-size:24px; line-height:1.15; margin:0; font-weight:950;}
          .fieldDrillMeta{font-size:13px; color:#64748b;}
          .fieldDrillDesc{font-size:15px; line-height:1.55; color:#0f172a; white-space:pre-wrap;}
          .fieldMediaBtn{border:1px solid #dbe5f2; background:#fff; border-radius:14px; min-height:52px; font-weight:900; font-size:16px; cursor:pointer;}
          .fieldNav{display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center; margin-top:2px;}
          .fieldFooter{position:sticky; bottom:0; z-index:20; background:rgba(255,255,255,.95); backdrop-filter:blur(8px); border:1px solid #e2e8f0; border-radius:14px; padding:10px; display:grid; gap:10px; margin-top:10px;}
          .timerRow{display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;}
          .timerValue{font-size:28px; font-weight:950; letter-spacing:.03em;}
          .controls{display:flex; gap:8px; flex-wrap:wrap;}
          .fieldBtn{padding:10px 12px; border-radius:12px; border:1px solid #d1dbe8; background:#fff; font-weight:900; cursor:pointer;}
          .fieldBtnPrimary{padding:10px 12px; border-radius:12px; border:none; background:#0b5cff; color:#fff; font-weight:900; cursor:pointer;}
          .drawer{position:fixed; top:0; right:0; bottom:0; width:min(420px,94vw); background:#fff; box-shadow:-12px 0 34px rgba(15,23,42,.24); z-index:1200; display:grid; grid-template-rows:auto auto 1fr auto; border-left:1px solid #e2e8f0;}
          .drawerHead{padding:12px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:8px;}
          .drawerBody{padding:12px; overflow:auto; display:grid; gap:8px;}
          .memberRow{border:1px solid #e2e8f0; border-radius:12px; padding:10px; display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center;}
          .memberActions{display:flex; gap:6px; align-items:center;}
          .iconBtn{width:36px; height:36px; border-radius:10px; border:1px solid #d6dfeb; background:#fff; cursor:pointer;}
          .iconBtn.on{background:#e8f8ee; border-color:#9ed6b1;}
          .drawerFoot{padding:12px; border-top:1px solid #e2e8f0; display:flex; gap:8px;}
          .backdrop{position:fixed; inset:0; background:rgba(15,23,42,.35); z-index:1100;}
          .storyMap{position:fixed; inset:0; z-index:1300; background:rgba(15,23,42,.55); display:grid; place-items:center; padding:14px;}
          .storyMapCard{width:min(640px,96vw); max-height:78vh; overflow:auto; background:#fff; border-radius:14px; border:1px solid #d8e1ec; padding:12px;}
          .storyMapRow{display:flex; gap:8px; align-items:center; justify-content:space-between; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; margin-bottom:7px;}
          .storyMapRow .go{border:1px solid #d1dbe8; background:#fff; border-radius:9px; padding:6px 8px; font-weight:800; cursor:pointer;}
          .payModal{position:fixed; inset:0; z-index:1400; background:rgba(15,23,42,.55); display:grid; place-items:center; padding:12px;}
          .payModalCard{width:min(430px,96vw); background:#fff; border:1px solid #d8e1ec; border-radius:14px; padding:12px; display:grid; gap:10px;}
          .payGrid{display:grid; gap:8px;}
          .payInput{width:100%; border:1px solid #d1dbe8; border-radius:10px; padding:9px 10px;}
          @media (max-width:700px){ .fieldDrillTitle{font-size:20px;} .timerValue{font-size:24px;} }
        `}</style>

        <div className="fieldHeader">
          <div>
            <h1 className="fieldTitle">{data.title}</h1>
            <div className="fieldMeta">Режим Тренировка • {fieldSteps.length} упражнения</div>
          </div>
          <div className="controls">
            <button className="fieldBtn" onClick={exitFieldMode}>Изход от режим</button>
            <button className="fieldBtnPrimary" onClick={() => navigate("/my-trainings")}>Край на тренировката</button>
          </div>
        </div>

        {!step ? (
          <EmptyState title="Няма упражнения в плана" description="Добави упражнения в тренировката и опитай отново." />
        ) : (
          <>
            <div className="storyProgress">
              {phaseMeta.map((p) => (
                <div key={p.key} className={currentStep >= p.start ? "on" : ""} />
              ))}
            </div>
            <div className="storyStrip" aria-label="Фази (story навигация)">
              {phaseMeta.map((p) => (
                <button
                  key={p.key}
                  className={`storyChip ${activePhase?.key === p.key ? "active" : ""}`}
                  onClick={() => setCurrentStep(p.start)}
                  title={`${p.label} (${p.count})`}
                >
                  {p.label} ({p.count})
                </button>
              ))}
            </div>
            <section
              className="fieldCard"
              onTouchStart={(e) => {
                if (!swipeEnabled) return;
                touchStartX.current = e.touches?.[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (!swipeEnabled) return;
                const sx = touchStartX.current;
                const ex = e.changedTouches?.[0]?.clientX ?? null;
                touchStartX.current = null;
                if (sx == null || ex == null) return;
                const dx = ex - sx;
                if (Math.abs(dx) < 44) return;
                if (dx < 0 && canNext) setCurrentStep((p) => p + 1);
                if (dx > 0 && canPrev) setCurrentStep((p) => p - 1);
              }}
            >
              <div className="fieldStep">
                {step.sectionLabel} • {currentStep + 1}/{fieldSteps.length} • #{step.orderInSection} в секцията
                {bvfBlockForPlanKey(step.sectionKey) ? ` • ${bvfBlockForPlanKey(step.sectionKey)}` : ""}
              </div>
              {activePhaseGuide ? (
                <SectionBvfContext guide={activePhaseGuide} bvfBlock={bvfBlockForPlanKey(step.sectionKey)} />
              ) : null}
              <h2 className="fieldDrillTitle">{step.drill?.title || `Упражнение #${step.drillId}`}</h2>
              <div className="fieldDrillMeta">
                {[step.drill?.category, step.drill?.level, step.drill?.equipment].filter(Boolean).join(" • ") || "няма данни"}
              </div>
              <div className="fieldDrillDesc">{step.drill?.description || "Няма описание за това упражнение."}</div>
              <button className="fieldMediaBtn" onClick={() => step.drill && setModalDrill(step.drill)}>
                🎥 Покажи видео/преглед
              </button>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Запиши наблюдение</div>
                <textarea
                  value={quickNotes[`${step.sectionKey}:${step.drillId}:${currentStep}`] || ""}
                  onChange={(e) =>
                    setQuickNotes((prev) => ({
                      ...prev,
                      [`${step.sectionKey}:${step.drillId}:${currentStep}`]: e.target.value,
                    }))
                  }
                  placeholder="Наблюдение за това упражнение..."
                  style={{ width: "100%", minHeight: 72, borderRadius: 10, border: "1px solid #d8e1ec", padding: 10 }}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="fieldBtn" onClick={saveQuickNote}>💬 Запиши наблюдение</button>
                  <button className="fieldBtn" onClick={startVoiceNote} title="Speech-to-text">
                    {speechListening ? "🛑 Спри запис" : "🎙️ Гласова бележка"}
                  </button>
                  {!speechSupported ? <span style={{ fontSize: 12, color: "#64748b" }}>Гласовият запис не се поддържа тук.</span> : null}
                </div>
              </div>
              <div className="fieldNav">
                <button className="fieldBtn" disabled={!canPrev} onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}>
                  ← Предишно
                </button>
                <span style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
                  {swipeEnabled ? "Swipe ← →" : "Swipe е изключен"}
                </span>
                <button
                  className="fieldBtnPrimary"
                  disabled={!canNext}
                  onClick={() => setCurrentStep((p) => Math.min(fieldSteps.length - 1, p + 1))}
                >
                  Следващо →
                </button>
              </div>
            </section>

            <footer className="fieldFooter">
              <div className="timerRow">
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Живо време</div>
                  <div className="timerValue">{fmtTime(secondsLeft)}</div>
                </div>
                <div className="controls">
                  <button className="fieldBtn" onClick={() => setSwipeEnabled((v) => !v)}>
                    {swipeEnabled ? "🔒 Lock swipe" : "🔓 Unlock swipe"}
                  </button>
                  <button className="fieldBtn" onClick={() => setStoryMapOpen(true)}>🗺️ Story карта</button>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>Мин:</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={durationMin}
                      onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 66, border: "1px solid #d1dbe8", borderRadius: 8, padding: "6px 8px" }}
                    />
                  </label>
                  <button className="fieldBtn" onClick={() => setRunning((v) => !v)}>{running ? "Пауза" : "Старт"}</button>
                  <button className="fieldBtn" onClick={() => { setRunning(false); setSecondsLeft(durationMin * 60); }}>Нулирай</button>
                  <button className="fieldBtnPrimary" onClick={() => setAttendanceOpen(true)}>Присъствие</button>
                </div>
              </div>
            </footer>
          </>
        )}

        {attendanceOpen ? <button className="backdrop" onClick={() => setAttendanceOpen(false)} aria-label="close" /> : null}
        {attendanceOpen ? (
          <aside className="drawer" role="dialog" aria-modal="true">
            <div className="drawerHead">
              <strong>Присъствие и пари</strong>
              <button className="fieldBtn" onClick={() => setAttendanceOpen(false)}>Затвори</button>
            </div>
            <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Отбор</label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                style={{ marginTop: 6, width: "100%", border: "1px solid #d1dbe8", borderRadius: 10, padding: 9 }}
              >
                {!teams.length && <option value="">Няма отбори</option>}
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="drawerBody">
              {members.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>Няма участници за избрания отбор.</div>
              ) : (
                members.map((m) => {
                  const present = attStatus[m.athlete_id] === "present";
                  return (
                    <div key={m.athlete_id} className="memberRow">
                      <div>
                        <div style={{ fontWeight: 800 }}>{m.athlete_name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{present ? "Присъства" : "Отсъства"}</div>
                      </div>
                      <div className="memberActions">
                        <button
                          className={`iconBtn ${present ? "on" : ""}`}
                          title="Присъствие"
                          onClick={() =>
                            setAttStatus((prev) => ({
                              ...prev,
                              [m.athlete_id]: prev[m.athlete_id] === "present" ? "absent" : "present",
                            }))
                          }
                        >
                          🟢
                        </button>
                        <button
                          className="iconBtn"
                          title="Бързо плащане"
                          onClick={() => {
                            setPaymentAthlete(m);
                            setPaymentForm((prev) => ({
                              ...prev,
                              month_key: new Date().toISOString().slice(0, 7),
                              amount: "",
                              note: "",
                            }));
                          }}
                        >
                          💰
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="drawerFoot">
              <button className="fieldBtn" onClick={() => setAttendanceOpen(false)}>Назад</button>
              <button className="fieldBtnPrimary" disabled={savingAttendance || !members.length} onClick={saveAttendanceNow}>
                {savingAttendance ? "Запис..." : "Запази присъствие"}
              </button>
            </div>
          </aside>
        ) : null}

        {savedNotes.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, marginBottom: 6 }}>Текущи наблюдения (локално)</div>
            <div style={{ display: "grid", gap: 6 }}>
              {savedNotes.slice(0, 8).map((n) => (
                <div key={n.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 9, background: "#fff" }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {new Date(n.at).toLocaleString("bg-BG")} • {n.sectionLabel} • {n.stepTitle}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{n.text}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {storyMapOpen ? (
          <div className="storyMap" onClick={() => setStoryMapOpen(false)}>
            <div className="storyMapCard" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <strong>Story карта на тренировката</strong>
                <button className="fieldBtn" onClick={() => setStoryMapOpen(false)}>Затвори</button>
              </div>
              {fieldSteps.map((st, idx) => (
                <div key={`${st.sectionKey}-${st.drillId}-${idx}`} className="storyMapRow">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {idx + 1}/{fieldSteps.length} • {st.sectionLabel}
                    </div>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {st.drill?.title || `Упражнение #${st.drillId}`}
                    </div>
                  </div>
                  <button
                    className="go"
                    onClick={() => {
                      setCurrentStep(idx);
                      setStoryMapOpen(false);
                    }}
                  >
                    Отвори
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {paymentAthlete ? (
          <div className="payModal" onClick={() => !savingPayment && setPaymentAthlete(null)}>
            <section className="payModalCard" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>Бързо плащане</strong>
                <button className="fieldBtn" onClick={() => setPaymentAthlete(null)} disabled={savingPayment}>
                  Затвори
                </button>
              </div>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Състезател: <strong>{paymentAthlete.athlete_name}</strong>
              </div>
              <div className="payGrid">
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Месец</label>
                <input
                  type="month"
                  className="payInput"
                  value={paymentForm.month_key}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, month_key: e.target.value }))}
                />
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Сума</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="payInput"
                  placeholder="30.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Бележка (по желание)</label>
                <textarea
                  className="payInput"
                  rows={3}
                  placeholder="Бележка към плащането..."
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, note: e.target.value }))}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="fieldBtn" onClick={() => setPaymentAthlete(null)} disabled={savingPayment}>
                  Отказ
                </button>
                <button className="fieldBtnPrimary" onClick={saveQuickPayment} disabled={savingPayment}>
                  {savingPayment ? "Запис..." : "Запази такса"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {modalDrill && <DrillMediaPreviewModal drill={modalDrill} onClose={() => setModalDrill(null)} />}
      </div>
    );
  }

  return (
    <div className="wrap">
      <style>{`
        .wrap{padding:14px; max-width:980px; margin:0 auto;}
        .topBar{display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;}
        .title{font-size:22px; font-weight:900; margin:0;}
        .meta{font-size:12px; opacity:.75;}
        .sectionBox{border:1px solid #eee; border-radius:14px; background:#fff; padding:12px; margin-top:12px;}
        .sectionHead{display:flex; align-items:baseline; justify-content:space-between; gap:10px;}
        .sectionName{font-weight:900; font-size:16px;}
        .count{font-size:12px; opacity:.7;}
        .cards{display:grid; gap:10px; margin-top:10px;}
        .cardRow{border:1px solid #e8edf4; border-radius:14px; padding:12px; background:#f8fbff; display:grid; grid-template-columns:120px 1fr auto; gap:10px; align-items:flex-start;}
        @media(max-width: 760px){ .cardRow{grid-template-columns:1fr;} }
        .cardTitle{font-weight:900;}
        .muted{font-size:12px; opacity:.75;}
        .text{font-size:14px; line-height:1.5;}
        .pre{white-space:pre-wrap;}
        .btn{padding:10px 12px; border-radius:12px; border:1px solid #ddd; background:#fff; font-weight:900; cursor:pointer;}
        .btnPrimary{padding:10px 12px; border-radius:12px; border:none; background:#0066cc; color:#fff; font-weight:900; cursor:pointer;}
        .mediaBtn{width:120px; height:78px; border:1px solid #dce4f0; border-radius:12px; background:#fff; overflow:hidden; padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center;}
        .mediaBtn img{width:100%; height:100%; object-fit:cover;}
      `}</style>

      <PageHero
        title={data.title}
        subtitle={`${data.source} • ${data.status} • ${data.created_at ? new Date(data.created_at).toLocaleString() : ""}`}
        actions={
          <>
            <Button onClick={openFieldMode}>🏐 Режим тренировка</Button>
            <Button variant="secondary" onClick={onPrint}>🖨 Печат</Button>
            <Button variant="secondary" onClick={() => navigate("/my-trainings")}>Към списъка</Button>
            <Button as={Link} to={`/trainings/${id}/edit`}>Редакция</Button>
          </>
        }
      />

      <div className="trainingPrintArea">
      {data.assignment_id || data.assignment_status ? (
        <div className="aiGenBvfBanner trainingAssignmentBanner" role="note">
          <strong>Възложена задача</strong>
          <span>
            Статус: {data.assignment_status || "—"}
            {data.assignment_due_date ? ` · Краен срок: ${data.assignment_due_date}` : ""}
          </span>
        </div>
      ) : null}
      <SessionReviewCard sessionReview={data.sessionReview} />

      {data.trainingPlanText ? (
        <details className="aiGenPlanText trainingPlanTextDetails">
          <summary>Текстов план (методика БФВ)</summary>
          <pre className="trainingPlanTextPre">{data.trainingPlanText}</pre>
        </details>
      ) : null}

      {data.notes && data.notes !== "Generated by hybrid-v1" ? (
        <div className="sectionBox" style={{ background: "#fff" }}>
          <div className="sectionName">Бележки</div>
          <div className="text pre" style={{ marginTop: 8 }}>{data.notes}</div>
        </div>
      ) : null}

      {SECTIONS.map((s) => {
        const ids = Array.isArray(plan[s.key]) ? plan[s.key] : [];
        const guide = sectionGuide(data.sessionReview, s.key);
        return (
          <div key={s.key} className="sectionBox">
            <div className="sectionHead">
              <div className="sectionName">{s.label}</div>
              <div className="count">{ids.length} упражнения</div>
            </div>
            <SectionBvfContext guide={guide} bvfBlock={s.bvfBlock} />

            {ids.length === 0 ? (
              <div className="muted" style={{ marginTop: 10 }}>Няма упражнения.</div>
            ) : (
              <div className="cards">
                {ids.map((drillId, idx) => {
                  const d = drillsMap[String(drillId)] || drillsMap[drillId] || null;

                  const title = d?.title || `Упражнение #${drillId}`;
                  const meta = [d?.category, d?.level, d?.equipment].filter(Boolean).join(" • ") || "—";
                  const desc = d?.description ? clipText(d.description, 170) : "Няма описание.";
                  const media = d ? getDrillPrimaryMedia(d) : null;

                  return (
                    <div key={`${s.key}-${drillId}-${idx}`} className="cardRow">
                      <button className="mediaBtn" onClick={() => d && setModalDrill(d)} title="Бърз преглед">
                        {media?.type === "image" ? (
                          <img src={media.src} alt={title} />
                        ) : media?.type === "video" ? (
                          <span className="muted">🎥 Видео</span>
                        ) : (
                          <span className="muted">Преглед</span>
                        )}
                      </button>

                      <div style={{ minWidth: 0 }}>
                        <div className="cardTitle">{idx + 1}. {title}</div>
                        <div className="muted">{meta}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: "#333" }}>{desc}</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <Button variant="secondary" onClick={() => d && setModalDrill(d)}>
                          Бърз преглед
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      </div>

      {modalDrill && <DrillMediaPreviewModal drill={modalDrill} onClose={() => setModalDrill(null)} />}
    </div>
  );
}
