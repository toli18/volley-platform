import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../utils/apiClient";

function drillTitle(d) {
  return String(d?.title || d?.name || `Упражнение #${d?.id || "?"}`);
}

export default function DrillMultiSelect({ value = [], onChange, placeholder = "Търси упражнение по име…" }) {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await apiJson("/drills/");
        if (!cancelled) setDrills(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setDrills([]);
          setError(e?.message || "Грешка при зареждане на упражнения.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIds = useMemo(() => new Set(value.map((x) => Number(x.id))), [value]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return drills
      .filter((d) => !selectedIds.has(Number(d.id)))
      .filter((d) => {
        if (!qq) return true;
        const hay = `${drillTitle(d)} ${d?.category || ""} ${d?.level || ""}`.toLowerCase();
        return hay.includes(qq);
      })
      .slice(0, 12);
  }, [drills, q, selectedIds]);

  const add = (d) => {
    onChange?.([...value, { id: Number(d.id), title: drillTitle(d) }]);
    setQ("");
    setOpen(false);
  };

  const remove = (id) => {
    onChange?.(value.filter((x) => Number(x.id) !== Number(id)));
  };

  return (
    <div className="clubHeadDrillSelect">
      {value.length ? (
        <div className="clubHeadDrillChips">
          {value.map((d) => (
            <button
              key={d.id}
              type="button"
              className="clubHeadDrillChip"
              onClick={() => remove(d.id)}
              title="Премахни"
            >
              <span>{d.title}</span>
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="clubHeadDrillSearchWrap">
        <input
          className="uiInput"
          type="search"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {open ? (
          <div className="clubHeadDrillDropdown" role="listbox">
            {loading ? <div className="clubHeadDrillDropdownEmpty">Зареждане…</div> : null}
            {!loading && error ? <div className="clubHeadDrillDropdownEmpty">{error}</div> : null}
            {!loading && !error && filtered.length === 0 ? (
              <div className="clubHeadDrillDropdownEmpty">Няма съвпадения</div>
            ) : null}
            {!loading &&
              filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="clubHeadDrillOption"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(d)}
                >
                  <strong>{drillTitle(d)}</strong>
                  <span>
                    {[d.category, d.level].filter(Boolean).join(" · ") || `#${d.id}`}
                  </span>
                </button>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
