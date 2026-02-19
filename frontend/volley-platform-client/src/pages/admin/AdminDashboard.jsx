// src/pages/admin/AdminDashboard.jsx
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <div style={{ padding: 20 }}>
      <h2>Админ панел</h2>
      <ul style={{ lineHeight: "2" }}>
        <li>
          <Link to="/admin/coaches">Треньори (създаване)</Link>
        </li>
        <li>
          <Link to="/admin/pending">Упражнения за одобрение</Link>
        </li>
        <li>
          <Link to="/admin/clubs">Клубове</Link>
        </li>
      </ul>
    </div>
  );
}
