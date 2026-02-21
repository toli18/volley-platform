import { forwardRef } from "react";
import "./ui.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const Input = forwardRef(function Input(
  {
    as = "input",
    label,
    hint,
    error,
    className = "",
    inputClassName = "",
    children,
    ...props
  },
  ref
) {
  const Comp = as;

  return (
    <div className={cx("uiField", className)}>
      {label && <label className="uiFieldLabel">{label}</label>}
      <Comp ref={ref} className={cx("uiControl", error && "uiControl--error", inputClassName)} {...props}>
        {children}
      </Comp>
      {error ? <div className="uiFieldError">{error}</div> : hint ? <div className="uiFieldHint">{hint}</div> : null}
    </div>
  );
});

export default Input;

