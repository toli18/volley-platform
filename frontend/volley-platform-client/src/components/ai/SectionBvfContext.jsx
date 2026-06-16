export function SectionBvfContext({ guide, bvfBlock }) {
  if (!guide && !bvfBlock) return null;
  const segments = guide?.segments || [];

  return (
    <div className="aiGenSectionBvf">
      {bvfBlock ? (
        <span className="aiGenSectionBvfBadge">{bvfBlock}</span>
      ) : null}
      {guide?.goal ? <p className="aiGenSectionBvfGoal">{guide.goal}</p> : null}
      {segments.length ? (
        <ul className="aiGenSectionBvfTimeline">
          {segments.map((s, i) => (
            <li key={i}>
              <span className="aiGenTimelineTime">{s.time}</span> {s.label}
            </li>
          ))}
        </ul>
      ) : guide?.timelineHint ? (
        <p className="aiGenSectionBvfHint">{guide.timelineHint}</p>
      ) : null}
    </div>
  );
}
