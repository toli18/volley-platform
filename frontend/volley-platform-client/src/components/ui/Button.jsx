import "./ui.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function Button({
  as: Comp = "button",
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  type,
  children,
  ...props
}) {
  const resolvedType = Comp === "button" ? type || "button" : undefined;

  return (
    <Comp
      type={resolvedType}
      className={cx("uiButton", `uiButton--${variant}`, `uiButton--${size}`, block && "uiButton--block", className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

