import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, isAuthenticated, isCoach } from "../utils/auth";

export default function TrainingGenerator() {
  const navigate = useNavigate();

  const [drills, setDrills] = useState([]);
  const [selectedDrills, setSelectedDrills] = useState([]);

  const [title, setTitle] = useState("");
  const [numDrills, setNumDrills] = useState(6);
  const [filters, setFilters] = useState({
    category: "",
    level: "",
    equipment: "",
  });

  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Auth guard first (no API calls before this)
      setAuthLoading(true);

      if (!isAuthenticated()) {
        navigate("/login", { replace: true });
        return;
      }
      if (!isCoach()) {
        navigate("/", { replace: true });
        return;
      }

      if (!cancelled) setAuthLoading(false);

      // Load approved drills
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        // apiClient here is expected to return parsed JSON OR throw an Error
        const data = await apiClient("/drills/drills");

        if (!cancelled) {
          setDrills(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Грешка при зареждане на упражнения");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const hasFilterField = (field) =>
    drills.some((d) => d?.[field] != null && d?.[field] !== "");

  const getFilterOptions = (field) => {
    const values = drills
      .map((d) => d?.[field])
      .filter((v) => v != null && v !== "")
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();
    return values;
  };

  const filteredDrills = useMemo(() => {
    let list = drills;

    if (filters.category) list = list.filter((d) => d?.category === filters.category);
    if (filters.level) list = list.filter((d) => d?.level === filters.level);
    if (filters.equipment) list = list.filter((d) => d?.equipment === filters.equipment);

    return list;
  }, [drills, filters]);

  const handleGenerate = () => {
    setError(null);
    setSuccess(null);

    if (filteredDrills.length < numDrills) {
      setError(
        `Няма достатъчно упражнения за избраните филтри. Налични: ${filteredDrills.length}, Изисквани: ${numDrills}`
      );
      return;
    }

    // Select N drills without repetition
    const shuffled = [...filteredDrills].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numDrills);
    setSelectedDrills(selected);
  };

  const handleRemoveDrill = (drillId) => {
    setSelectedDrills((prev) => prev.filter((d) => d.id !== drillId));
  };

  const handleSaveTraining = async () => {
    setError(null);
    setSuccess(null);

    if (!title.trim()) {
      setError("Моля, въведете заглавие на тренировката");
      return;
    }
    if (selectedDrills.length === 0) {
      setError("Моля, изберете поне едно упражнение");
      return;
    }

    const drillIds = selectedDrills.map((d) => d.id).filter(Boolean);

    try {
      setSubmitting(true);

      // IMPORTANT:
      // apiClient is expected to JSON-encode objects and set headers itself.
      await apiClient("/trainings/", {
        method: "POST",
        body: {
          title: title.trim(),
          drills: drillIds,
          source: "генерирана",
          status: "запазена",
        },
      });

      setSuccess("Training created");

      setTimeout(() => {
        navigate("/my-trainings");
      }, 800);
    } catch (e) {
      setError(e?.message || "Грешка при създаване на тренировка");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ padding: "20px" }}>
        <p>Зареждане...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Създаване на тренировка</h1>

      {loading && <p>Зареждане на упражнения…</p>}

      {error && (
        <p style={{ background: "#ffdddd", padding: "10px", borderRadius: "4px", marginBottom: "10px" }}>
          Грешка: {error}
        </p>
      )}

      {success && (
        <p style={{ background: "#ddffdd", padding: "10px", borderRadius: "4px", marginBottom: "10px" }}>
          {success}
        </p>
      )}

      {!loading && !error && (
        <div style={{ marginTop: "20px" }}>
          {/* Title Input (required by Step 2 manual) */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Заглавие на тренировката: *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр. Тренировка 1"
              style={{
                width: "100%",
                maxWidth: "500px",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "16px",
              }}
            />
          </div>

          {/* Number of Drills Slider */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Брой упражнения: {numDrills}
            </label>
            <input
              type="range"
              min="1"
              max="12"
              value={numDrills}
              onChange={(e) => setNumDrills(parseInt(e.target.value, 10))}
              style={{ width: "100%", maxWidth: "500px" }}
            />
            <div style={{ fontSize: "0.9em", color: "#666", marginTop: "5px" }}>Минимум: 1, Максимум: 12</div>
          </div>

          {/* Filters */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ marginBottom: "10px" }}>Филтри (опционално)</h3>
            <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
              {hasFilterField("category") && (
                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9em" }}>Категория:</label>
                  <select
                    value={filters.category}
                    onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                    style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                  >
                    <option value="">Всички</option>
                    {getFilterOptions("category").map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hasFilterField("level") && (
                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9em" }}>Ниво:</label>
                  <select
                    value={filters.level}
                    onChange={(e) => setFilters((p) => ({ ...p, level: e.target.value }))}
                    style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                  >
                    <option value="">Всички</option>
                    {getFilterOptions("level").map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hasFilterField("equipment") && (
                <div>
                  <label style={{ display: "block", marginBottom: "5px", fontSize: "0.9em" }}>Оборудване:</label>
                  <select
                    value={filters.equipment}
                    onChange={(e) => setFilters((p) => ({ ...p, equipment: e.target.value }))}
                    style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                  >
                    <option value="">Всички</option>
                    {getFilterOptions("equipment").map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <div style={{ marginBottom: "30px" }}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: "#0066cc",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Генерирай упражнения
            </button>
          </div>

          {/* Selected Drills */}
          {selectedDrills.length > 0 && (
            <div>
              <h2>Избрани упражнения ({selectedDrills.length})</h2>

              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  padding: "10px",
                  maxHeight: "400px",
                  overflowY: "auto",
                  marginBottom: "20px",
                }}
              >
                {selectedDrills.map((drill) => (
                  <div
                    key={drill.id}
                    style={{
                      padding: "15px",
                      border: "1px solid #eee",
                      borderRadius: "4px",
                      marginBottom: "10px",
                      backgroundColor: "#f9f9f9",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: "bold" }}>
                          {drill.title || drill.name || "Упражнение"}
                        </div>
                        {(drill.category || drill.level) && (
                          <div style={{ fontSize: "0.9em", color: "#666", marginTop: "5px" }}>
                            {[drill.category, drill.level].filter(Boolean).join(" • ")}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleRemoveDrill(drill.id)}
                        style={{
                          padding: "5px 10px",
                          backgroundColor: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        Премахни
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Save Training Button */}
              <button
                onClick={handleSaveTraining}
                disabled={submitting || selectedDrills.length === 0}
                style={{
                  padding: "12px 24px",
                  backgroundColor: submitting || selectedDrills.length === 0 ? "#ccc" : "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: submitting || selectedDrills.length === 0 ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "bold",
                }}
              >
                {submitting ? "Запазване..." : "Запази тренировка"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
