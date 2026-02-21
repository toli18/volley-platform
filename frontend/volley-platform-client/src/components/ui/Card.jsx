import "./ui.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function Card({
  as = "section",
  title,
  subtitle,
  actions,
  tone = "default",
  padded = true,
  className = "",
  children,
  ...props
}) {
  const Component = as;

  return (
    <Component className={cx("uiCard", tone !== "default" && `uiCard--${tone}`, padded && "uiCard--padded", className)} {...props}>
      {(title || subtitle || actions) && (
        <div className="uiCardHeader">
          <div className="uiCardTitleWrap">
            {title ? <h3 className="uiCardTitle">{title}</h3> : null}
            {subtitle ? <p className="uiCardSubtitle">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Component>
  );
}

