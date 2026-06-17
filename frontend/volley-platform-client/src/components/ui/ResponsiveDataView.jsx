/**
 * Shows card list on narrow screens and table (children) from md breakpoint up.
 */
export default function ResponsiveDataView({ items, renderMobileCard, children, className = "" }) {
  if (!items?.length) return null;

  return (
    <div className={className}>
      <div className="md:hidden space-y-3">{items.map(renderMobileCard)}</div>
      <div className="hidden md:block">{children}</div>
    </div>
  );
}
