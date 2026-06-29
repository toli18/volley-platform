import { forwardRef, useId } from "react";
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
    id,
    children,
    ...props
  },
  ref
) {
  const Comp = as;
  const autoId = useId();
  const controlId = id || autoId;
  const errorId = error ? `${controlId}-error` : undefined;
  const hintId = hint && !error ? `${controlId}-hint` : undefined;

  return (
    <div className={cx("uiField", className)}>
      {label && (
        <label className="uiFieldLabel" htmlFor={controlId}>
          {label}
        </label>
      )}
      <Comp
        ref={ref}
        id={controlId}
        className={cx("uiControl", error && "uiControl--error", inputClassName)}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={errorId || hintId}
        {...props}
      >
        {children}
      </Comp>
      {error ? (
        <div className="uiFieldError" id={errorId}>
          {error}
        </div>
      ) : hint ? (
        <div className="uiFieldHint" id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
});

export default Input;

