import "./ui.css";

export function Table({ children, className = "", ...props }) {
  return (
    <div className="uiTableWrap">
      <table className={`uiTable ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, ...props }) {
  return <thead {...props}>{children}</thead>;
}

export function TableBody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>;
}

export function TableRow({ children, ...props }) {
  return <tr {...props}>{children}</tr>;
}

export function TableHead({ children, className = "", ...props }) {
  return (
    <th className={`uiTableHead ${className}`.trim()} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", ...props }) {
  return (
    <td className={`uiTableCell ${className}`.trim()} {...props}>
      {children}
    </td>
  );
}
