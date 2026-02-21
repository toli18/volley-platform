// src/pages/admin/AdminDashboard.jsx
import { Link } from "react-router-dom";
import { Button, Card } from "../../components/ui";

export default function AdminDashboard() {
  const links = [
    { to: "/admin/coaches", label: "Треньори (създаване)" },
    { to: "/admin/drills", label: "Всички упражнения (редакция / изтриване)" },
    { to: "/admin/pending", label: "Упражнения за одобрение" },
    { to: "/admin/articles", label: "Всички статии (редакция / изтриване)" },
    { to: "/admin/articles/pending", label: "Статии за одобрение" },
    { to: "/admin/clubs", label: "Клубове" },
  ];

  return (
    <div className="uiPage">
      <h2 style={{ margin: 0 }}>Админ панел</h2>
      <Card>
        <div style={{ display: "grid", gap: 8 }}>
          {links.map((item) => (
            <Button key={item.to} as={Link} to={item.to} variant="secondary">
              {item.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
