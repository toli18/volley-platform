import Input from "./Input";
import "./ui.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function SearchField({ className = "", inputClassName = "", ...props }) {
  return (
    <div className={cx("uiSearchField", className)}>
      <svg className="uiSearchFieldIcon" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <Input {...props} inputClassName={cx("uiSearchFieldControl", inputClassName)} />
    </div>
  );
}
