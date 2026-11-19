import "./assessment.css";

/**
 * Clean SVG radar (spider) chart for domain scores 0–100.
 * axes: [{ label, value }]
 */
export default function DevelopmentRadarChart({ axes = [], size = 220 }) {
  const points = (Array.isArray(axes) ? axes : [])
    .map((a) => ({
      label: String(a.label || a.domain || "").trim(),
      value: Math.max(0, Math.min(100, Number(a.value ?? a.normalized) || 0)),
    }))
    .filter((a) => a.label)
    .slice(0, 6);

  if (points.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const n = points.length;

  const polar = (i, r) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const ringPath = (pct) =>
    points
      .map((_, i) => {
        const [x, y] = polar(i, radius * pct);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  const dataPath =
    points
      .map((p, i) => {
        const [x, y] = polar(i, radius * (p.value / 100));
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  return (
    <div className="devRadarWrap" aria-hidden={false}>
      <svg
        className="devRadarSvg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Радарна диаграма на показателите"
      >
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <path key={pct} className="devRadarRing" d={ringPath(pct)} />
        ))}
        {points.map((_, i) => {
          const [x, y] = polar(i, radius);
          return <line key={i} className="devRadarAxis" x1={cx} y1={cy} x2={x} y2={y} />;
        })}
        <path className="devRadarArea" d={dataPath} />
        <path className="devRadarOutline" d={dataPath} />
        {points.map((p, i) => {
          const [x, y] = polar(i, radius * (p.value / 100));
          return <circle key={`d-${i}`} className="devRadarDot" cx={x} cy={y} r={3.5} />;
        })}
        {points.map((p, i) => {
          const [x, y] = polar(i, radius + 18);
          return (
            <text key={`t-${i}`} className="devRadarLabel" x={x} y={y} textAnchor="middle" dominantBaseline="middle">
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
