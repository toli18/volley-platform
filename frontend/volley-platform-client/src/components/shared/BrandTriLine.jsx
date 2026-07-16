export default function BrandTriLine({ className = "" }) {
  return (
    <span className={`brandTriLine${className ? ` ${className}` : ""}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
