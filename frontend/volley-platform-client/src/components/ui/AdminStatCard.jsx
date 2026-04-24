import "./ui.css";
import Card from "./Card";

export default function AdminStatCard({ title, children }) {
  return (
    <Card title={title} className="uiAdminStatCard">
      {children}
    </Card>
  );
}
